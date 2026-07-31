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
 * The median of the samples held, or null when there are none.
 *
 * A median rather than the newest reading or a mean. One run that
 * landed while the device was thermally throttled, or while another app
 * was compiling something, would otherwise flip the answer for a
 * feature that should not flicker on and off as a user changes bands.
 */
export function medianOf(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}
