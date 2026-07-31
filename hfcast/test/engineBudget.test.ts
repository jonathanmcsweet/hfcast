import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FINE_BUDGET_MS,
  FINE_GRID_POINTS,
  fineGlobeAffordable,
  medianOf,
  projectedFineMs,
  STRIP_SPEEDUP,
} from '../src/data/engineBudget.ts';
import { FINE_POINTS } from '../src/data/fineGlobe.ts';

/**
 * Costs per point measured on this desktop, and the device multiples
 * the plan records: a current phone is 1.7 to 3.4 times this desktop,
 * quad-A53 tablets roughly 8 to 12 times.
 *
 * The desktop figure comes from the whole-world fine run: 1,353 ms for
 * 34,560 points on one process.
 */
const DESKTOP_MS_PER_POINT = 1353 / 34560;

describe('deciding whether a device can afford the fine grid', () => {
  it('counts the same grid the packing does', () => {
    // Repeated rather than imported so the budget module stands alone.
    // This is what keeps the two copies honest.
    assert.equal(FINE_GRID_POINTS, FINE_POINTS);
  });

  it('says yes to this desktop and to a current phone', () => {
    assert.ok(fineGlobeAffordable(DESKTOP_MS_PER_POINT));
    // The slow end of "a current phone", 3.4 times this desktop.
    assert.ok(fineGlobeAffordable(DESKTOP_MS_PER_POINT * 3.4));
  });

  it('says no to a quad-A53 tablet', () => {
    // 8 times this desktop is the optimistic end of that class, and it
    // is already over budget. This is the case the gate exists for.
    assert.equal(fineGlobeAffordable(DESKTOP_MS_PER_POINT * 8), false);
    assert.equal(fineGlobeAffordable(DESKTOP_MS_PER_POINT * 12), false);
  });

  it('says no before anything has been measured', () => {
    // The safe direction. Starting on would make every unknown device,
    // including every slow one, take the full run once to find out.
    assert.equal(fineGlobeAffordable(null), false);
    assert.equal(projectedFineMs(null), null);
  });

  it('refuses a measurement that is not one', () => {
    // A zero or a negative reading would project to nothing and turn
    // the grid on everywhere.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(projectedFineMs(bad), null, `${bad}`);
      assert.equal(fineGlobeAffordable(bad), false, `${bad}`);
    }
  });

  it('projects the time the strips are expected to leave', () => {
    const projected = projectedFineMs(DESKTOP_MS_PER_POINT);
    assert.ok(projected !== null);
    assert.equal(projected, (1353 * 34560) / 34560 / STRIP_SPEEDUP);
    // Which is well inside the budget, as measured: 376 ms in four
    // strips against a 2,500 ms allowance.
    assert.ok(projected < FINE_BUDGET_MS);
  });

  it('finds the boundary where the answer turns over', () => {
    // Written as a search rather than a constant so the number cannot
    // silently drift when a budget or a speedup changes.
    const limit = (FINE_BUDGET_MS * STRIP_SPEEDUP) / FINE_GRID_POINTS;
    assert.ok(fineGlobeAffordable(limit));
    assert.equal(fineGlobeAffordable(limit * 1.001), false);
    // As a multiple of this desktop, so it can be compared with a
    // device: about five times slower is where it stops.
    assert.ok(limit / DESKTOP_MS_PER_POINT > 4);
    assert.ok(limit / DESKTOP_MS_PER_POINT < 6);
  });
});

describe('smoothing the readings', () => {
  it('has no answer before the first run', () => {
    assert.equal(medianOf([]), null);
  });

  it('ignores one run that landed while the device was busy', () => {
    // The reason this is a median and not the newest reading or a mean.
    // A thermally throttled run must not turn the feature off for a
    // device that is otherwise capable of it.
    const steady = [0.04, 0.041, 0.039, 0.04, 0.042];
    const withSpike = [...steady, 4.0];
    assert.ok(Math.abs((medianOf(withSpike) ?? 0) - 0.04) < 0.005);
    assert.ok(fineGlobeAffordable(medianOf(withSpike)));
    // A mean would have been dragged over the line by that one run.
    const mean = withSpike.reduce((a, b) => a + b, 0) / withSpike.length;
    assert.equal(fineGlobeAffordable(mean), false);
  });

  it('takes the middle of an even count', () => {
    assert.equal(medianOf([1, 2, 3, 4]), 2.5);
  });

  it('does not care what order the readings arrived in', () => {
    assert.equal(medianOf([5, 1, 3]), medianOf([1, 3, 5]));
  });
});
