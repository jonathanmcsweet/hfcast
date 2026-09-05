import * as Engine from '../../modules/engine-bridge';
import { useDeviceStore } from '../store/useDeviceStore';
import {
  candidatesFor,
  chooseThreads,
  freshEnough,
  PROBE_LATTICES,
  type ProbeLattice,
  probeLattice,
  type Reading,
  tunedThreads,
} from './calibrateMath';
import { STRIPS_PER_THREAD, threadsFor } from './engineBudget';
import { dropLater, runLater, wasDropped } from './engineQueue';
import { latShards } from './shard';
import { APP_VERSION } from './version';

export { chooseThreads, type Reading } from './calibrateMath';

/**
 * Finding the thread count this device is actually worth.
 *
 * The right count is a property of the device's memory system, and the
 * devices this app is for are nothing alike: the maintainer's modern
 * test phone peaked at four threads with eight slower than two, a
 * desktop scales to eight, and an old four-core tablet may well peak
 * at two. No fixed number is right for all of them, so each device
 * measures its own — in the background, once, with probe work sized to
 * its own speed so a slow tablet calibrates on a small grid instead of
 * grinding through a large one.
 *
 * `threadsFor` stays as the starting value until a measurement exists,
 * and the Diagnostics sweep writes the same store when it runs — a
 * deliberate manual measurement outranks a background one.
 *
 * This is not the device gate this app once had and removed. That
 * decided whether a device was allowed the fine grid at all, and a
 * borderline device got nothing. This tunes a number where every
 * outcome is a working map; a wrong reading costs a few hundred
 * milliseconds, not a feature.
 */

/**
 * A station and a moment chosen once and never changed.
 *
 * Atlanta, August, an ordinary sunspot number, 40m at 18:00 UTC. The
 * values do not matter; that they are the same values on every device
 * and every run does — a probe whose input varied would measure a
 * different amount of work each time. The Diagnostics benchmark runs
 * the same request, so its numbers and these compare.
 */
export const PROBE_REQUEST = {
  itshfbc: '<embedded>',
  mode: 'area' as const,
  fromLat: 33.75,
  fromLon: -84.39,
  month: 8,
  year: 2026,
  ssn: 60,
  watts: 100,
  requiredSnrDb: -24,
  noiseDbw: -145,
  freqMhz: 7.1,
  hour: 18,
};

/** What `dropLater` matches on when calibration is given up. */
export const CALIBRATE_GROUP = 'calibrate';

/**
 * How long after the map settles the calibration starts.
 *
 * Well behind the band fill's own delay, so the reader's map and the
 * fill are already queued in front of it. The queue prefers the
 * reader's work anyway; the delay keeps the first minute's readings
 * clean rather than guarded.
 */
export const CALIBRATE_DELAY_MS = 30000;

/**
 * The thread count runs should use on this device.
 *
 * The measured count where one exists for this device and build, and
 * the starting rule where none does. Age does not disqualify a reading
 * here — an old measurement of this device beats a guess — it only
 * makes `calibrate` take a new one.
 */
export function tunedThreadsFor(cores: number): number {
  const measured = useDeviceStore.getState().measured;
  if (
    measured === null
    || measured.cores !== cores
    || measured.version !== APP_VERSION
  ) {
    return threadsFor(cores);
  }
  return tunedThreads(cores, measured.threads);
}

/** One probe batch: the lattice, cut for the count, timed by the bridge. */
async function oneRun(
  lattice: ProbeLattice,
  threads: number,
): Promise<Reading> {
  const request = {
    ...PROBE_REQUEST,
    latStep: lattice.latStep,
    lonStep: lattice.lonStep,
  };
  const strips = latShards(
    undefined,
    lattice.latStep,
    lattice.lonStep,
    threads * STRIPS_PER_THREAD,
    1,
  ) ?? [];
  const batch = await runLater(CALIBRATE_GROUP, () =>
    Engine.predictMany(
      strips.length > 0
        ? strips.map((bounds) => ({ ...request, ...bounds }))
        : [request],
      threads,
    ));
  return { threads, nativeMs: batch.nativeMs };
}

/** So one session measures at most once, however often the map remounts. */
let ran = false;

/**
 * Measures this device, in the background, and remembers the answer.
 *
 * Skips itself when there is no engine, nothing to compare, or a
 * measurement that still stands. Every engine call goes through the
 * background lane, so the reader's own work always runs first, and a
 * piece given up because the app is closing is not a fault.
 */
export async function calibrate(): Promise<void> {
  if (ran) return;
  if (!Engine.isAvailable() || !Engine.canBatch()) return;
  const cores = Engine.cores();
  const counts = candidatesFor(cores);
  if (counts.length < 2) return;
  const held = useDeviceStore.getState().measured;
  if (held !== null && freshEnough(held, cores, APP_VERSION, Date.now())) {
    return;
  }
  ran = true;
  try {
    // First the device's own speed, on the small lattice and one
    // thread, so the sweep below can be sized to this device.
    const smallest = PROBE_LATTICES[PROBE_LATTICES.length - 1] as ProbeLattice;
    const speed = await oneRun(smallest, 1);
    const pointMs = speed.nativeMs / smallest.points;
    const lattice = probeLattice(pointMs);

    // A loop rather than `map`: each candidate must run alone, because
    // two candidates running together would each measure the other.
    const readings: Reading[] = [];
    for (const count of counts) {
      readings.push(await oneRun(lattice, count));
    }

    const threads = chooseThreads(readings, threadsFor(cores));
    useDeviceStore.getState().setMeasured({
      threads,
      pointMs,
      cores,
      version: APP_VERSION,
      at: Date.now(),
    });
  } catch (e) {
    // A dropped piece means the app moved on; anything else leaves the
    // device unmeasured, which is the starting rule, not a fault. The
    // next session tries again either way.
    if (!wasDropped(e)) ran = false;
  }
}

/** Gives up any calibration still queued, for the map's unmount. */
export const dropCalibration = (): number => dropLater(CALIBRATE_GROUP);
