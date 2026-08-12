import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { breathe } from '../src/data/breathe.ts';

/**
 * The yield between strips, which twice stopped a job.
 *
 * The whole of the fault is in one branch: a yield taken when nothing
 * can deliver it. React Native drives `setTimeout` from the screen's
 * frame clock, Android takes that clock away when the activity pauses,
 * and a job computing maps ahead spends its life in exactly that state.
 * Taken there, the timeout never fires and the grid stops between two of
 * its sixteen strips (user, 2026-08-12).
 *
 * A test can hold the branch even where it cannot hold the platform.
 * These run under Node, where timers always fire, so what is asserted is
 * that the off-screen path never reaches a timer at all — which is the
 * property that makes the platform's behaviour stop mattering.
 */

/** How many turns of the microtask queue a promise took to settle. */
async function settledWithoutTimers(work: Promise<void>): Promise<boolean> {
  let done = false;
  void work.then(() => {
    done = true;
  });
  // Drains microtasks without letting a single macrotask through, so a
  // promise that is waiting on `setTimeout` cannot have settled here.
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

describe('the yield between strips', () => {
  it('does not wait for a timer when the app is off screen', async () => {
    // The fault, stated as a test. A timer here is one that Android will
    // never fire, so the work behind it never continues.
    assert.ok(
      await settledWithoutTimers(breathe(false)),
      'it waited for a timer while off screen, which is the state where '
        + 'no timer fires',
    );
  });

  it('does wait for one when the app is on screen', async () => {
    // The other half. Resolving at once in both cases would make the
    // interface stop answering for the whole of a 34,560 point grid,
    // which is what this yield exists to prevent.
    assert.equal(
      await settledWithoutTimers(breathe(true)),
      false,
      'it resolved without yielding, so the screen gets no frame',
    );
  });

  it('finishes either way', async () => {
    // Both branches have to settle. One that never did would hang a job
    // rather than slow it, which is worse than the fault it replaced.
    await breathe(false);
    await breathe(true);
    assert.ok(true);
  });

  it('runs a whole grid of strips off screen with no timer at all', async () => {
    // Sixteen strips a grid, and a job is hundreds of grids. This is the
    // shape of the loop in `coverFineLocally`.
    const strips = 16;
    let done = 0;
    const run = (async () => {
      for (let strip = 0; strip < strips; strip += 1) {
        await breathe(false);
        done += 1;
      }
    })();
    await run;
    assert.equal(done, strips);
  });
});
