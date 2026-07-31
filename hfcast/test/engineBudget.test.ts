import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FINE_BUDGET_MS,
  FINE_GRID_POINTS,
  fineGlobeAffordable,
  marginalMsPerPoint,
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

describe("separating a run's fixed cost from its per-point cost", () => {
  // The desktop figures this gate was corrected against: a 192-point
  // coarse run and a 34,560-point fine run, same engine, same machine.
  // Their naive per-point costs differ by 2.7 times, entirely because
  // the small run is mostly fixed cost.
  const COARSE = { points: 192, ms: 20 };
  const FINE = { points: 34560, ms: 1353 };

  it("recovers the marginal cost, not the small run's average", () => {
    const fitted = marginalMsPerPoint([COARSE, FINE]);
    assert.ok(fitted !== null);
    // 0.0388 ms a point, against 0.104 if the intercept were ignored.
    assert.ok(Math.abs(fitted - 0.0388) < 0.001, `${fitted}`);
    assert.ok(fitted < COARSE.ms / COARSE.points / 2);
  });

  it('lets a capable phone through, where the old model refused it', () => {
    // This is the defect the first version shipped with. A phone about
    // 2.5 times this desktop measures a coarse run at roughly 50 ms and
    // a patch of 640 points at roughly 94 ms.
    const phone = [{ points: 192, ms: 50 }, { points: 640, ms: 94 }];
    const fitted = marginalMsPerPoint(phone);
    assert.ok(fitted !== null);
    assert.ok(fineGlobeAffordable(fitted), `fitted ${fitted}`);
    // Dividing the coarse run by its point count says no, wrongly.
    assert.equal(fineGlobeAffordable(50 / 192), false);
  });

  it('still refuses a genuinely slow device', () => {
    // A quad-A53 tablet: same shape of numbers, ten times the scale.
    const tablet = [{ points: 192, ms: 500 }, { points: 640, ms: 940 }];
    assert.equal(fineGlobeAffordable(marginalMsPerPoint(tablet)), false);
  });

  it('has no answer from one size alone', () => {
    // Two runs of 192 points cannot say what a 193rd would cost.
    assert.equal(marginalMsPerPoint([COARSE, { points: 192, ms: 22 }]), null);
    assert.equal(marginalMsPerPoint([COARSE]), null);
    assert.equal(marginalMsPerPoint([]), null);
  });

  it('ignores readings that are not measurements', () => {
    const withJunk = [
      COARSE,
      FINE,
      { points: 0, ms: 5 },
      { points: 500, ms: 0 },
      { points: 500, ms: Number.NaN },
    ];
    const clean = marginalMsPerPoint([COARSE, FINE]);
    assert.equal(marginalMsPerPoint(withJunk), clean);
  });

  it('refuses a fit that noise has turned backwards', () => {
    // A larger grid timed faster than a smaller one is noise, not a
    // negative cost per point.
    assert.equal(
      marginalMsPerPoint([{ points: 192, ms: 90 }, { points: 640, ms: 40 }]),
      null,
    );
  });
});
