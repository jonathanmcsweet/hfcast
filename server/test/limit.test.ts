import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Slots } from '../src/limit.ts';

/**
 * The gate in front of the engine.
 *
 * Every prediction and every strip of a split grid is a process, and
 * before this existed nothing counted them: `/api/coverage/fine` splits
 * across up to eight, so ten callers together forked eighty.
 */

/** Work that finishes only when it is told to, and says it started. */
function held() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  return {
    started: () => started,
    release,
    work: async () => {
      started += 1;
      await gate;
      return started;
    },
  };
}

/** Lets everything already queued in the microtask queue run. */
const settle = () => new Promise<void>((resume) => setImmediate(resume));

describe('bounding how many engine runs happen at once', () => {
  it('lets the first `count` in and holds the rest', async () => {
    const slots = new Slots(2);
    const job = held();

    const all = [1, 2, 3, 4, 5].map(() => slots.run(job.work));
    await settle();

    assert.equal(job.started(), 2, 'only two ran');
    assert.equal(slots.free, 0);
    assert.equal(slots.waiting, 3);

    job.release();
    await Promise.all(all);
    assert.equal(job.started(), 5, 'the rest ran after');
    assert.equal(slots.free, 2, 'every slot given back');
    assert.equal(slots.waiting, 0);
  });

  it('gives the slot back when the work throws', async () => {
    // A refused run must not take a slot with it. Otherwise a host that
    // has lost its engine binary stops answering entirely rather than
    // failing each request.
    const slots = new Slots(1);
    await assert.rejects(
      slots.run(async () => {
        throw new Error('predict failed');
      }),
      /predict failed/,
    );
    assert.equal(slots.free, 1);
    assert.equal(await slots.run(async () => 'after'), 'after');
  });

  it('releases waiters in the order they arrived', async () => {
    // A request that waited through a fine grid should be answered
    // before one that arrived while it waited. Counting the slot back up
    // and racing for it would not give that.
    const slots = new Slots(1);
    const order: number[] = [];
    let release: () => void = () => {};
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });

    const held0 = slots.run(async () => {
      await first;
      order.push(0);
    });
    await settle();

    const rest = [1, 2, 3].map((n) =>
      slots.run(async () => {
        order.push(n);
      })
    );
    await settle();
    assert.equal(slots.waiting, 3);

    release();
    await Promise.all([held0, ...rest]);
    assert.deepEqual(order, [0, 1, 2, 3]);
  });

  it('runs everything when there is no contention', async () => {
    const slots = new Slots(4);
    const answers = await Promise.all(
      [1, 2, 3].map((n) => slots.run(async () => n * 2)),
    );
    assert.deepEqual(answers, [2, 4, 6]);
    assert.equal(slots.free, 4);
  });
});
