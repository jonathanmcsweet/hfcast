/**
 * How the whole-world grid is cut up for this device's cores.
 *
 * This module used to decide something as well: whether the device was
 * fast enough to be allowed the fine grid at all. That decision is gone
 * (user, 2026-08-01 — every device runs the full grid), and with it the
 * two probe runs, the fitted cost line, the budget it was compared
 * against, and the store that remembered the readings.
 *
 * The reason it is gone is worth keeping. The decision was all or
 * nothing: a device projecting 4,999 ms drew 34,560 points and a device
 * projecting 5,001 ms drew 192. That is a 180-fold difference in detail
 * from a 2 ms difference in speed, and wherever the line is drawn some
 * device sits just behind it and gets nothing. A fast phone was one of
 * them: it ran the grid, recorded its own 3.4 seconds, and that reading
 * put it over the budget so it was never asked again.
 *
 * What is left is arithmetic about strips, which is not a judgement
 * about any device.
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
 * How many threads a batch runs across, given the device's core count.
 *
 * Four, measured, not the core count assumed. A fast phone ran the
 * whole-world grid at every count (Diagnostics sweep, 2026-08-10):
 *
 *   threads   1        2        4        8
 *   grid      2606 ms  1987 ms  1753 ms  2164 ms
 *   cpu cost  2430 ms  3568 ms  5695 ms  10466 ms
 *
 * The curve turns at four. Eight was slower than two, and its log line
 * said why twice over: 7.7 strips in flight but only 5.2 cores held —
 * threads past four wait for cores the phone will not run flat out —
 * and each held core ran its strip four times slower than it runs
 * alone, which is cores fighting over memory. Both faults shrink as
 * the count comes down.
 *
 * The cpu row is the other half of the reason. Eight threads spent
 * nearly twice the processor-seconds of four to deliver a slower
 * answer: heat and battery for less than nothing.
 *
 * Two at the bottom, not one. A device reporting a single core is more
 * likely to be reporting badly than to have one, and two strips on one
 * core cost only the second strip's coefficient load.
 */
export const MAX_THREADS = 4;

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
