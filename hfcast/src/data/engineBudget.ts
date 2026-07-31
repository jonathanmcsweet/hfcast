/**
 * Whether this device can afford the whole-world fine grid.
 *
 * One decision made at build time would be wrong somewhere. The range of
 * devices this app runs on spans roughly a factor of ten: a current
 * phone runs the fine grid in one to two seconds, and a quad-A53 tablet
 * of the kind the legacy build exists for would take four to six. Ship
 * it on and the slow end freezes; ship it off and the fast end is held
 * back by the slow end.
 *
 * So each device decides for itself, from a measurement it already
 * produces. The coarse coverage run is 192 points and happens whenever
 * the band or the hour changes, so timing it costs nothing and gives a
 * cost per point in the engine's own units — the same engine, the same
 * antenna, the same coefficient files. Multiply by the size of the fine
 * grid, divide by what the strips recover, and compare with the budget.
 *
 * Nothing here reads a device model or a core count. Those describe a
 * phone; this measures the work.
 */

/**
 * Points in the whole-world fine grid, at 1.25 by 1.5 degrees.
 *
 * Repeated from `fineGlobe.ts` rather than imported so this module has
 * no dependencies and can be reasoned about, and tested, on its own.
 * `engineBudget.test.ts` checks the two agree.
 */
export const FINE_GRID_POINTS = 34560;

/**
 * How long the fine grid may take, from a settled hour to cells drawn.
 *
 * Two and a half seconds is the point at which a map stops feeling like
 * it is filling in and starts feeling like it is stuck. The coarse map
 * is already on screen throughout, so this is the wait for detail rather
 * than for an answer — which is why it is this long and not shorter.
 */
export const FINE_BUDGET_MS = 2500;

/**
 * What cutting the grid into strips actually recovers.
 *
 * Measured on this desktop at the fine step: 1,353 ms whole against
 * 376 ms in four strips, which is 3.6. This is deliberately lower.
 * Four strips on a phone share memory bandwidth and a thermal budget in
 * a way a desktop does not, and the cost of being wrong is not
 * symmetric: too low and a capable device misses a feature it would
 * have enjoyed, too high and a slow device locks up for six seconds.
 *
 * Replace this with a measured figure once `predictMany` has run on real
 * hardware. It has not yet.
 */
export const STRIP_SPEEDUP = 2.5;

/**
 * How long the fine grid would take on a device costing `msPerPoint`.
 *
 * Null in, null out: with no measurement there is no projection, and a
 * caller must decide what to do about that rather than be handed a
 * number that looks measured.
 */
export function projectedFineMs(
  msPerPoint: number | null,
  speedup: number = STRIP_SPEEDUP,
): number | null {
  if (msPerPoint === null || !Number.isFinite(msPerPoint)) return null;
  if (msPerPoint <= 0) return null;
  return (msPerPoint * FINE_GRID_POINTS) / speedup;
}

/**
 * Whether to run the fine grid on this device.
 *
 * False while there is no measurement. The first coarse run of a
 * session produces one, so this costs a device at most one band change
 * before it knows — and starting off and turning on is the safe
 * direction. Starting on would mean every unknown device, including
 * every slow one, takes the full run once before finding out.
 */
export function fineGlobeAffordable(
  msPerPoint: number | null,
  budgetMs: number = FINE_BUDGET_MS,
): boolean {
  const projected = projectedFineMs(msPerPoint);
  return projected !== null && projected <= budgetMs;
}

/**
 * One timed run: how many points, and how long it took.
 */
export interface CostSample {
  points: number;
  ms: number;
}

/**
 * How much larger the biggest timed run must be than the smallest.
 *
 * A slope needs two sizes far enough apart that the difference between
 * them is the work rather than the noise. Measured on a Pixel 8: the
 * same 192-point run took 51 ms once and 100 ms another time, so the
 * noise on one reading is about 25 ms. The app's own two sizes were 192
 * and 256 points, and the 64 points between them are worth about 5 ms —
 * a fifth of the noise. Least squares through that pair returned 0.70 ms
 * a point where the truth is nearer 0.08, and the gate refused a phone
 * that runs the fine grid comfortably.
 *
 * Four times is enough for the work to outweigh the noise, and it is
 * what the calibration run below is sized to provide.
 */
export const MIN_LEVERAGE = 4;

/**
 * The grid the calibration run covers: the whole world, at a quarter of
 * the coarse map's step in each direction.
 *
 * Deliberately the same shape as the run it is compared against. The
 * coarse map is already a whole-world grid at 15 by 22.5 degrees, so
 * quartering the step gives the same geometry, the same spread of path
 * lengths and the same work per point — only more of them. A rectangle
 * somewhere else would have measured a different question.
 *
 * 48 rows by 64 columns, which is 16 times the coarse run and well past
 * `MIN_LEVERAGE`.
 */
export const PROBE_LAT_STEP = 3.75;
export const PROBE_LON_STEP = 5.625;
export const PROBE_POINTS = (180 / PROBE_LAT_STEP) * (360 / PROBE_LON_STEP);

/**
 * How far over budget a device may look before it is refused without
 * measuring properly.
 *
 * The calibration run costs a device about a third of a second, and on
 * a slow one it would cost seconds. Spending that to confirm what is
 * already obvious is not worth it, so a device whose roughest estimate
 * is many times the budget is refused on that estimate alone. Eight is
 * chosen so the rough figure's own overstatement — it counts fixed cost
 * as though it were per-point — cannot push a capable device past it.
 */
export const HOPELESS_FACTOR = 8;

/**
 * How many grid sizes are remembered.
 *
 * Sizes, not runs: one entry each, holding the fastest run seen at that
 * size. The app produces a handful — the 192-point coarse grid, the
 * calibration run, and one per zoom level the viewport patch settles on
 * — so twelve holds every size a reader is likely to reach without
 * letting the list grow without limit.
 */
export const COST_SAMPLES = 12;

/**
 * Keeps the fastest reading at each grid size.
 *
 * Two things this fixes at once. A run can be delayed — by another app,
 * by the scheduler, by the phone deciding to cool down — but it cannot
 * be hurried, so the noise is one-sided and the smallest reading is the
 * best estimate of the true cost. And keeping one entry per size rather
 * than a rolling window of runs stops the calibration run, which happens
 * once, from being pushed out by the coarse runs, which happen
 * constantly.
 *
 * Over capacity, the entry dropped is the one nearest the middle. The
 * smallest and the largest are what give the fit its leverage, so those
 * are the two that must survive.
 */
export const keepFastest = (
  samples: readonly CostSample[],
  next: CostSample,
): CostSample[] => {
  const seen = samples.find((s) => s.points === next.points);
  if (seen !== undefined) {
    return next.ms < seen.ms
      ? samples.map((s) => (s.points === next.points ? next : s))
      : [...samples];
  }
  const grown = [...samples, next];
  if (grown.length <= COST_SAMPLES) return grown;
  const bySize = [...grown].sort((a, b) => a.points - b.points);
  const middle = bySize[Math.floor(bySize.length / 2)];
  return grown.filter((s) => s !== middle);
};

/**
 * The cost per point a run appears to have, fixed cost included.
 *
 * Always an overstatement of the marginal cost, because every run's
 * fixed cost is divided among its points. That makes it useful in one
 * direction only: if this says the fine grid fits the budget, it fits.
 * The smallest reading is taken rather than the average, for the reason
 * `record` keeps minima — a run can be delayed but never hurried.
 */
export function naiveMsPerPoint(
  samples: readonly CostSample[],
): number | null {
  const rates = samples
    .filter((s) => s.points > 0 && Number.isFinite(s.ms) && s.ms > 0)
    .map((s) => s.ms / s.points);
  return rates.length === 0 ? null : Math.min(...rates);
}

/**
 * Whether it is worth timing a deliberately larger run on this device.
 *
 * Only when the question is open: there is no trustworthy slope yet,
 * and the rough figure does not already put the device far out of
 * reach. Answering false here is not a refusal — it means the answer is
 * already known, one way or the other.
 */
export function calibrationWorthwhile(
  samples: readonly CostSample[],
  budgetMs: number = FINE_BUDGET_MS,
): boolean {
  if (marginalMsPerPoint(samples) !== null) return false;
  const rough = projectedFineMs(naiveMsPerPoint(samples));
  return rough !== null && rough <= budgetMs * HOPELESS_FACTOR;
}

/**
 * The marginal cost of one more grid point, in milliseconds.
 *
 * Not simply "time divided by points". A run has a fixed cost — loading
 * coefficients, crossing into the native module, writing the antenna —
 * that a small grid spreads over very few points. Measured on this
 * desktop: 192 points in 20 ms is 0.104 ms a point, while 34,560 points
 * in 1,353 ms is 0.039. The same engine, a factor of 2.7 apart, because
 * the first figure is mostly fixed cost.
 *
 * The first version of this gate used the small run's figure directly
 * and multiplied it by 34,560. That inflates the projection by the same
 * factor, more on a phone where the fixed cost is a larger share, and it
 * refused the fine grid on hardware that runs it comfortably — a Pixel 8
 * among them. Fitting a line through one point assumes the intercept is
 * zero, and here it is not.
 *
 * So the slope is fitted across runs of different sizes. The app makes
 * them already: the coarse grid is 192 points and the viewport patch is
 * a few hundred, both on every view. Least squares rather than a
 * difference of two, because timings on a phone are noisy and every
 * sample should count.
 *
 * Null until there are runs of at least two different sizes, because
 * one size cannot separate the fixed cost from the marginal one.
 */
export function marginalMsPerPoint(
  samples: readonly CostSample[],
): number | null {
  const usable = samples.filter(
    (s) => s.points > 0 && Number.isFinite(s.ms) && s.ms > 0,
  );
  if (usable.length < 2) return null;
  // Two different sizes are not enough; they have to be far enough
  // apart. See `MIN_LEVERAGE` — this is the check whose absence made the
  // gate fit a line through noise and refuse a capable phone.
  const sizes = usable.map((s) => s.points);
  if (Math.max(...sizes) < Math.min(...sizes) * MIN_LEVERAGE) return null;

  const meanPoints = usable.reduce((sum, s) => sum + s.points, 0)
    / usable.length;
  const meanMs = usable.reduce((sum, s) => sum + s.ms, 0) / usable.length;

  const spread = usable.reduce(
    (sum, s) => sum + (s.points - meanPoints) ** 2,
    0,
  );
  const together = usable.reduce(
    (sum, s) => sum + (s.points - meanPoints) * (s.ms - meanMs),
    0,
  );
  if (spread <= 0) return null;

  const slope = together / spread;
  // A slope of zero or less is not a measurement of anything — it means
  // the noise beat the signal, usually because the two sizes were close
  // together. Better to wait for a run that separates them.
  return slope > 0 ? slope : null;
}
