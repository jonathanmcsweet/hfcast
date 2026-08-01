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
 * device sits just behind it and gets nothing. A Pixel 8 was one of
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
