import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calibrationWorthwhile,
  COST_SAMPLES,
  type CostSample,
  FINE_BUDGET_MS,
  FINE_GRID_POINTS,
  fineGlobeAffordable,
  fitRunCost,
  keepFastest,
  marginalMsPerPoint,
  MAX_THREADS,
  MIN_LEVERAGE,
  naiveCost,
  PROBE_LARGE_LAT_STEP,
  PROBE_LARGE_LON_STEP,
  PROBE_LARGE_POINTS,
  PROBE_SMALL_LAT_STEP,
  PROBE_SMALL_LON_STEP,
  PROBE_SMALL_POINTS,
  projectedFineMs,
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
 * Devices, described the way the probes would see them.
 *
 * Each is a fixed cost — one coefficient load per strip, and the strips
 * run in as many rounds as they need — plus a per-point cost already
 * divided by the threads that share it. That is exactly what a sharded
 * run costs, so a probe reading is `fixedMs + points * msPerPoint` and
 * the fit is being asked to recover the two numbers it was built from.
 */
const probe = (
  device: { fixedMs: number; msPerPoint: number; },
  points: number,
): CostSample => ({
  points,
  ms: device.fixedMs + points * device.msPerPoint,
});

const small = (device: { fixedMs: number; msPerPoint: number; }) =>
  probe(device, PROBE_SMALL_POINTS);
const large = (device: { fixedMs: number; msPerPoint: number; }) =>
  probe(device, PROBE_LARGE_POINTS);

/**
 * A current phone, and the only fixture here that was measured rather
 * than reasoned out: a Pixel 8 running the shipped APK, read from its
 * own log on 2026-08-01. Its probes fitted 11 ms plus 0.0982 ms a point,
 * which puts the whole-world grid at about 3.4 seconds.
 *
 * It replaced a hypothetical phone of 32 ms plus 0.0243 — four times
 * faster — that this file had been reasoning from. The hypothetical one
 * was built by dividing a desktop's per-point cost by eight cores, which
 * assumes the batch recovers all eight and that nothing outside the
 * engine costs anything. The real reading says otherwise, and a test
 * suite that keeps the invented number would go on agreeing with an
 * assumption the hardware has already contradicted.
 */
const PHONE = { fixedMs: 11, msPerPoint: 0.0982 };

/**
 * A quad-A53 tablet: four slow cores, about three times the phone's cost
 * per point. This is the device the budget exists to refuse — the whole
 * grid is ten seconds, which arrives long after a reader has moved on.
 */
const TABLET = { fixedMs: 40, msPerPoint: 0.295 };

describe('deciding whether a device can afford the fine grid', () => {
  it('counts the same grid the packing does', () => {
    // Repeated rather than imported so the budget module stands alone.
    // This is what keeps the two copies honest.
    assert.equal(FINE_GRID_POINTS, FINE_POINTS);
  });

  it('says yes to a current phone, from its own two probes', () => {
    const cost = fitRunCost([small(PHONE), large(PHONE)]);
    assert.ok(cost !== null);
    assert.ok(fineGlobeAffordable(cost));
    // About 3.4 seconds, against a budget of five. This is the reading
    // the old budget of 2500 refused, on a device whose owner had seen
    // the refinement happen and wanted it (user, 2026-08-01).
    const projected = projectedFineMs(cost);
    assert.ok(projected !== null, 'unprojected');
    assert.ok(projected > 3000 && projected < 3800, `${projected}`);
    assert.ok(projected > 2500, 'the old budget would have refused this');
  });

  it('says no to a quad-A53 tablet, from its own two probes', () => {
    const cost = fitRunCost([small(TABLET), large(TABLET)]);
    assert.equal(fineGlobeAffordable(cost), false);
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
      const cost = { fixedMs: 0, msPerPoint: bad };
      assert.equal(projectedFineMs(cost), null, `${bad}`);
      assert.equal(fineGlobeAffordable(cost), false, `${bad}`);
    }
    // And a fixed cost that is not a number is not one either.
    assert.equal(projectedFineMs({ fixedMs: Number.NaN, msPerPoint: 1 }), null);
    assert.equal(projectedFineMs({ fixedMs: -5, msPerPoint: 1 }), null);
  });

  it('counts the fixed cost the strips add, not only the points', () => {
    // Sixteen strips are sixteen coefficient loads. Dropping the
    // intercept would understate every sharded run by that whole amount,
    // and it is the part that does not shrink as the grid grows.
    const cost = { fixedMs: 32, msPerPoint: 0.0121 };
    assert.equal(projectedFineMs(cost), 32 + 0.0121 * FINE_GRID_POINTS);
    assert.notEqual(projectedFineMs(cost), 0.0121 * FINE_GRID_POINTS);
  });
});

describe('measuring what the strips recover instead of assuming it', () => {
  it('decides a real device from what that device measured', () => {
    // The phone above is a reading, not a model, and this is the whole
    // claim the module makes: hand it that device's two probes and it
    // returns that device's cost, with nothing written down in between.
    const cost = fitRunCost([small(PHONE), large(PHONE)]);
    assert.ok(cost !== null);
    assert.ok(Math.abs(cost.msPerPoint - PHONE.msPerPoint) < 1e-6);
    assert.ok(projectedFineMs(cost) !== null);
    assert.ok(fineGlobeAffordable(cost));
  });

  it('would still have refused this phone under a guessed speedup', () => {
    // What the old gate did: time one unsharded run and divide by 2.5, a
    // speedup written down rather than measured. Whatever single-thread
    // cost that guess is applied to, it cannot land on this device's
    // measured 3.4 seconds except by accident — and the point is that no
    // better constant fixes it, because the error is not in the value.
    //
    // Assume the strips recover the 5.7 the engine's own figures show.
    // Then this phone's unsharded grid is its measured cost times 5.7,
    // and the guess of 2.5 would have projected more than twice the
    // truth: over the old budget, and over the new one as well.
    const truth = projectedFineMs(fitRunCost([small(PHONE), large(PHONE)]));
    assert.ok(truth !== null);
    const unsharded = truth * 5.7;
    const guessed = unsharded / 2.5;
    assert.ok(guessed / truth > 2, `${guessed / truth}`);
    assert.ok(guessed > FINE_BUDGET_MS, `${guessed}`);
    assert.ok(truth < FINE_BUDGET_MS, `${truth}`);
  });

  it('recovers both parts of the cost it was built from', () => {
    // The fit is not being asked to be clever, only to be right: these
    // readings were constructed from a known fixed and per-point cost,
    // and it has to hand both of them back.
    const cost = fitRunCost([small(PHONE), large(PHONE)]);
    assert.ok(cost !== null);
    assert.ok(Math.abs(cost.fixedMs - PHONE.fixedMs) < 0.5, `${cost.fixedMs}`);
    assert.ok(
      Math.abs(cost.msPerPoint - PHONE.msPerPoint) < 1e-6,
      `${cost.msPerPoint}`,
    );
  });

  it('sizes the two probes past the leverage a fit needs', () => {
    assert.equal(PROBE_SMALL_POINTS, 3072);
    assert.equal(PROBE_LARGE_POINTS, 13824);
    assert.ok(PROBE_LARGE_POINTS >= PROBE_SMALL_POINTS * MIN_LEVERAGE);
    // Whole rows and columns on both axes, or the engine snaps to a
    // different lattice and the strips cut between rows that are not
    // where `shard.ts` thinks they are.
    for (const step of [PROBE_SMALL_LAT_STEP, PROBE_LARGE_LAT_STEP]) {
      assert.equal(180 % step, 0, `lat ${step}`);
    }
    for (const step of [PROBE_SMALL_LON_STEP, PROBE_LARGE_LON_STEP]) {
      assert.equal(360 % step, 0, `lon ${step}`);
    }
  });

  it('keeps the probes well short of the grid they stand in for', () => {
    // They exist to avoid running the fine grid on a device that cannot
    // hold it. Both together are about 40 percent of one fine grid, so
    // the worst case — a slow device that probes and is then refused —
    // costs less than the single run it prevented.
    const both = PROBE_SMALL_POINTS + PROBE_LARGE_POINTS;
    assert.ok(both < FINE_GRID_POINTS / 2, `${both}`);
  });
});

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

describe('cutting the probes exactly as the fine grid is cut', () => {
  /**
   * The assumption the whole fit rests on, checked against the code that
   * does the cutting rather than asserted in a comment.
   *
   * A line through the two probes only passes through the fine grid if
   * all three runs share one fixed cost and one per-point cost. The
   * fixed cost is one coefficient load per strip, so they have to be cut
   * into the same number of strips — if the probes ran in four and the
   * fine grid in sixteen, the fit would describe a run that never
   * happens, and it would understate the real one by twelve loads.
   */
  const GRIDS = [
    ['small', PROBE_SMALL_LAT_STEP, PROBE_SMALL_LON_STEP, PROBE_SMALL_POINTS],
    ['large', PROBE_LARGE_LAT_STEP, PROBE_LARGE_LON_STEP, PROBE_LARGE_POINTS],
    ['fine grid', FINE_LAT_STEP, FINE_LON_STEP, FINE_POINTS],
  ] as const;

  it('covers the points each grid is said to cover', () => {
    // The engine snaps a step to a whole number of bands. Where it snaps
    // to something other than the step asked for, the constants above
    // would describe a grid the engine does not run.
    for (const [name, lat, lon, points] of GRIDS) {
      assert.equal(pointCount(undefined, lat, lon), points, name);
    }
  });

  it('cuts all three into the same number of strips', () => {
    for (const cores of [2, 4, 8, 16]) {
      const counts = GRIDS.map(([name, lat, lon]) => {
        const strips = latShards(undefined, lat, lon, stripsFor(cores));
        assert.ok(strips !== null, `${name} at ${cores} cores`);
        return strips.length;
      });
      assert.equal(new Set(counts).size, 1, `${cores} cores: ${counts}`);
      assert.equal(counts[0], stripsFor(cores), `${cores} cores`);
    }
  });

  it('keeps the small probe worth sharding at all', () => {
    // Below this the per-strip loads are most of the run and splitting
    // makes it slower — and a probe that was not sharded would measure
    // the wrong thing entirely.
    assert.ok(PROBE_SMALL_POINTS > MIN_SHARD_POINTS);
  });
});

describe("separating a run's fixed cost from its per-point cost", () => {
  // The desktop figures this gate was corrected against: a 192-point
  // coarse run and a 34,560-point fine run, same engine, same machine,
  // both on one thread. Their naive per-point costs differ by 2.7 times,
  // entirely because the small run is mostly fixed cost.
  const COARSE = { points: 192, ms: 20 };
  const FINE = { points: 34560, ms: 1353 };

  it("recovers the marginal cost, not the small run's average", () => {
    const fitted = marginalMsPerPoint([COARSE, FINE]);
    assert.ok(fitted !== null);
    // 0.0388 ms a point, against 0.104 if the intercept were ignored.
    assert.ok(Math.abs(fitted - 0.0388) < 0.001, `${fitted}`);
    assert.ok(fitted < COARSE.ms / COARSE.points / 2);
  });

  it('has no answer from one size alone', () => {
    // Two runs of 192 points cannot say what a 193rd would cost.
    assert.equal(marginalMsPerPoint([COARSE, { points: 192, ms: 22 }]), null);
    assert.equal(marginalMsPerPoint([COARSE]), null);
    assert.equal(marginalMsPerPoint([]), null);
    assert.equal(fitRunCost([small(PHONE)]), null);
  });

  it('has no answer from two sizes that are too close together', () => {
    // The defect an earlier version shipped with, in the numbers a Pixel
    // 8 actually produced. The app timed 192 points and 256 points; the
    // 64 between them are worth about 5 ms and the noise on one reading
    // was 25, so the fitted slope was noise with a units label. It read
    // 0.70 ms a point where the truth is near 0.08, and the gate refused
    // a phone that runs the fine grid comfortably.
    const pixel8 = [{ points: 192, ms: 51 }, { points: 256, ms: 62 }];
    assert.equal(marginalMsPerPoint(pixel8), null);
    assert.equal(fitRunCost(pixel8), null);
  });

  it('ignores readings that are not measurements', () => {
    const withJunk = [
      COARSE,
      FINE,
      { points: 0, ms: 5 },
      { points: 500, ms: 0 },
      { points: 500, ms: Number.NaN },
    ];
    assert.equal(
      marginalMsPerPoint(withJunk),
      marginalMsPerPoint([
        COARSE,
        FINE,
      ]),
    );
  });

  it('refuses a fit that noise has turned backwards', () => {
    // A larger grid timed faster than a smaller one is noise, not a
    // negative cost per point.
    assert.equal(
      marginalMsPerPoint([{ points: 192, ms: 90 }, { points: 640, ms: 40 }]),
      null,
    );
  });

  it('never reports a negative fixed cost', () => {
    // Noise can put the fitted line's intercept below zero. The slope it
    // came with is still usable, so the intercept is clamped rather than
    // the whole fit refused — but a negative fixed cost would subtract
    // from every projection, which is the unsafe direction.
    const noisy = [{ points: 3072, ms: 20 }, { points: 13824, ms: 200 }];
    const cost = fitRunCost(noisy);
    assert.ok(cost !== null);
    assert.ok(cost.fixedMs >= 0, `${cost.fixedMs}`);
  });

  it('improves once the fine grid itself has run', () => {
    // The real run is the best sample there is: the exact size the
    // projection is about, cut exactly as the probes were. After it, the
    // fit is no longer an extrapolation.
    const withReal = [
      small(PHONE),
      large(PHONE),
      probe(PHONE, FINE_GRID_POINTS),
    ];
    const projected = projectedFineMs(fitRunCost(withReal));
    const truth = probe(PHONE, FINE_GRID_POINTS).ms;
    assert.ok(projected !== null);
    assert.ok(Math.abs(projected - truth) < 1, `${projected} vs ${truth}`);
  });
});

describe('deciding whether to spend a run on measuring properly', () => {
  it('does not measure a device that is obviously far too slow', () => {
    // Ten times the quad-A53 tablet. Even read the way that most
    // flatters it, the fine grid is over half a minute, and no further
    // measurement would change that answer — so it is not worth the
    // seconds the large probe would cost such a device.
    const hopeless = { fixedMs: 400, msPerPoint: TABLET.msPerPoint * 10 };
    assert.equal(calibrationWorthwhile([small(hopeless)]), false);
  });

  it('measures a device that is only somewhat over budget', () => {
    // The tablet is about 1.4 times the budget on the rough reading,
    // which is well inside the range where a proper fit decides it.
    assert.ok(calibrationWorthwhile([small(TABLET)]));
  });

  it('measures a device sitting right at the boundary', () => {
    // The case the whole thing exists for. The rough figure always
    // overstates, so a device at exactly the budget looks over it — and
    // must still be measured rather than refused.
    const boundary = {
      fixedMs: 32,
      msPerPoint: (FINE_BUDGET_MS - 32) / FINE_GRID_POINTS,
    };
    assert.ok(calibrationWorthwhile([small(boundary)]));
  });

  it('has nothing to say before any run at all', () => {
    assert.equal(naiveCost([]), null);
    assert.equal(calibrationWorthwhile([]), false);
  });

  it('stops once there is a fit to read', () => {
    assert.ok(fitRunCost([small(PHONE), large(PHONE)]) !== null);
    assert.equal(calibrationWorthwhile([small(PHONE), large(PHONE)]), false);
  });

  it('reads the rough figure from the fastest run, not the average', () => {
    // A run can be delayed and cannot be hurried, so the smallest
    // reading is the one nearest the truth.
    const noisy = [{ points: 192, ms: 100 }, { points: 256, ms: 62 }];
    assert.deepEqual(naiveCost(noisy), { fixedMs: 0, msPerPoint: 62 / 256 });
  });

  it('never understates the marginal cost', () => {
    // The rough figure spreads a run's fixed cost over its points, so it
    // can only ever be too high. That is what makes it safe to refuse a
    // device on, and unsafe to accept one on.
    const samples = [small(PHONE), large(PHONE)];
    const rough = naiveCost(samples);
    const fitted = fitRunCost(samples);
    assert.ok(rough !== null && fitted !== null);
    assert.ok(
      rough.msPerPoint > fitted.msPerPoint,
      `${rough.msPerPoint} !> ${fitted.msPerPoint}`,
    );
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
    // The reason it must: the probes happen once and the coarse run
    // happens constantly. A rolling window of runs would push the
    // measurement that carries the leverage straight back out.
    const runs = Array.from({ length: 40 }, () => ({ points: 192, ms: 60 }));
    const held = [large(PHONE), ...runs].reduce<CostSample[]>(
      (seen, next) => keepFastest(seen, next),
      [],
    );
    assert.equal(held.length, 2);
    assert.ok(held.some((s) => s.points === PROBE_LARGE_POINTS));
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
