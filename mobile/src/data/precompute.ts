/**
 * Computing maps before they are needed.
 *
 * The case this is for, in the words it was asked in: a person sets the
 * app up at home, tells it to compute the months they care about, and
 * then has nothing to compute in the field. A prediction is monthly
 * climatology, so a map computed in August is right for the whole of
 * August, and the sunspot numbers for months ahead ship with the app —
 * see `ssn.ts` — so next month can be computed today without a network.
 *
 * Three rules hold it together.
 *
 * It runs behind the reader. Every engine call goes through the
 * background lane in pieces, so the longest anybody can wait behind it
 * is one piece — see `engineQueue.ts` and `shardedWholeWorld`. That
 * costs about half as long again as running in front, which is the
 * right trade for work nobody is waiting for.
 *
 * It never repeats itself. Anything already on disk is skipped before
 * the job starts, so somebody who computed three months and then asks
 * for a year pays for nine.
 *
 * It can always be stopped, and stopping loses only the grid in hand.
 * Every finished grid is on disk before the next one starts.
 *
 * It used to stop the moment the app left the screen, because Android
 * freezes a backgrounded process and the JavaScript driving this stops
 * with it. A foreground service now holds the process up for as long as
 * a job runs — see `PrecomputeService.kt` — so a job continues with the
 * screen locked and with the app swiped out of recents (user,
 * 2026-08-11). The price Android sets for that is a notification that
 * cannot be dismissed, so it carries the progress and a Stop button.
 *
 * It waits for a charger unless told not to. The long scope is about an
 * hour and a quarter of the engine at full tilt, and this app is for
 * devices carried somewhere with no charger in reach. That wait listens
 * for the charger rather than looking for it every few seconds: React
 * Native runs `setTimeout` off the screen's frame clock, which Android
 * stops when the screen goes off, so a job that was waiting stayed
 * waiting until somebody woke the phone (user, 2026-08-12). Nothing in
 * this file may wait on a timer for that reason.
 */
import type { BandKey } from '../../../shared/bands.ts';
import type { CentreField } from '../../../shared/correctMap';
import * as Engine from '../../modules/engine-bridge';
import { usePrecomputeStore } from '../store/usePrecomputeStore';
import { type EngineModel, useSettingsStore } from '../store/useSettingsStore';
import type { Station } from '../store/useStationStore';
import { FINE_CENTRE_LAT_STEP, FINE_CENTRE_LON_STEP } from './correctMap';
import { timing } from './diagnostics';
import { dropLater, wasDropped } from './engineQueue';
import { type MapIdentity, storedName } from './globeName';
import { canStore, keepGlobe, listStored, makeRoom } from './globeStore';
import { centresLocally, coverFineLocally } from './localCoverage';
import { type MonthHour, runsFor } from './precomputePlan';
import type { Endpoint } from './types';

/** What `dropLater` matches on when the job is stopped. */
export const PRECOMPUTE_GROUP = 'precompute';

/**
 * What the notification says, in the reader's language.
 *
 * Passed in rather than read here. This module has no business knowing
 * about i18n, and the native side that draws the notification has no
 * languages at all — so the words come from the screen that started the
 * job, which already has them.
 */
export interface PrecomputeLabels {
  /** The notification's title. */
  title: string;
  /** The button on the notification. */
  stop: string;
  /** The line under the title, given what is done and what is left. */
  progress: (done: number, total: number) => string;
  /** The line while it holds for a charger. */
  waiting: string;
}

/** What a job needs to know. */
export interface PrecomputeAsk {
  from: Endpoint;
  station: Station;
  /** `stationKey` — the same string the file name is built from. */
  stationKey: string;
  /** Which model computes them. Stored maps are filed under it. */
  engine: EngineModel;
  bands: readonly BandKey[];
  /** How many months from this one, including it. */
  months: number;
  /** How much room the stored maps may take in total. */
  budgetBytes: number;
}

/** One grid to compute. */
interface Job {
  run: MonthHour;
  band: BandKey;
  id: MapIdentity;
}

/**
 * The job in flight, or null when there is none.
 *
 * An `AbortController` rather than a boolean of this module's own. It is
 * the standard way to say "stop what you started", the same one
 * `spaceWeather.ts` hands to `fetch`, and its signal can be waited on as
 * well as read — which is what lets a job waiting for a charger notice
 * Stop at once instead of at the end of its next five-second sleep.
 *
 * Still one mutable value at module scope, because cancelling work in
 * flight is a change to the world by definition and something outside
 * the job has to be able to reach it. It is the edge, and it is one
 * line wide.
 */
let inFlight: AbortController | null = null;

const monthTag = (run: MonthHour): string =>
  `${run.year}-${String(run.month).padStart(2, '0')}`;

/**
 * Stops the job.
 *
 * Both halves are needed. The abort stops the loop asking for more, and
 * `dropLater` gives up the pieces already queued — without it, stopping
 * would still work through everything the last grid had asked for.
 */
export function stopPrecompute(): void {
  inFlight?.abort();
  dropLater(PRECOMPUTE_GROUP);
}

/**
 * Computes and stores every map a scope asks for that is not held.
 *
 * Returns when the job is finished or stopped. Failures of single grids
 * are counted and passed over: one hour that the engine refuses should
 * not cost the other 287.
 */
export async function precompute(
  ask: PrecomputeAsk,
  labels: PrecomputeLabels,
): Promise<void> {
  if (!Engine.isAvailable() || !canStore()) return;
  if (usePrecomputeStore.getState().running) return;
  if (ask.bands.length === 0 || ask.months <= 0) return;

  const controller = new AbortController();
  inFlight = controller;
  const { signal } = controller;
  const now = new Date();
  const jobs = await jobsFor(ask, {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    hour: now.getUTCHours(),
  });

  const store = usePrecomputeStore.getState();
  store.begin(jobs.length);
  if (jobs.length === 0) {
    usePrecomputeStore.getState().finish(false);
    return;
  }

  const startedAt = Date.now();
  // Stop on the notification ends the job exactly as the button in the
  // app does. One path out, so the disk is left in one state whichever
  // of the two somebody pressed.
  const unlisten = Engine.onBackgroundStop(stopPrecompute);
  Engine.startBackgroundWork(
    labels.title,
    labels.progress(0, jobs.length),
    0,
    jobs.length,
    labels.stop,
  );
  // The lattice of daily middles, once a month rather than once a grid.
  // It does not depend on the hour and one call answers every band, so a
  // month of nine bands needs one of these and not 216.
  const centres = new Map<string, Record<BandKey, CentreField | null>>();

  /**
   * The lattice for a month, computed at most once.
   *
   * The one effect in this loop that is not the work itself, so it is
   * named and kept to four lines rather than spread through the body.
   * Lazy rather than worked out up front: a job stopped after two months
   * should not have paid for the other ten.
   */
  const centresFor = async (
    tag: string,
    base: Parameters<typeof centresLocally>[0],
  ): Promise<Record<BandKey, CentreField | null>> => {
    const held = centres.get(tag);
    if (held !== undefined) return held;
    const found = await centresLocally(
      base,
      FINE_CENTRE_LAT_STEP,
      FINE_CENTRE_LON_STEP,
      null,
      { group: PRECOMPUTE_GROUP },
    );
    centres.set(tag, found);
    return found;
  };

  try {
    // A loop rather than a fold or `Promise.all`: the grids must run one
    // at a time, and it has to be able to stop between any two of them.
    for (const job of jobs) {
      // Every way out of this loop is a stop, and the signal already
      // says so — `dropLater` is called by nothing but `stopPrecompute`,
      // which aborts. A second flag saying the same thing would be one
      // more place for the two to disagree.
      if (signal.aborted) break;
      if (!await waitForCharger(labels, jobs.length, signal)) break;
      const tag = monthTag(job.run);
      const date = new Date(`${tag}-01T00:00:00Z`);
      const base = {
        from: ask.from,
        station: ask.station,
        band: job.band,
        hour: job.run.hour,
        date,
        // No live reading is passed with it, so this is the offline
        // form of the new model: the engine derives its own index from
        // the built-in day-of-year correction. That is the form a map
        // computed ahead should hold, because a map is read in the
        // field where there is no network to improve on it.
        engine: ask.engine,
      };

      try {
        const centre = await centresFor(tag, base);

        // No lattice for this band means the correction cannot be
        // applied, and an uncorrected grid must not be stored: it would
        // be read back for the rest of the month in place of a grid the
        // app could have corrected, and it would look exactly like one
        // that had been. Counted as a failure and passed over, which is
        // the same thing the query path does by not writing at all.
        const centreHere = centre[job.band];
        if (centreHere === null) {
          usePrecomputeStore.getState().fail();
          timing('no daily middles to correct a map computed ahead', {
            at: `${tag} ${job.run.hour} ${job.band}`,
          });
          continue;
        }

        const grid = await coverFineLocally(base, centreHere, PRECOMPUTE_GROUP);
        if (await keepGlobe(job.id, grid)) {
          await makeRoom(ask.budgetBytes);
        }
        usePrecomputeStore.getState().advance(
          `${tag} ${String(job.run.hour).padStart(2, '0')}:00 ${job.band}`,
        );
        const moved = usePrecomputeStore.getState();
        Engine.startBackgroundWork(
          labels.title,
          labels.progress(moved.done, moved.total),
          moved.done,
          moved.total,
          labels.stop,
        );
      } catch (e) {
        if (wasDropped(e)) {
          // The job was stopped while this grid was in the queue. That
          // is not a failure, and nothing after it should run.
          break;
        }
        usePrecomputeStore.getState().fail();
        timing('a map could not be computed ahead', {
          at: `${tag} ${job.run.hour} ${job.band}`,
          why: String(e),
        });
      }
    }
  } finally {
    unlisten();
    Engine.stopBackgroundWork();
    const state = usePrecomputeStore.getState();
    timing('computed ahead', {
      done: state.done,
      failed: state.failed,
      of: state.total,
      ms: Date.now() - startedAt,
    });
    state.finish(signal.aborted);
    // Only if it is still this job's. A later job would have put its own
    // controller here, and clearing that would leave it uncancellable.
    if (inFlight === controller) inFlight = null;
  }
}

/** Whether the person still wants the job held back for a charger. */
const chargerWanted = (): boolean =>
  useSettingsStore.getState().precomputeOnCharger;

/** Whether there is any reason left to keep waiting. */
const stillWaiting = (signal: AbortSignal): boolean =>
  !signal.aborted && chargerWanted() && !Engine.isCharging();

/**
 * Resolves the next time anything that could end the wait happens.
 *
 * Three things can: the charger goes in, the person turns the charger
 * rule off, or the job is stopped. Each is an event, and none of them is
 * a timer — see `onPowerChanged` for why a timer cannot be used here.
 * Whichever arrives first drops all three, so a wait of an hour costs
 * one wake-up rather than seven hundred.
 */
function nextChange(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const finish = () => {
      offPower();
      offSetting();
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const offPower = Engine.onPowerChanged(finish);
    // Every settings change rather than this one alone, because the store
    // reports the whole state. The caller checks what it cares about
    // afterwards, so a wake-up for the wrong setting costs a comparison.
    const offSetting = useSettingsStore.subscribe(finish);
    signal.addEventListener('abort', finish);
  });
}

/**
 * Holds until the device is on power, if that is what was asked for.
 *
 * Returns false only when the job was stopped while waiting, which the
 * caller treats exactly as Stop — the signal is read again on the way
 * out rather than trusted from before the wait.
 *
 * The rule is read on every pass rather than once at the top, so turning
 * the switch off during a wait starts the work rather than being noticed
 * whenever the next map happens to finish.
 */
async function waitForCharger(
  labels: PrecomputeLabels,
  total: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (!stillWaiting(signal)) return !signal.aborted;

  const store = usePrecomputeStore.getState();
  store.setWaiting(true);
  Engine.startBackgroundWork(
    labels.title,
    labels.waiting,
    store.done,
    total,
    labels.stop,
  );
  timing('waiting for a charger before computing more maps', {
    done: store.done,
    of: total,
  });

  try {
    // A loop because each wait has to follow the one before it. Anything
    // that built the waits as values would have to know how many there
    // were, and that is exactly what is not known — it is however long
    // somebody takes to reach a charger.
    while (stillWaiting(signal)) {
      await nextChange(signal);
    }
  } finally {
    usePrecomputeStore.getState().setWaiting(false);
  }
  return !signal.aborted;
}

/**
 * How many grids a scope would still compute.
 *
 * The same list the job itself works from, so the number a person is
 * shown before they start is the number of grids that will be computed
 * — not what a fresh device would have had to do. Somebody who computed
 * three months last week and asks for a year is told the cost of the
 * other nine.
 */
export async function remainingFiles(ask: PrecomputeAsk): Promise<number> {
  if (!canStore() || ask.bands.length === 0 || ask.months <= 0) return 0;
  const now = new Date();
  const jobs = await jobsFor(ask, {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    hour: now.getUTCHours(),
  });
  return jobs.length;
}

/**
 * Every grid the scope asks for that is not already stored.
 *
 * The list is worked out once, before anything runs, so the number a
 * person is shown is the work left rather than the work a fresh device
 * would have had. Read from the directory listing rather than by asking
 * for each file, which would be one read for every hour of the year.
 */
async function jobsFor(
  ask: PrecomputeAsk,
  from: { year: number; month: number; hour: number; },
): Promise<readonly Job[]> {
  const listed = await listStored();
  const held = new Set(listed.map((one) => one.name));
  return runsFor(from, ask.months).flatMap((run) =>
    ask.bands
      .map((band) => ({
        run,
        band,
        id: {
          grid: ask.from.grid,
          station: ask.stationKey,
          engine: ask.engine,
          band,
          month: monthTag(run),
          hour: run.hour,
        },
      }))
      .filter((job) => !held.has(storedName(job.id)))
  );
}
