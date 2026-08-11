import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BACKGROUND_PIECE_POINTS,
  dropLater,
  queueDepth,
  runLater,
  runNow,
  wasDropped,
} from '../src/data/engineQueue.ts';

/**
 * What the queue in front of the engine has to guarantee.
 *
 * The engine module runs one request at a time and cannot be
 * interrupted, so everything here is about what starts next. A previous
 * attempt at filling bands in behind the map made a band change take
 * about 30 seconds against 3.4 for the run alone, because background
 * work went into the same queue as the reader's own and got there first.
 *
 * These are the properties that stop that happening again. They matter
 * more than most tests in this project: the failure they prevent is not
 * a wrong number, it is an application that stops answering.
 */

/** A piece of work that finishes when the test says so. */
function held<T>(value: T) {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((go) => {
    release = go;
  });
  return {
    work: async () => {
      await gate;
      return value;
    },
    release: () => (release as () => void)(),
  };
}

/** Lets every promise that is ready settle. */
const settle = () => new Promise<void>((go) => setImmediate(go));

describe('the queue in front of the engine', () => {
  it('runs one piece at a time', async () => {
    const first = held('a');
    const second = held('b');
    const order: string[] = [];

    const a = runNow(first.work).then((v) => order.push(v));
    const b = runNow(second.work).then((v) => order.push(v));
    await settle();

    // The second has not started: the first is still holding the engine.
    assert.deepEqual(order, []);
    first.release();
    await a;
    second.release();
    await b;
    assert.deepEqual(order, ['a', 'b']);
  });

  it("puts the reader's work in front of background work", async () => {
    const busy = held('busy');
    const order: string[] = [];

    // The engine is occupied, then three pieces queue up behind it:
    // background, background, and then the reader's own.
    const running = runNow(busy.work).then((v) => order.push(v));
    const one = runLater('fill', async () => 'later-1').then((v) =>
      order.push(v)
    );
    const two = runLater('fill', async () => 'later-2').then((v) =>
      order.push(v)
    );
    const urgent = runNow(async () => 'now').then((v) => order.push(v));
    await settle();

    busy.release();
    await Promise.all([running, one, two, urgent]);

    // The reader's request was asked for last and ran first of the three
    // that were waiting.
    assert.deepEqual(order, ['busy', 'now', 'later-1', 'later-2']);
  });

  it('gives up background work that has not started', async () => {
    const busy = held('busy');
    const running = runNow(busy.work);

    let ran = false;
    const dropped = runLater('fill', async () => {
      ran = true;
      return 'later';
    });
    await settle();

    assert.equal(dropLater('fill'), 1);
    await assert.rejects(dropped, (e: unknown) => wasDropped(e));

    busy.release();
    await running;
    await settle();
    assert.equal(ran, false, 'a dropped piece was run anyway');
  });

  it('leaves another group alone when one is given up', async () => {
    const busy = held('busy');
    const running = runNow(busy.work);
    const kept = runLater('other', async () => 'kept');
    const doomed = runLater('fill', async () => 'doomed');
    await settle();

    assert.equal(dropLater('fill'), 1);
    await assert.rejects(doomed, (e: unknown) => wasDropped(e));

    busy.release();
    await running;
    assert.equal(await kept, 'kept');
  });

  it('keeps going after a piece fails', async () => {
    // A failed run must not leave the engine marked busy for ever. That
    // would be an application that stops answering, which is worse than
    // any wrong answer it could have given.
    await assert.rejects(runNow(async () => {
      throw new Error('the engine refused');
    }));
    assert.equal(await runNow(async () => 'after'), 'after');
    assert.deepEqual(queueDepth(), { now: 0, later: 0 });
  });

  it('empties completely', async () => {
    await runNow(async () => 'a');
    await runLater('fill', async () => 'b');
    assert.deepEqual(queueDepth(), { now: 0, later: 0 });
  });

  it('bounds a background piece to something a reader can wait out', () => {
    // The whole delay background work can impose is one piece of it.
    // A phone core is perhaps six times slower than a desktop one, and
    // an area point is about 0.03 ms there, so this is the number that
    // decides whether a scrub started at the wrong moment still feels
    // like a scrub.
    const msOnAPhone = (BACKGROUND_PIECE_POINTS * 0.03 * 6) / 1000;
    assert.equal(
      msOnAPhone < 0.5,
      true,
      `one background piece is about ${msOnAPhone.toFixed(2)} s`,
    );
  });
});
