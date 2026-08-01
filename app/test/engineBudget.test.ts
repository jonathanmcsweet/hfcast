import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FINE_GRID_POINTS,
  MAX_THREADS,
  STRIPS_PER_THREAD,
  stripsFor,
  threadsFor,
} from '../src/data/engineBudget.ts';
import {
  FINE_LAT_STEP,
  FINE_LON_STEP,
  FINE_POINTS,
} from '../src/data/fineGlobe.ts';
import { latShards, MIN_SHARD_POINTS, pointCount } from '../src/data/shard.ts';

/**
 * This file used to test a decision as well: whether a device was fast
 * enough to be given the whole-world grid. Every device runs it now
 * (user, 2026-08-01), so the probes, the fitted cost line, the budget
 * and the store that remembered the readings are all gone, and their
 * tests with them. Git history holds them.
 *
 * What is left is the cutting, which is arithmetic rather than judgement
 * and is still load-bearing: get the strip count wrong and the grid
 * either runs on one core or comes back in pieces that do not join.
 */

describe('sizing the batch to the device that runs it', () => {
  it('uses every core it is told about, up to a limit', () => {
    assert.equal(threadsFor(8), 8);
    assert.equal(threadsFor(6), 6);
    assert.equal(threadsFor(16), MAX_THREADS);
  });

  it('never asks for fewer than two', () => {
    // A device reporting one core is more likely to be reporting badly
    // than to have one, and two strips on one core cost only the second
    // strip's coefficient load.
    assert.equal(threadsFor(1), 2);
    assert.equal(threadsFor(0), 4);
    assert.equal(threadsFor(Number.NaN), 4);
    assert.equal(threadsFor(-3), 4);
  });

  it('cuts more strips than there are threads', () => {
    // So a fast core that finishes early takes the next strip off the
    // queue instead of waiting for a slow one. On a big.LITTLE phone the
    // slow cores take two to three times as long over the same strip,
    // and one strip per thread would end the run at their pace.
    assert.equal(stripsFor(8), 8 * STRIPS_PER_THREAD);
    assert.ok(stripsFor(8) > threadsFor(8));
    assert.ok(STRIPS_PER_THREAD >= 2);
  });

  it('cuts whole strips', () => {
    for (const cores of [1, 2, 3, 4, 6, 8, 12, 16]) {
      assert.equal(stripsFor(cores) % 1, 0, `${cores}`);
      assert.equal(stripsFor(cores) % threadsFor(cores), 0, `${cores}`);
    }
  });
});

describe('cutting the whole-world grid across the cores', () => {
  it('counts the same grid the packing does', () => {
    // Repeated rather than imported so the budget module stands alone.
    // This is what keeps the two copies honest.
    assert.equal(FINE_GRID_POINTS, FINE_POINTS);
  });

  it('covers every point the grid is said to cover', () => {
    // The engine snaps a step to a whole number of bands. Where it snaps
    // to something other than the step asked for, the constant above
    // would describe a grid the engine does not run.
    assert.equal(
      pointCount(undefined, FINE_LAT_STEP, FINE_LON_STEP),
      FINE_POINTS,
    );
  });

  it('cuts it into exactly the strips the device asked for', () => {
    // The strips are reassembled by concatenation, in the order they
    // were requested. A cut that produced a different number of pieces
    // than the caller expects would join into a grid that looks
    // ordinary and is displaced everywhere.
    for (const cores of [2, 4, 8, 16]) {
      const strips = latShards(
        undefined,
        FINE_LAT_STEP,
        FINE_LON_STEP,
        stripsFor(cores),
      );
      assert.ok(strips !== null, `${cores} cores`);
      assert.equal(strips.length, stripsFor(cores), `${cores} cores`);
    }
  });

  it('stays well above the size where sharding stops paying', () => {
    // Below this the per-strip coefficient loads are most of the run and
    // splitting it makes it slower.
    assert.ok(FINE_POINTS > MIN_SHARD_POINTS);
  });
});
