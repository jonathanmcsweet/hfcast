import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TtlCache } from '../src/cache.ts';

/**
 * The cache in front of every engine run.
 *
 * What is checked here is not that it remembers — that is a Map — but
 * that it collapses requests which arrive together. A coverage run at the
 * fine step is up to eight processes, and nothing upstream stops two
 * readers asking for the same map at the same moment.
 */

/** A producer that answers only when it is told to. */
function held<T>(value: T) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  return {
    calls: () => calls,
    release,
    produce: async () => {
      calls += 1;
      await gate;
      return value;
    },
  };
}

describe('the cache in front of the engine', () => {
  it('answers a second caller from the first, once it has run', async () => {
    const cache = new TtlCache<number>(60_000);
    const run = held(7);
    run.release();
    assert.equal(await cache.fetch('k', run.produce), 7);
    assert.equal(await cache.fetch('k', run.produce), 7);
    assert.equal(run.calls(), 1);
  });

  it('runs once for callers that arrive together', async () => {
    // The case a plain get-run-set misses entirely: nothing is in the
    // cache yet, because the first run has not finished, so every caller
    // starts one of its own.
    const cache = new TtlCache<number>(60_000);
    const run = held(42);

    const waiting = [
      cache.fetch('same', run.produce),
      cache.fetch('same', run.produce),
      cache.fetch('same', run.produce),
    ];
    assert.equal(cache.running, 1);

    run.release();
    assert.deepEqual(await Promise.all(waiting), [42, 42, 42]);
    assert.equal(run.calls(), 1);
    // Nothing left running, and the answer kept for the next caller.
    assert.equal(cache.running, 0);
    assert.equal(cache.size, 1);
  });

  it('keeps different keys apart', async () => {
    const cache = new TtlCache<string>(60_000);
    const a = held('a');
    const b = held('b');
    const waiting = [cache.fetch('a', a.produce), cache.fetch('b', b.produce)];
    assert.equal(cache.running, 2);
    a.release();
    b.release();
    assert.deepEqual(await Promise.all(waiting), ['a', 'b']);
  });

  it('does not remember a failure', async () => {
    // A rejection shared with everyone waiting is right; a rejection
    // served to everyone who comes later is not. The engine failing once
    // must not close the key for the rest of its lifetime.
    const cache = new TtlCache<string>(60_000);
    let attempts = 0;
    const flaky = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('engine refused');
      return 'second time';
    };

    await assert.rejects(cache.fetch('k', flaky), /engine refused/);
    assert.equal(cache.running, 0);
    assert.equal(await cache.fetch('k', flaky), 'second time');
    assert.equal(attempts, 2);
  });

  it('gives every waiter the same failure', async () => {
    const cache = new TtlCache<string>(60_000);
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failing = async () => {
      calls += 1;
      await gate;
      throw new Error('engine refused');
    };

    const waiting = [
      assert.rejects(cache.fetch('k', failing), /engine refused/),
      assert.rejects(cache.fetch('k', failing), /engine refused/),
    ];
    release();
    await Promise.all(waiting);
    assert.equal(calls, 1);
  });

  it('runs again once the entry has expired', async () => {
    const cache = new TtlCache<number>(0);
    const first = held(1);
    first.release();
    assert.equal(await cache.fetch('k', first.produce), 1);
    const second = held(2);
    second.release();
    assert.equal(await cache.fetch('k', second.produce), 2);
  });
});
