/**
 * Whether this device can afford the whole-world fine grid.
 *
 * One decision made at build time would be wrong somewhere. The range of
 * devices this app runs on spans roughly a factor of ten: a current
 * phone runs the fine grid in a fraction of a second across its cores,
 * and a quad-A53 tablet of the kind the legacy build exists for would
 * take seconds. Ship it on and the slow end freezes; ship it off and the
 * fast end is held back by the slow end.
 *
 * So each device decides for itself, from runs it times on its own
 * hardware. Nothing here reads a device model. A model name describes a
 * phone; these numbers measure the work.
 *
 * The measurement is of the run that will actually happen — the fine
 * grid cut into strips across the device's cores — and not of a
 * single-threaded run divided by an assumed speedup. An earlier version
 * did the latter, with the speedup written down as 2.5. The engine's own
 * measurements put eight-way sharding at 5.7, so that constant refused
 * the fine grid on hardware that runs it in a third of a second. A
 * guessed divisor cannot be corrected by guessing a better one, so it is
 * gone: what the strips recover is now measured per device, like
 * everything else here.
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
 * How many threads a batch runs across, given the device's core count.
 *
 * Every core, up to eight. The engine is arithmetic on data already in
 * memory, so it scales with cores until it runs out of them; the cap is
 * there because a phone reporting more than eight is reporting cores
 * this run has no way to keep fed, and because a thread per core is
 * already the point at which the run competes with the interface it is
 * drawing for.
 *
 * Two at the bottom, not one. A device reporting a single core is more
 * likely to be reporting badly than to have one, and two strips on one
 * core cost only the second strip's coefficient load.
 */
export const MAX_THREADS = 8;

export function threadsFor(cores: number): number {
  const usable = Number.isFinite(cores) && cores >= 1 ? Math.floor(cores) : 4;
  return Math.min(MAX_THREADS, Math.max(2, usable));
}

/**
 * How many strips the grid is cut into, per thread.
 *
 * More strips than threads, deliberately. Phone cores are not equal —
 * a big.LITTLE phone pairs four fast cores with four slow ones, and the
 * slow ones can take two to three times as long over the same strip. Cut
 * one strip per thread and the run ends when the slowest core finishes
 * its share, so the fast cores sit idle waiting for it. Cut two strips
 * per thread and a core that finishes early takes the next strip off the
 * pool's queue, which turns an even split into work-stealing without any
 * code that steals work.
 *
 * The cost is one extra coefficient load per extra strip, about 16 ms,
 * paid in parallel with the others. Two is where that stops being worth
 * it: at four the loads outweigh what the balancing recovers.
 */
export const STRIPS_PER_THREAD = 2;

export const stripsFor = (cores: number): number =>
  threadsFor(cores) * STRIPS_PER_THREAD;

/**
 * One timed run: how many points, and how long it took.
 */
export interface CostSample {
  points: number;
  ms: number;
}

/**
 * What a run costs on this device: a fixed part and a per-point part.
 *
 * Both are needed. The fixed part is the coefficient load and the
 * crossing into the native module — for a sharded run, one load per
 * strip — and it does not shrink as the grid grows. Projecting from the
 * per-point figure alone understates a sharded run by that whole amount.
 */
export interface RunCost {
  /** What the run costs before it computes a single point. */
  fixedMs: number;
  /** What one more grid point adds. */
  msPerPoint: number;
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
 * what the two calibration grids below are sized to provide.
 */
export const MIN_LEVERAGE = 4;

/**
 * The two grids the device times itself on.
 *
 * Both cover the whole world, because the grid they are used to predict
 * covers the whole world: the same spread of path lengths, the same
 * proportion of paths over the poles, the same work per point. A
 * rectangle somewhere else would have measured a different question.
 *
 * Both are cut into the same strips as the fine grid, so all three runs
 * share one fixed cost and one per-point cost and a line through the two
 * of them passes through the third. This is the whole reason there are
 * two: one run cannot separate a sharded grid's per-strip loads from its
 * arithmetic, and the difference between those is the factor of two that
 * the old guessed speedup got wrong.
 *
 * 48 by 64 and 96 by 144 — 3,072 and 13,824 points, a leverage of 4.5,
 * and together about 40 percent of one fine grid. That is the price of
 * knowing, paid once per device and then persisted.
 */
export const PROBE_SMALL_LAT_STEP = 3.75;
export const PROBE_SMALL_LON_STEP = 5.625;
export const PROBE_SMALL_POINTS = (180 / PROBE_SMALL_LAT_STEP)
  * (360 / PROBE_SMALL_LON_STEP);

export const PROBE_LARGE_LAT_STEP = 1.875;
export const PROBE_LARGE_LON_STEP = 2.5;
export const PROBE_LARGE_POINTS = (180 / PROBE_LARGE_LAT_STEP)
  * (360 / PROBE_LARGE_LON_STEP);

/**
 * How far over budget a device may look before it is refused without
 * finishing the measurement.
 *
 * The small probe is cheap and runs on every device that has the engine.
 * The large one costs four and a half times as much, and on a slow
 * device that is seconds — so it is only run where its answer could
 * still come out either way.
 *
 * Eight, because the figure it is compared against is the small probe
 * read the way that most flatters the device's chances: its fixed cost
 * spread across its points as though it were per-point work. That
 * overstates by about three at this size, and eight leaves room for that
 * plus noise without letting a device that is genuinely ten times too
 * slow spend seconds confirming it.
 */
export const HOPELESS_FACTOR = 8;

/**
 * How many grid sizes are remembered.
 *
 * Sizes, not runs: one entry each, holding the fastest run seen at that
 * size. The app produces a handful — the two probes, the fine grid
 * itself, and the ordinary runs — so twelve holds every size a reader is
 * likely to reach without letting the list grow without limit.
 */
export const COST_SAMPLES = 12;

/**
 * Keeps the fastest reading at each grid size.
 *
 * Two things this fixes at once. A run can be delayed — by another app,
 * by the scheduler, by the phone deciding to cool down — but it cannot
 * be hurried, so the noise is one-sided and the smallest reading is the
 * best estimate of the true cost. And keeping one entry per size rather
 * than a rolling window of runs stops the probes, which happen once,
 * from being pushed out by the coarse runs, which happen constantly.
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
 * Both parts of a run's cost, fitted across runs of different sizes.
 *
 * Not simply "time divided by points". A run has a fixed cost — loading
 * coefficients once per strip, crossing into the native module, writing
 * the antenna — that a small grid spreads over very few points. Measured
 * on this desktop, unsharded: 192 points in 20 ms is 0.104 ms a point,
 * while 34,560 points in 1,353 ms is 0.039. The same engine, a factor of
 * 2.7 apart, because the first figure is mostly fixed cost.
 *
 * Least squares rather than a difference of two, because timings on a
 * phone are noisy and every sample should count.
 *
 * Null until there are runs of at least two sizes far enough apart —
 * see `MIN_LEVERAGE`. One size cannot separate the fixed cost from the
 * marginal one, and two close sizes separate them into noise.
 */
export function fitRunCost(samples: readonly CostSample[]): RunCost | null {
  const usable = samples.filter(
    (s) => s.points > 0 && Number.isFinite(s.ms) && s.ms > 0,
  );
  if (usable.length < 2) return null;
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

  const msPerPoint = together / spread;
  // A slope of zero or less is not a measurement of anything — it means
  // the noise beat the signal, usually because the two sizes were close
  // together. Better to wait for a run that separates them.
  if (msPerPoint <= 0) return null;

  // A negative intercept is noise too, but a harmless kind: it says the
  // fit found no fixed cost. Clamped rather than refused, because the
  // slope it came with is still the number the projection needs.
  return {
    fixedMs: Math.max(0, meanMs - msPerPoint * meanPoints),
    msPerPoint,
  };
}

/**
 * The marginal cost of one more grid point, in milliseconds.
 *
 * The slope alone, for callers that want to report it. The projection
 * uses `fitRunCost` directly, because it needs the intercept too.
 */
export function marginalMsPerPoint(
  samples: readonly CostSample[],
): number | null {
  return fitRunCost(samples)?.msPerPoint ?? null;
}

/**
 * How long the fine grid would take on a device costing `cost`.
 *
 * Null in, null out: with no measurement there is no projection, and a
 * caller must decide what to do about that rather than be handed a
 * number that looks measured.
 */
export function projectedFineMs(cost: RunCost | null): number | null {
  if (cost === null) return null;
  if (!Number.isFinite(cost.msPerPoint) || cost.msPerPoint <= 0) return null;
  if (!Number.isFinite(cost.fixedMs) || cost.fixedMs < 0) return null;
  return cost.fixedMs + cost.msPerPoint * FINE_GRID_POINTS;
}

/**
 * Whether to run the fine grid on this device.
 *
 * False while there is no measurement. The probes produce one within a
 * second of the first map, and starting off and turning on is the safe
 * direction — starting on would mean every unknown device, including
 * every slow one, takes the full run once before finding out.
 */
export function fineGlobeAffordable(
  cost: RunCost | null,
  budgetMs: number = FINE_BUDGET_MS,
): boolean {
  const projected = projectedFineMs(cost);
  return projected !== null && projected <= budgetMs;
}

/**
 * The cost a run appears to have if its fixed part is ignored.
 *
 * Always an overstatement of the marginal cost, because the run's fixed
 * cost is divided among its points. That makes it useful in one
 * direction only: if this says the fine grid fits the budget, it fits.
 * The smallest reading is taken rather than the average, for the reason
 * `keepFastest` keeps minima — a run can be delayed but never hurried.
 */
export function naiveCost(samples: readonly CostSample[]): RunCost | null {
  const rates = samples
    .filter((s) => s.points > 0 && Number.isFinite(s.ms) && s.ms > 0)
    .map((s) => s.ms / s.points);
  return rates.length === 0
    ? null
    : { fixedMs: 0, msPerPoint: Math.min(...rates) };
}

/**
 * Whether the large probe is worth running on this device.
 *
 * Only when the question is still open: there is no trustworthy fit yet,
 * and the small probe does not already put the device far out of reach.
 * Answering false is not a refusal — it means the answer is already
 * known, one way or the other.
 */
export function calibrationWorthwhile(
  sharded: readonly CostSample[],
  budgetMs: number = FINE_BUDGET_MS,
): boolean {
  if (fitRunCost(sharded) !== null) return false;
  const rough = projectedFineMs(naiveCost(sharded));
  return rough !== null && rough <= budgetMs * HOPELESS_FACTOR;
}
