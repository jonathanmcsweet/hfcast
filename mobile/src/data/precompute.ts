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
 * What it cannot do is run while the app is closed. React Native stops
 * the JavaScript that drives this when the app leaves the screen, so a
 * long job wants the app open and the device on a charger — which is
 * the arrangement it was designed for anyway.
 */
import type { BandKey } from '../../../shared/bands.ts';
import type { CentreField } from '../../../shared/correctMap';
import * as Engine from '../../modules/engine-bridge';
import { usePrecomputeStore } from '../store/usePrecomputeStore';
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

/** What a job needs to know. */
export interface PrecomputeAsk {
  from: Endpoint;
  station: Station;
  /** `stationKey` — the same string the file name is built from. */
  stationKey: string;
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
 * Set while a job should stop.
 *
 * Module state rather than store state because the loop reads it between
 * every grid, and a React store read is not what that wants.
 */
let stopping = false;

const monthTag = (run: MonthHour): string =>
  `${run.year}-${String(run.month).padStart(2, '0')}`;

/**
 * Stops the job.
 *
 * Both halves are needed. The flag stops the loop asking for more, and
 * `dropLater` gives up the pieces already queued — without it, stopping
 * would still work through everything the last grid had asked for.
 */
export function stopPrecompute(): void {
  stopping = true;
  dropLater(PRECOMPUTE_GROUP);
}

/**
 * Computes and stores every map a scope asks for that is not held.
 *
 * Returns when the job is finished or stopped. Failures of single grids
 * are counted and passed over: one hour that the engine refuses should
 * not cost the other 287.
 */
export async function precompute(ask: PrecomputeAsk): Promise<void> {
  if (!Engine.isAvailable() || !canStore()) return;
  if (usePrecomputeStore.getState().running) return;
  if (ask.bands.length === 0 || ask.months <= 0) return;

  stopping = false;
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
  // The lattice of daily middles, once a month rather than once a grid.
  // It does not depend on the hour and one call answers every band, so a
  // month of nine bands needs one of these and not 216.
  const centres = new Map<string, Record<BandKey, CentreField | null>>();
  let asked = false;

  try {
    // A loop rather than a fold or `Promise.all`: the grids must run one
    // at a time, and it has to be able to stop between any two of them.
    for (const job of jobs) {
      if (stopping) {
        asked = true;
        break;
      }
      const tag = monthTag(job.run);
      const date = new Date(`${tag}-01T00:00:00Z`);
      const base = {
        from: ask.from,
        station: ask.station,
        band: job.band,
        hour: job.run.hour,
        date,
      };

      try {
        let centre = centres.get(tag);
        if (centre === undefined) {
          centre = await centresLocally(
            base,
            FINE_CENTRE_LAT_STEP,
            FINE_CENTRE_LON_STEP,
            null,
            { group: PRECOMPUTE_GROUP },
          );
          centres.set(tag, centre);
        }

        const grid = await coverFineLocally(
          base,
          centre[job.band],
          PRECOMPUTE_GROUP,
        );
        if (await keepGlobe(job.id, grid)) {
          await makeRoom(ask.budgetBytes);
        }
        usePrecomputeStore.getState().advance(
          `${tag} ${String(job.run.hour).padStart(2, '0')}:00 ${job.band}`,
        );
      } catch (e) {
        if (wasDropped(e)) {
          // The job was stopped while this grid was in the queue. That
          // is not a failure, and nothing after it should run.
          asked = true;
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
    const state = usePrecomputeStore.getState();
    timing('computed ahead', {
      done: state.done,
      failed: state.failed,
      of: state.total,
      ms: Date.now() - startedAt,
    });
    state.finish(asked);
    stopping = false;
  }
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
          band,
          month: monthTag(run),
          hour: run.hour,
        },
      }))
      .filter((job) => !held.has(storedName(job.id)))
  );
}
