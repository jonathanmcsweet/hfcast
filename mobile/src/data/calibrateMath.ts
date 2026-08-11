/**
 * The decisions calibration makes, with nothing attached.
 *
 * Kept free of imports so the reasoning can be tested on its own, the
 * way `engineBudget.ts` is. `calibrate.ts` owns the engine calls and
 * the store; this module owns what to try, how much to try it on, and
 * which answer to believe.
 */

/**
 * The lattices a probe can run, largest first.
 *
 * The same whole-world grids the app itself runs, so a reading measures
 * the real workload. The probe picks the largest one this device can
 * run in the budget, from its own measured speed: a fast phone
 * calibrates on the full grid, an old tablet on the small lattice.
 */
export const PROBE_LATTICES = [
  { latStep: 1.25, lonStep: 1.5, points: 34560 },
  { latStep: 2.5, lonStep: 3, points: 8640 },
  { latStep: 5, lonStep: 7.5, points: 1728 },
] as const;

export type ProbeLattice = (typeof PROBE_LATTICES)[number];

/** About what one candidate's run may cost, on any device. */
export const PROBE_BUDGET_MS = 800;

/** One candidate's result. */
export interface Reading {
  threads: number;
  nativeMs: number;
}

/**
 * Which thread counts are worth trying on a device with these cores.
 *
 * Two always; four where it exists; the core count itself, up to
 * eight, where it is above four. A two-core device gets one candidate,
 * which is no comparison at all, and `calibrate` skips it.
 */
export function candidatesFor(cores: number): number[] {
  if (!Number.isFinite(cores)) return [];
  const top = Math.min(8, Math.floor(cores));
  const wanted = [2, 4, top].filter((count) => count >= 2 && count <= top);
  return [...new Set(wanted)].sort((a, b) => a - b);
}

/**
 * The largest lattice this device can probe inside the budget.
 *
 * `pointMs` is the one-thread speed, so the estimate overstates what a
 * parallel run will cost — which errs toward smaller probes on slower
 * devices, the safe direction.
 */
export function probeLattice(pointMs: number): ProbeLattice {
  const smallest = PROBE_LATTICES[PROBE_LATTICES.length - 1] as ProbeLattice;
  return (
    PROBE_LATTICES.find((each) => each.points * pointMs <= PROBE_BUDGET_MS)
      ?? smallest
  );
}

/**
 * The winning count, unless the win is too small to trust.
 *
 * The current count keeps its place unless a challenger beats it by
 * more than a tenth. Readings wobble with heat and background work,
 * and a number that flapped between four and eight on noise would be
 * worse than either.
 */
export function chooseThreads(
  readings: readonly Reading[],
  current: number,
): number {
  const fastest = [...readings].sort((a, b) => a.nativeMs - b.nativeMs)[0];
  if (fastest === undefined) return current;
  const held = readings.find((each) => each.threads === current);
  if (held !== undefined && fastest.nativeMs > held.nativeMs * 0.9) {
    return current;
  }
  return fastest.threads;
}

/** How long a measurement stands before it is taken again. */
export const REMEASURE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether the held measurement still describes this device and build.
 *
 * A new app version may carry a different engine, and a different core
 * count means a different device reading the same storage.
 */
export function freshEnough(
  measured: { cores: number; version: string; at: number; },
  cores: number,
  version: string,
  now: number,
): boolean {
  return (
    measured.cores === cores
    && measured.version === version
    && now - measured.at < REMEASURE_AFTER_MS
  );
}
