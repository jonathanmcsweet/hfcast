import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sleep } from '../src/data/sleep.ts';

/**
 * Waiting that can be given up on.
 *
 * The claim worth testing is the one the compute-ahead job rests on:
 * that pressing Stop is felt at once rather than at the end of the
 * current five-second step. A wait that quietly ignored its signal would
 * look identical in every other respect — the job would still stop, just
 * seconds later — so nothing but a test of the timing catches it.
 */

/** How long the call actually took, in milliseconds. */
async function timed(run: () => Promise<unknown>): Promise<number> {
  const started = Date.now();
  await run();
  return Date.now() - started;
}

describe('waiting that can be given up on', () => {
  it('waits the whole time when nothing stops it', async () => {
    const took = await timed(() => sleep(60));
    // A floor rather than a window: timers may run late on a loaded
    // machine, and a test that fails for that reason teaches nothing.
    assert.ok(took >= 50, `waited only ${took} ms`);
  });

  it('gives up as soon as it is aborted', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    const took = await timed(() => sleep(10_000, controller.signal));

    assert.ok(took < 1000, `took ${took} ms, so it sat out the sleep`);
  });

  it('returns at once when it is aborted before it starts', async () => {
    const controller = new AbortController();
    controller.abort();

    const took = await timed(() => sleep(10_000, controller.signal));

    assert.ok(took < 100, `took ${took} ms for a signal already aborted`);
  });

  it('resolves rather than rejecting, so a stop is not a failure', async () => {
    const controller = new AbortController();
    controller.abort();
    // Rejecting would make every wait a try block for something that is
    // an ordinary outcome.
    await assert.doesNotReject(() => sleep(10, controller.signal));
  });

  it('leaves no timer behind to hold the process open', async () => {
    // A cleared timeout is why the test runner exits. Without the
    // `clearTimeout` in `finish`, this test would pass and the suite
    // would hang for ten seconds at the end.
    const controller = new AbortController();
    const waited = sleep(10_000, controller.signal);
    controller.abort();
    await waited;
    assert.ok(true);
  });
});
