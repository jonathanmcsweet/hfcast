/**
 * One repeatable measurement of where the map's time goes.
 *
 * A Pixel 8 reported 3.9 seconds of engine time for the whole-world fine
 * grid. The same engine, the same 34,560 points, one hour and one band,
 * takes 1.24 seconds on one desktop core and 0.17 across eight. Phone
 * cores are two or three times slower than desktop ones, not twenty, so
 * most of that gap is not the arithmetic — and until it is found, every
 * decision about what the map can afford is a guess.
 *
 * The three candidates need opposite fixes, which is why this reports
 * them apart rather than as a total:
 *
 *   the engine        the prediction itself, inside Rust
 *   the crossing      turning a 2.9 MB answer into a Java string, and
 *                     handing it to JavaScript
 *   the parse         `JSON.parse` and building 34,560 objects, on the
 *                     thread that draws
 *
 * It runs from a fixed request rather than from whatever the screen is
 * showing, so two runs on two devices are the same work. Everything it
 * measures is also logged by the module itself under the `hfcast` tag —
 * see `setTracing` — so `adb logcat -s hfcast` collects the whole path
 * including the parts JavaScript cannot see.
 */
import * as Engine from '../../modules/engine-bridge';
import { timing } from './diagnostics';
import { threadsFor } from './engineBudget';
import { FINE_LAT_STEP, FINE_LON_STEP } from './fineGlobe';
import { latShards } from './shard';

/**
 * A station and a moment chosen once and never changed.
 *
 * Atlanta, August, an ordinary sunspot number, 40m at 18:00 UTC. The
 * numbers do not matter; that they are the same numbers every time does.
 * A benchmark whose input follows the screen measures a different amount
 * of work on every run.
 */
const FIXED = {
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
};

/** What one stage of the benchmark measured. */
export interface Stage {
  what: string;
  /** How many grid points it covered. */
  points: number;
  /** The engine and the crossing, which the module reports together. */
  nativeMs: number;
  /** `JSON.parse` and object building, on the thread that draws. */
  parseMs: number;
  totalMs: number;
}

export interface BenchmarkResult {
  cores: number;
  threads: number;
  stages: readonly Stage[];
}

/** One batch, timed. */
async function stage(
  what: string,
  requests: readonly unknown[],
  threads: number,
): Promise<Stage> {
  const startedAt = Date.now();
  const batch = await Engine.predictMany<{ points?: readonly unknown[]; }>(
    requests,
    threads,
  );
  return {
    what,
    points: batch.answers.reduce(
      (all, one) => all + (one.points?.length ?? 0),
      0,
    ),
    nativeMs: batch.nativeMs,
    parseMs: batch.parseMs,
    totalMs: Date.now() - startedAt,
  };
}

/**
 * How many threads the sweep tries, smallest first.
 *
 * A Pixel 8 measured the answer this sweep exists to find: the curve
 * turned at four threads, and eight was slower than two. The map asks
 * for the count where the curve turns (`MAX_THREADS`), and the sweep
 * keeps measuring past it on purpose — a device the cap does not suit
 * can only show that if the higher counts keep being run.
 *
 * Ascending order means the later, hotter runs fall on the higher counts.
 * That understates them a little, and that is the safe direction: a real
 * map run starts warm too.
 */
const SWEEP = [1, 2, 4, 8] as const;

/**
 * Runs the benchmark and returns what it measured.
 *
 * The stages, each answering one question the others cannot.
 *
 * The first is one strip on one thread. It is the honest per-core speed
 * of this device, with no pool and no sharing, and every other number is
 * read against it.
 *
 * Then the whole-world fine grid — the run that was measured at 3.9
 * seconds — once at each thread count in the sweep and once at the count
 * the map uses today. Together they draw the curve: where it stops
 * rising is the thread count this device is actually worth, and past the
 * peak the extra threads are only heat.
 *
 * The last is the same grid asked for as a whole day rather than one
 * hour — the run the corrected map added. It costs about fifteen times
 * one hour at the same places rather than twenty-four, and this is where
 * that is checked on real hardware rather than assumed from a desktop.
 */
export async function runBenchmark(): Promise<BenchmarkResult> {
  const cores = Engine.cores();
  const threads = threadsFor(cores);
  Engine.setTracing(true);

  const world = {
    ...FIXED,
    hour: 18,
    latStep: FINE_LAT_STEP,
    lonStep: FINE_LON_STEP,
  };
  const strips = latShards(undefined, FINE_LAT_STEP, FINE_LON_STEP, 16) ?? [];
  const first = strips[0];
  const grid = strips.map((bounds) => ({ ...world, ...bounds }));

  const stages: Stage[] = [];
  // Sequential on purpose: these share one engine, and stages running
  // together would each measure the others waiting.
  if (first !== undefined) {
    stages.push(
      await stage('one strip, one thread', [{ ...world, ...first }], 1),
    );
  }
  // The map's own count joins the fixed sweep, deduplicated, so the
  // count actually in use is always one of the measured points.
  const counts = [...new Set([...SWEEP, threads])].sort((a, b) => a - b);
  // A loop rather than `map`, because each run must finish before the
  // next starts: the sweep exists to measure thread counts one at a
  // time, and overlapped runs would measure each other.
  for (const count of counts) {
    stages.push(await stage(`fine grid, ${count} threads`, grid, count));
  }

  // The whole-day lattice, at the step the correction uses. Far fewer
  // places, far more hours at each.
  const day = {
    ...FIXED,
    hour: undefined,
    dailyMedian: true,
    latStep: 5,
    lonStep: 7.5,
  };
  // Split for the same reason `inStrips` does, and against the same
  // lowered threshold: 1,728 places is under the count that makes a
  // one-hour grid worth cutting and is fifteen times more work than it.
  const dayStrips = latShards(undefined, 5, 7.5, 8, 1) ?? [];
  stages.push(
    await stage(
      'daily middles, 5 by 7.5',
      dayStrips.map((bounds) => ({ ...day, ...bounds })),
      threads,
    ),
  );

  Engine.setTracing(false);

  // A loop rather than a map: this is iteration for its effect, and the
  // lines have to come out in the order the stages ran.
  for (const each of stages) {
    timing(`benchmark: ${each.what}`, {
      points: `${each.points} points`,
      native: each.nativeMs,
      parse: each.parseMs,
      total: each.totalMs,
    });
  }
  timing('benchmark: device', {
    cores: `${cores} cores`,
    threads: `${threads} threads`,
  });

  return { cores, threads, stages };
}
