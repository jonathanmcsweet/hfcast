import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LAT_STEP, LON_STEP } from '../src/coverage.ts';
import { PATCH_LAT_STEP, PATCH_LON_STEP } from '../src/coveragePatch.ts';
import {
  type AreaBounds,
  latShards,
  MIN_SHARD_POINTS,
  pointCount,
} from '../src/voacap/shard.ts';

/**
 * Cutting one grid into strips that run at once.
 *
 * The whole of this is whether the strips add back up to the grid. A
 * strip boundary that falls inside a row rather than between two runs
 * that row twice or not at all, and neither shows as an error — the map
 * just quietly has a stripe of nothing across it, or a stripe drawn
 * twice. So the tests here are about row arithmetic, not about speed.
 *
 * `test/engine.test.ts` runs the engine itself and compares a split grid
 * with a whole one point by point. These tests need no engine.
 */

/** The rows the engine puts on an axis, as the strips must reproduce. */
const rowsOf = (
  step: number,
  edge: number,
  span: number,
  lo: number,
  hi: number,
) => {
  const bands = Math.round(span / step);
  const width = span / bands;
  return Array.from({ length: bands }, (_, i) => edge + (i + 0.5) * width)
    .filter((centre) => centre >= lo && centre <= hi);
};

/** Every row centre a set of strips would ask the engine for. */
const coveredRows = (strips: readonly AreaBounds[], step: number) =>
  strips.flatMap((s) => rowsOf(step, -90, 180, s.latMin, s.latMax));

describe('splitting a whole-world grid', () => {
  const strips = latShards(undefined, PATCH_LAT_STEP, PATCH_LON_STEP, 8);

  it('splits the fine grid, which is what this is for', () => {
    assert.ok(strips, 'the 34,560-point grid should be split');
    assert.equal(strips.length, 8);
  });

  it('covers every row exactly once', () => {
    // The claim the whole feature rests on. A row run twice would be
    // drawn twice; a row missed would be a blank stripe across the map.
    assert.ok(strips);
    const all = rowsOf(PATCH_LAT_STEP, -90, 180, -90, 90);
    const covered = coveredRows(strips, PATCH_LAT_STEP);
    assert.equal(covered.length, all.length, 'row count');
    assert.deepEqual(
      [...covered].sort((a, b) => a - b),
      [...all].sort((a, b) => a - b),
    );
  });

  it('hands the strips over south to north', () => {
    // The engine emits rows south to north, so concatenating the
    // answers in this order gives the sequence one run would have
    // produced. Out of order, the points would still all be there and
    // the map would still be right — but nothing downstream could
    // assume the order, and a test comparing against a whole run would
    // have to sort first.
    assert.ok(strips);
    const mins = strips.map((s) => s.latMin);
    assert.deepEqual([...mins].sort((a, b) => a - b), mins);
  });

  it('leaves no gap and no overlap between neighbours', () => {
    assert.ok(strips);
    strips.slice(1).forEach((strip, i) => {
      const before = strips[i] as AreaBounds;
      assert.ok(
        strip.latMin > before.latMax,
        `strip ${i + 1} starts at ${strip.latMin}, after ${before.latMax}`,
      );
      // Less than one cell between them, so no row fell down the gap.
      assert.ok(strip.latMin - before.latMax < PATCH_LAT_STEP);
    });
  });

  it('asks every strip for the full width', () => {
    assert.ok(strips);
    const first = strips[0] as AreaBounds;
    for (const strip of strips) {
      assert.equal(strip.lonMin, first.lonMin);
      assert.equal(strip.lonMax, first.lonMax);
    }
  });

  it('stays inside the world', () => {
    assert.ok(strips);
    for (const strip of strips) {
      assert.ok(strip.latMin >= -90 && strip.latMax <= 90);
      assert.ok(strip.lonMin >= -180 && strip.lonMax <= 180);
    }
  });
});

describe('when a grid is left whole', () => {
  it('leaves the coarse map alone', () => {
    // 192 points, about 20 ms. Each strip is a process that re-reads the
    // coefficient files, so splitting this would make it slower.
    assert.equal(latShards(undefined, LAT_STEP, LON_STEP, 8), null);
  });

  it('leaves a region alone', () => {
    const bounds = { latMin: 30, latMax: 50, lonMin: -125, lonMax: -95 };
    assert.ok(
      pointCount(bounds, PATCH_LAT_STEP, PATCH_LON_STEP) < MIN_SHARD_POINTS,
    );
    assert.equal(latShards(bounds, PATCH_LAT_STEP, PATCH_LON_STEP, 8), null);
  });

  it('leaves it alone when asked for one strip', () => {
    assert.equal(latShards(undefined, PATCH_LAT_STEP, PATCH_LON_STEP, 1), null);
  });

  it('refuses a step that does not divide the world', () => {
    // The engine runs a whole-world grid down a different path from a
    // rectangle, and the two agree only where the step divides evenly.
    // At 7 degrees the world grid spaces its points 6.92 apart, so
    // strips cut on the 7-degree lattice would not reproduce it.
    assert.equal(180 % 7 === 0, false);
    assert.equal(latShards(undefined, 7, 1.5, 8), null);
  });

  it('splits a region that is big enough', () => {
    // A rectangle goes down the same path split or whole, so the only
    // question is size.
    const bounds = { latMin: -60, latMax: 60, lonMin: -170, lonMax: 170 };
    assert.ok(
      pointCount(bounds, PATCH_LAT_STEP, PATCH_LON_STEP) > MIN_SHARD_POINTS,
    );
    const strips = latShards(bounds, PATCH_LAT_STEP, PATCH_LON_STEP, 4);
    assert.ok(strips);
    const all = rowsOf(PATCH_LAT_STEP, -90, 180, bounds.latMin, bounds.latMax);
    assert.equal(coveredRows(strips, PATCH_LAT_STEP).length, all.length);
  });
});

describe('strips at awkward counts', () => {
  it('never makes a strip of one row', () => {
    // A one-row rectangle divides by zero in the engine rather than
    // returning a thin answer, so the request is never made.
    for (let shards = 2; shards <= 64; shards += 1) {
      const strips = latShards(
        undefined,
        PATCH_LAT_STEP,
        PATCH_LON_STEP,
        shards,
      );
      if (strips === null) continue;
      for (const strip of strips) {
        const rows = rowsOf(
          PATCH_LAT_STEP,
          -90,
          180,
          strip.latMin,
          strip.latMax,
        );
        assert.ok(
          rows.length >= 2,
          `${rows.length} row(s) at ${shards} shards`,
        );
      }
    }
  });

  it('covers every row once at every count it accepts', () => {
    const all = rowsOf(PATCH_LAT_STEP, -90, 180, -90, 90).length;
    for (let shards = 2; shards <= 64; shards += 1) {
      const strips = latShards(
        undefined,
        PATCH_LAT_STEP,
        PATCH_LON_STEP,
        shards,
      );
      if (strips === null) continue;
      assert.equal(
        coveredRows(strips, PATCH_LAT_STEP).length,
        all,
        `at ${shards} shards`,
      );
    }
  });

  it('spreads the rows within one of each other', () => {
    // An uneven split would leave one process running long after the
    // others finished, and the run is only as quick as its slowest
    // strip.
    const strips = latShards(undefined, PATCH_LAT_STEP, PATCH_LON_STEP, 7);
    assert.ok(strips);
    const counts = strips.map((s) =>
      rowsOf(PATCH_LAT_STEP, -90, 180, s.latMin, s.latMax).length
    );
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, counts.join(','));
  });
});
