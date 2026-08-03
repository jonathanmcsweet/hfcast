import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { gridPoints } from '../src/data/cellField.ts';
import {
  FINE_LAT_STEP,
  FINE_LON_STEP,
  FINE_POINTS,
  globeBytes,
  packGlobe,
} from '../src/data/fineGlobe.ts';
import type { Coverage, CoveragePoint } from '../src/data/types.ts';

/**
 * A whole-world grid in the order the engine emits one: rows south to
 * north, points within a row west to east, cell centres inset by half a
 * step from the edges.
 *
 * The order is the whole reason the columnar store works, so it is
 * written out here rather than assumed. `server/test/engine.test.ts`
 * checks the same order against the real binary.
 */
function worldGrid(latStep: number, lonStep: number): CoveragePoint[] {
  const ny = 180 / latStep;
  const nx = 360 / lonStep;
  return Array.from(
    { length: ny },
    (_, row) =>
      Array.from({ length: nx }, (_, column) => ({
        lat: -90 + (row + 0.5) * latStep,
        lon: -180 + (column + 0.5) * lonStep,
        reliability: (row * nx + column) / (ny * nx),
        takeoffAngleDeg: 10 + (row % 7),
      })),
  ).flat();
}

const asCoverage = (points: CoveragePoint[]): Coverage => ({
  band: '30m',
  hour: 16,
  latStep: FINE_LAT_STEP,
  lonStep: FINE_LON_STEP,
  reach: 0,
  basis: 'climatology',
  points,
});

describe('packing the whole-world fine grid', () => {
  const points = worldGrid(FINE_LAT_STEP, FINE_LON_STEP);
  const grid = packGlobe('30m', 16, asCoverage(points));

  it('reads the lattice off the points rather than assuming it', () => {
    assert.equal(points.length, FINE_POINTS);
    assert.equal(points.length, 34560);
    assert.equal(grid.nx, 240);
    assert.equal(grid.ny, 144);
    assert.equal(grid.latStep, FINE_LAT_STEP);
    assert.equal(grid.lonStep, FINE_LON_STEP);
    assert.equal(grid.latMin, -89.375);
    assert.equal(grid.lonMin, -179.25);
  });

  it('costs a few hundred kilobytes rather than tens of megabytes', () => {
    // Two Float32Arrays of 34,560. The point of the whole exercise: as
    // objects this would be tens of MB, and the map holds several hours.
    assert.equal(globeBytes(grid), 34560 * 4 * 2);
    assert.ok(globeBytes(grid) < 300_000);
  });

  it('reads every point back exactly where it went in', () => {
    // An off-by-one in either direction would move the whole map by a
    // cell, growing with distance — a map that looks entirely ordinary
    // and is wrong everywhere. So this checks all 34,560, not a sample.
    const read = [...gridPoints(grid)];
    assert.equal(read.length, points.length);

    for (let i = 0; i < points.length; i += 1) {
      const want = points[i] as CoveragePoint;
      const got = read[i] as CoveragePoint;
      assert.ok(
        Math.abs(got.lat - want.lat) < 1e-9,
        `lat at ${i}: ${got.lat} not ${want.lat}`,
      );
      assert.ok(
        Math.abs(got.lon - want.lon) < 1e-9,
        `lon at ${i}: ${got.lon} not ${want.lon}`,
      );
      // Float32 carries about seven digits, which is far more than a
      // reliability needs — it decides one of four colours.
      assert.ok(Math.abs(got.reliability - want.reliability) < 1e-6);
    }
  });

  it('refuses a grid that is not rectangular', () => {
    // Better to fail where it can be seen than to draw a displaced map.
    assert.throws(
      () => packGlobe('30m', 16, asCoverage(points.slice(0, 34559))),
      /not rectangular/,
    );
  });

  it('refuses an empty grid', () => {
    assert.throws(() => packGlobe('30m', 16, asCoverage([])), /no points/);
  });

  it('packs a coarser lattice by the same rule', () => {
    // The row width is counted, not assumed, so the same function reads
    // any rectangular grid the engine snaps to.
    const coarse = packGlobe('30m', 16, asCoverage(worldGrid(15, 22.5)));
    assert.equal(coarse.nx, 16);
    assert.equal(coarse.ny, 12);
    assert.equal(coarse.latStep, 15);
  });
});
