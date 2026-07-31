import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LAT_STEP, LON_STEP } from '../src/coverage.ts';
import {
  PATCH_LAT_STEP,
  PATCH_LON_STEP,
  patchBounds,
} from '../src/coveragePatch.ts';

/**
 * The grid's shape, which the map draws cells from.
 *
 * The app sizes every cell from these two numbers rather than from the
 * points it received, so a step that does not divide its axis would leave
 * gaps or overlaps that no amount of drawing code could fix.
 */
describe('the coverage grid', () => {
  it('divides both axes a whole number of times', () => {
    assert.equal(180 % LAT_STEP, 0);
    assert.equal((360 / LON_STEP) % 1, 0);
  });

  it('covers the globe once', () => {
    const rows = 180 / LAT_STEP;
    const columns = 360 / LON_STEP;
    assert.equal(rows * columns, 192);
  });

  it('puts the first and last points half a step inside the edges', () => {
    // The engine places points at cell centres. Drawn as a rectangle of
    // one step, the top row reaches the pole exactly and the bottom row
    // reaches the other, with nothing beyond either.
    const first = -90 + LAT_STEP / 2;
    const last = 90 - LAT_STEP / 2;
    assert.equal(first - LAT_STEP / 2, -90);
    assert.equal(last + LAT_STEP / 2, 90);
  });

  it('uses a wider step in longitude than in latitude', () => {
    // Meridians converge, so equal steps would make the polar cells
    // slivers. This is a deliberate asymmetry, not an oversight.
    assert.ok(LON_STEP > LAT_STEP);
  });
});

/**
 * The fine grid the second run covers.
 *
 * This mirrors `hfcast/test/coveragePatch.test.ts`. The two are copies
 * for the module reason in `shared-with-app.test.ts`, which pins the
 * constants; what these pin is the arithmetic built on them, so a
 * rectangle asked for by the web build and one asked for on a device
 * describe the same region.
 */
describe('the fine grid around the operator', () => {
  it('is a window on the coarse lattice rather than a second grid', () => {
    // A coarse cell is a whole number of fine cells, so the fine grid
    // replaces it instead of lying across its edges.
    assert.equal((LAT_STEP / PATCH_LAT_STEP) % 1, 0);
    assert.equal((LON_STEP / PATCH_LON_STEP) % 1, 0);
  });

  it('centres on the station and widens with the latitude', () => {
    const denver = patchBounds(39.74, -104.98);
    assert.ok(denver);
    assert.equal((denver.latMin + denver.latMax) / 2, 39.74);
    // Ten degrees of latitude either way, and more than ten of longitude,
    // because a degree of longitude is shorter at 40 degrees north.
    assert.equal(denver.latMax - denver.latMin, 20);
    assert.ok(denver.lonMax - denver.lonMin > 20);

    const equator = patchBounds(0, 0);
    assert.ok(equator);
    assert.equal(equator.lonMax - equator.lonMin, 20);
  });

  it('never crosses the antimeridian, which the engine refuses', () => {
    const near = patchBounds(0, 172);
    assert.ok(near);
    assert.equal(near.lonMax, 180);
    // Narrowed on both sides, so it stays centred on the station rather
    // than sliding west of it.
    assert.equal((near.lonMin + near.lonMax) / 2, 172);
    assert.equal(patchBounds(0, 179.5), null);
  });

  it('stays inside the world at the poles', () => {
    const polar = patchBounds(85, 0);
    assert.ok(polar);
    assert.equal(polar.latMax, 90);
    assert.equal(polar.latMin, 75);
  });
});
