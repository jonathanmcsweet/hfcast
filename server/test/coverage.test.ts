import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LAT_STEP, LON_STEP } from '../src/coverage.ts';

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
