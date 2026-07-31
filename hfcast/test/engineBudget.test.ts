import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calibrationWorthwhile,
  COST_SAMPLES,
  type CostSample,
  FINE_BUDGET_MS,
  FINE_GRID_POINTS,
  fineGlobeAffordable,
  keepFastest,
  marginalMsPerPoint,
  MIN_LEVERAGE,
  naiveMsPerPoint,
  PROBE_LAT_STEP,
  PROBE_LON_STEP,
  PROBE_POINTS,
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
    // 2.5 times this desktop, measured against the calibration run
    // rather than against a patch 64 points larger than the coarse grid.
    const phone = [{ points: 192, ms: 50 }, { points: PROBE_POINTS, ms: 330 }];
    const fitted = marginalMsPerPoint(phone);
    assert.ok(fitted !== null);
    assert.ok(fineGlobeAffordable(fitted), `fitted ${fitted}`);
    // Dividing the coarse run by its point count says no, wrongly.
    assert.equal(fineGlobeAffordable(50 / 192), false);
  });

  it('still refuses a genuinely slow device', () => {
    // A quad-A53 tablet: same shape of numbers, ten times the scale.
    const tablet = [
      { points: 192, ms: 500 },
      { points: PROBE_POINTS, ms: 3300 },
    ];
    assert.equal(fineGlobeAffordable(marginalMsPerPoint(tablet)), false);
  });

  it('has no answer from one size alone', () => {
    // Two runs of 192 points cannot say what a 193rd would cost.
    assert.equal(marginalMsPerPoint([COARSE, { points: 192, ms: 22 }]), null);
    assert.equal(marginalMsPerPoint([COARSE]), null);
    assert.equal(marginalMsPerPoint([]), null);
  });

  it('has no answer from two sizes that are too close together', () => {
    // The defect the second version shipped with, in the numbers a
    // Pixel 8 actually produced. The app timed 192 points and 256
    // points; the 64 between them are worth about 5 ms and the noise on
    // one reading was 25, so the fitted slope was noise with a units
    // label. It read 0.70 ms a point where the truth is near 0.08, and
    // the gate refused a phone that runs the fine grid comfortably.
    const pixel8 = [{ points: 192, ms: 51 }, { points: 256, ms: 62 }];
    assert.equal(marginalMsPerPoint(pixel8), null);
    // Which must read as "not known yet", not as "too slow".
    assert.ok(calibrationWorthwhile(pixel8));
  });

  it('accepts two sizes once they are far enough apart', () => {
    // The same phone, with the calibration run added: 3,072 points at a
    // true marginal cost near 0.08 ms and a fixed cost near 45 ms.
    const withProbe = [
      { points: 192, ms: 51 },
      { points: 256, ms: 62 },
      { points: PROBE_POINTS, ms: 290 },
    ];
    const fitted = marginalMsPerPoint(withProbe);
    assert.ok(fitted !== null);
    assert.ok(fitted < 0.12, `${fitted}`);
    assert.ok(fineGlobeAffordable(fitted), `${fitted}`);
    // And once it is settled, there is nothing left to calibrate.
    assert.equal(calibrationWorthwhile(withProbe), false);
  });

  it('sizes the calibration run past the leverage it has to provide', () => {
    assert.equal(PROBE_POINTS, 3072);
    assert.ok(PROBE_POINTS >= 192 * MIN_LEVERAGE);
    // Whole rows and columns, or the engine runs a different grid.
    assert.equal(180 % PROBE_LAT_STEP, 0);
    assert.equal(360 % PROBE_LON_STEP, 0);
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

describe('deciding whether to spend a run on measuring properly', () => {
  it('does not measure a device that is obviously far too slow', () => {
    // A quad-A53 tablet: 192 points in half a second. Even read the way
    // that most flatters it, the fine grid is half a minute, and no
    // measurement would change that answer — so it is not worth the
    // seconds a calibration run would cost such a device.
    assert.equal(calibrationWorthwhile([{ points: 192, ms: 500 }]), false);
  });

  it('measures wherever the answer is still open', () => {
    // A Pixel 8's own readings. The rough figure puts it over budget,
    // but only by a little, and the rough figure always overstates —
    // so this is exactly the case a real measurement decides.
    const pixel8 = [{ points: 192, ms: 51 }, { points: 256, ms: 62 }];
    assert.ok(calibrationWorthwhile(pixel8));
  });

  it('has nothing to say before any run at all', () => {
    assert.equal(naiveMsPerPoint([]), null);
    assert.equal(calibrationWorthwhile([]), false);
  });

  it('stops once there is a slope to read', () => {
    const settled = [
      { points: 192, ms: 51 },
      { points: PROBE_POINTS, ms: 290 },
    ];
    assert.ok(marginalMsPerPoint(settled) !== null);
    assert.equal(calibrationWorthwhile(settled), false);
  });

  it('reads the rough figure from the fastest run, not the average', () => {
    // A run can be delayed and cannot be hurried, so the smallest
    // reading is the one nearest the truth.
    const noisy = [{ points: 192, ms: 100 }, { points: 256, ms: 62 }];
    assert.equal(naiveMsPerPoint(noisy), 62 / 256);
  });

  it('never understates the marginal cost', () => {
    // The rough figure spreads a run's fixed cost over its points, so it
    // can only ever be too high. That is what makes it safe to refuse a
    // device on, and unsafe to accept one on.
    const samples = [{ points: 192, ms: 51 }, {
      points: PROBE_POINTS,
      ms: 290,
    }];
    const rough = naiveMsPerPoint(samples);
    const fitted = marginalMsPerPoint(samples);
    assert.ok(rough !== null && fitted !== null);
    assert.ok(rough > fitted, `${rough} !> ${fitted}`);
  });
});

describe('what the device remembers about its own speed', () => {
  it('keeps the fastest reading at each size', () => {
    // The Pixel 8 timed the same 192-point run at 100 ms and at 51 ms.
    // Only the second says anything about the engine; the first says
    // something about whatever else the phone was doing.
    const after = [
      { points: 192, ms: 100 },
      { points: 192, ms: 51 },
      { points: 192, ms: 70 },
    ].reduce<CostSample[]>((held, next) => keepFastest(held, next), []);
    assert.deepEqual(after, [{ points: 192, ms: 51 }]);
  });

  it('holds one entry per size rather than one per run', () => {
    // The reason it must: the calibration run happens once and the
    // coarse run happens constantly. A rolling window of runs would push
    // the one measurement that carries the leverage straight back out.
    const runs = Array.from({ length: 40 }, () => ({ points: 192, ms: 60 }));
    const held = [{ points: PROBE_POINTS, ms: 290 }, ...runs].reduce<
      CostSample[]
    >((seen, next) => keepFastest(seen, next), []);
    assert.equal(held.length, 2);
    assert.ok(held.some((s) => s.points === PROBE_POINTS));
    assert.ok(marginalMsPerPoint(held) !== null);
  });

  it('keeps the extremes when it runs out of room', () => {
    // The smallest and the largest are what give the fit its leverage.
    const many = Array.from({ length: COST_SAMPLES + 6 }, (_, i) => ({
      points: 100 + i * 100,
      ms: 10 + i,
    }));
    const held = many.reduce<CostSample[]>(
      (seen, next) => keepFastest(seen, next),
      [],
    );
    assert.equal(held.length, COST_SAMPLES);
    const sizes = held.map((s) => s.points);
    assert.equal(Math.min(...sizes), 100);
    assert.equal(Math.max(...sizes), many[many.length - 1]?.points);
  });
});
