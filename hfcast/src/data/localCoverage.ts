import * as Engine from '../../modules/hfcast-engine';
import type { Station } from '../store/useStationStore';
import { LAT_STEP, LON_STEP, reachOf } from './coverageGrid';
import { patchGrid, patchRequestBounds } from './coveragePatch';
import { stripsFor, threadsFor } from './engineBudget';
import { FINE_LAT_STEP, FINE_LON_STEP, packGlobe } from './fineGlobe';
import { engineStation, type Nowcast, ssnFor } from './localPredict';
import { requiredSnrFor } from './modes';
import { latShards } from './shard';
import {
  BAND_MHZ,
  BAND_ORDER,
  type BandKey,
  type Coverage,
  type CoveragePatch,
  type CoveragePoint,
  type Endpoint,
  type FineGlobe,
  type MapRegion,
} from './types';

/**
 * The coverage map, computed on the device.
 *
 * This mirrors `server/src/coverage.ts` the way `localPredict.ts` mirrors the
 * server's prediction: same grid, same reach threshold, same area weighting,
 * and the same engine underneath. Kept separate from the path forecast for the
 * reason the server keeps them separate — an area run answers one hour in
 * every direction, so a whole day is 24 runs rather than one.
 *
 * Cost, measured on the compiled-in engine: 192 points is 48 ms on a desktop
 * and 0.8 s for the ARM build under emulation, which puts a phone somewhere
 * between. That is comfortable for a map drawn when the user looks at it, and
 * it is why the hour is part of the query key rather than something recomputed
 * as a slider moves.
 */

/** Man-made noise at a residential site, dBW in 1 Hz. VOACAP's own default. */
const NOISE_DBW = -145;

interface WireCoverage {
  latStep?: number;
  lonStep?: number;
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
  points?: readonly CoveragePoint[];
}

/** Clamped here rather than trusted: the map colours by this number. */
const asPoint = (p: CoveragePoint): CoveragePoint => ({
  lat: p.lat,
  lon: p.lon,
  reliability: Math.min(1, Math.max(0, p.reliability)),
  takeoffAngleDeg: p.takeoffAngleDeg ?? null,
});

export const canMapLocally = (): boolean => Engine.isAvailable();

/**
 * Lets the screen draw a frame before the next piece of work.
 *
 * The engine's strips run on their own threads. Everything after them
 * does not: turning the answers into objects and packing them into
 * typed arrays happens on the thread that draws, and while it runs no
 * progress bar moves and no touch is answered. At 34,560 points that is
 * long enough to look like the app has stopped.
 *
 * A timeout of zero is the only yield React Native offers here that
 * lets the interface run. It does not make the work shorter — it breaks
 * one long block into pieces the screen can get between, which is the
 * difference between a slow device and a frozen one.
 */
const breathe = (): Promise<void> =>
  new Promise((resume) => setTimeout(resume, 0));

export interface LocalCoverageRequest {
  from: Endpoint;
  band: BandKey;
  /** UTC hour, 0-23. */
  hour: number;
  date: Date;
  station: Station;
  /** Absent offline, and then the run is climatology. */
  nowcast?: Nowcast;
  /**
   * The part of the world the map is showing, for the fine grid only.
   *
   * Absent means the whole globe, and then the fine grid goes around the
   * station — which is the same place the map is centred on, so the two
   * agree at the default view.
   */
  region?: MapRegion | null;
}

/** What the engine is asked, apart from the grid it covers. */
type AreaAsk = Record<string, unknown>;

/**
 * Runs one whole-world grid across this device's cores, and times it.
 *
 * The strips come from the device's own core count rather than from a
 * number written here, and the same function cuts the calibration probes
 * and the fine grid — which is what lets a line fitted through the two
 * probes say what the fine grid will cost. Three runs of different sizes
 * cut the same way share one fixed cost and one per-point cost; three
 * runs cut differently do not, and a fit across them would describe no
 * run that ever happens.
 *
 * Where the module is too old to run a batch, everything here runs
 * whole, probes included. That stays consistent for the same reason: the
 * fit then describes unsharded runs, which is what this device does.
 *
 * Generic over the answer because the same cut serves a one-band grid
 * and an every-band one. The strips are a property of the lattice, not
 * of how many frequencies each point carries.
 */
interface ShardedRun<T> {
  answers: T[];
  /** The whole wait, which is what the gate is fitted against. */
  elapsedMs: number;
  /** How much of it was the engine, and how much was parsing. */
  nativeMs: number;
  parseMs: number;
  /** How the grid was cut. One strip means it was not. */
  strips: number;
  threads: number;
}

async function shardedWholeWorld<T>(
  ask: AreaAsk,
  latStep: number,
  lonStep: number,
): Promise<ShardedRun<T>> {
  const cores = Engine.cores();
  // Cut into latitude strips so the batch can use more than one core.
  // The arithmetic is the server's, copied character for character, so
  // the two paths run the same lattice — see `shard.ts`. Null means the
  // grid should not be split, and then it runs whole.
  const strips = Engine.canBatch()
    ? latShards(undefined, latStep, lonStep, stripsFor(cores))
    : null;
  const request = { ...ask, latStep, lonStep };

  const threads = threadsFor(cores);
  const startedAt = Date.now();
  const batch = strips === null
    ? {
      answers: [await Engine.predict<T>(request)],
      // An unsharded run cannot separate the two: `predict` parses its
      // one answer inside itself. Charged to the engine rather than
      // split on a guess.
      nativeMs: Date.now() - startedAt,
      parseMs: 0,
    }
    : await Engine.predictMany<T>(
      strips.map((bounds) => ({ ...request, ...bounds })),
      threads,
    );
  return {
    ...batch,
    elapsedMs: Date.now() - startedAt,
    strips: strips === null ? 1 : strips.length,
    threads: strips === null ? 1 : threads,
  };
}

/** The part of a request that does not depend on the grid. */
async function areaAsk(request: LocalCoverageRequest, ssn: number) {
  const station = await engineStation(request.station);
  return {
    ...station,
    mode: 'area' as const,
    fromLat: request.from.lat,
    fromLon: request.from.lon,
    month: request.date.getUTCMonth() + 1,
    year: request.date.getUTCFullYear(),
    ssn,
    watts: request.station.watts,
    requiredSnrDb: requiredSnrFor(request.station.mode),
    noiseDbw: NOISE_DBW,
    hour: request.hour,
    freqMhz: BAND_MHZ[request.band],
  };
}

/**
 * Every band, in the increasing order the engine requires.
 *
 * `BAND_ORDER` runs the other way — it is the order the selector shows,
 * highest frequency first — and the engine refuses a list that is not
 * increasing, because each band's antenna table is installed in a
 * window cut halfway to its neighbours.
 */
const BANDS_BY_FREQ: readonly BandKey[] = [...BAND_ORDER].sort(
  (a, b) => BAND_MHZ[a] - BAND_MHZ[b],
);

const ALL_FREQS_MHZ: readonly number[] = BANDS_BY_FREQ.map((b) => BAND_MHZ[b]);

/**
 * One grid point as a multi-band answer states it: one row, every band.
 *
 * `reliability` and `takeoffAngleDeg` are arrays running parallel to the
 * frequencies asked for.
 */
interface WireBandPoint {
  lat: number;
  lon: number;
  reliability: readonly number[];
  takeoffAngleDeg: readonly (number | null)[];
}

interface WireBands {
  latStep?: number;
  lonStep?: number;
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
  freqsMhz?: readonly number[];
  points?: readonly WireBandPoint[];
}

/**
 * Pulls one band out of a multi-band answer.
 *
 * The engine echoes the frequencies it answered, and that echo is
 * checked rather than trusted: reading the arrays at the wrong index
 * would draw one band's map under another band's name, which is the
 * fault this app has already shipped once.
 */
function bandPoints(
  answer: WireBands,
  index: number,
): CoveragePoint[] {
  const echoed = answer.freqsMhz;
  if (echoed === undefined || echoed.length !== BANDS_BY_FREQ.length) {
    throw new Error('the engine did not say which bands it answered');
  }
  const asked = ALL_FREQS_MHZ[index] as number;
  const said = echoed[index] as number;
  if (Math.abs(said - asked) > 1e-4) {
    throw new Error(`the engine answered ${said} MHz where ${asked} was asked`);
  }
  return (answer.points ?? []).map((p) =>
    asPoint({
      lat: p.lat,
      lon: p.lon,
      reliability: p.reliability[index] ?? 0,
      takeoffAngleDeg: p.takeoffAngleDeg[index] ?? null,
    })
  );
}

/**
 * The coarse map, for every band at once.
 *
 * One run rather than nine. Almost everything an area run does before it
 * reaches a frequency — the coefficient interpolation, and the ionogram
 * built from it — is the same whatever the band, so nine bands asked for
 * together cost far less than nine bands asked for one at a time.
 * Measured in the engine over a 3,072-point grid: eight bands separately
 * 1,008 ms, eight bands in one pass 297 ms.
 *
 * The reader gets that as a band change that draws from memory instead
 * of running the engine again.
 *
 * It is safe to read one band out of this because the engine holds a
 * batch to exact equality with the same bands run alone — see
 * `tests/area_bands.rs` there. That is not a property VOACAP has: its
 * own multi-frequency area run reports the maximum over the
 * frequencies, which would saturate every map. This asks for something
 * different and the engine answers each band separately.
 */
export async function coverAllBandsLocally(
  request: LocalCoverageRequest,
): Promise<Record<BandKey, Coverage>> {
  const { ssn, basis } = ssnFor(
    request.date.getUTCFullYear(),
    request.date.getUTCMonth() + 1,
    request.nowcast,
  );
  const ask = await areaAsk(request, ssn);

  const startedAt = Date.now();
  const answer = await Engine.predict<WireBands>({
    ...ask,
    freqMhz: undefined,
    freqsMhz: ALL_FREQS_MHZ,
    latStep: LAT_STEP,
    lonStep: LON_STEP,
  });
  const elapsedMs = Date.now() - startedAt;

  const covered = BANDS_BY_FREQ.map((band, index) => {
    const points = bandPoints(answer, index);
    if (points.length === 0) {
      throw new Error(`the engine produced no coverage points for ${band}`);
    }
    return [band, {
      band,
      hour: request.hour,
      // The engine echoes the steps it used. Preferred over the steps
      // asked for, so the drawn cells match the grid that ran.
      latStep: answer.latStep ?? LAT_STEP,
      lonStep: answer.lonStep ?? LON_STEP,
      reach: reachOf(points),
      basis,
      points,
    }] as const;
  });

  console.log(
    `[hfcast] coarse grid ${covered.length} bands`
      + ` | ${(answer.points ?? []).length} points each`
      + ` | ${Math.round(elapsedMs)} ms`,
  );

  // Every band of `BANDS_BY_FREQ` is present, which is every `BandKey`,
  // but `fromEntries` cannot say so.
  return Object.fromEntries(covered) as unknown as Record<BandKey, Coverage>;
}

/**
 * The fine grid, over the whole world, on the device.
 *
 * Every device runs it (user, 2026-08-01). There is no measurement of
 * the device beforehand and no decision taken from one: the coarse map
 * is on screen the whole time, a progress bar runs beside it, and a
 * slow device simply finishes later than a fast one.
 *
 * The strips run on the module's own threads. Everything after them
 * runs on the thread that draws, so it is done a strip at a time with a
 * yield between — see `breathe`. That is what keeps a slow device
 * responsive rather than frozen, and it is the difference the gate used
 * to be protecting against without saying so.
 *
 * The result is packed into typed arrays before returning, so the
 * objects the engine produced are released rather than cached.
 */
export async function coverFineLocally(
  request: LocalCoverageRequest,
): Promise<FineGlobe> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  const { ssn, basis } = ssnFor(year, month, request.nowcast);
  const ask = await areaAsk(request, ssn);

  const run = await shardedWholeWorld<WireCoverage>(
    ask,
    FINE_LAT_STEP,
    FINE_LON_STEP,
  );
  const { answers, elapsedMs } = run;

  // Concatenated in strip order. The engine emits rows south to north,
  // the strips are cut south to north, so this is the sequence one run
  // would have produced — not the same points in some other order, which
  // is what the columnar packing depends on.
  //
  // A strip at a time, with a yield between, rather than one `flatMap`
  // over all sixteen. The work is the same; what changes is that the
  // screen gets sixteen chances to draw a frame while it happens
  // instead of none. A loop rather than a fold because the sequencing is
  // the point — the yields have to fall between the strips, which is
  // what a fold over an array cannot express.
  const packingAt = Date.now();
  const points: CoveragePoint[] = [];
  for (const answer of answers) {
    for (const point of answer.points ?? []) points.push(asPoint(point));
    await breathe();
  }
  if (points.length === 0) {
    throw new Error('the engine produced no fine coverage points');
  }

  const first = answers[0] as WireCoverage;
  const globe = packGlobe(request.band, request.hour, {
    band: request.band,
    hour: request.hour,
    latStep: first.latStep ?? FINE_LAT_STEP,
    lonStep: first.lonStep ?? FINE_LON_STEP,
    reach: 0,
    basis,
    points,
  });

  // Said out loud because the parts are charged to different places and
  // only one of them is the engine. The strips run on their own threads;
  // everything after them — one JSON string per strip parsed, 34,560
  // objects built, then packed into typed arrays — runs on the thread
  // that draws.
  //
  // This is the measurement that decides what to work on next, and the
  // two candidates need opposite fixes. If the engine half dominates,
  // the arithmetic is the target. If the parse and pack halves do, no
  // amount of engine work helps and the answer is to stop sending
  // 34,560 points through JSON at all.
  //
  // The strip and thread counts are here for a third possibility. A
  // phone measuring roughly what one core would manage, while claiming
  // eight threads, is a phone whose batch is not running in parallel —
  // a different fault again, and not visible in a total.
  console.log(
    `[hfcast] fine grid ${points.length} points`
      + ` | ${run.strips} strips on ${run.threads} threads`
      + ` | engine ${Math.round(run.nativeMs)} ms`
      + ` | parse ${Math.round(run.parseMs)} ms`
      + ` | unpack ${Math.round(Date.now() - packingAt)} ms`
      + ` | total ${Math.round(elapsedMs)} ms`,
  );

  return globe;
}

/**
 * The fine grid around the operator, at the same band and hour.
 *
 * A second run rather than a finer first one: the same step over the
 * whole globe would be about a hundred times the work, and the question
 * it answers — where the low bands reach without a skip zone — is only
 * about the region near the station.
 *
 * Cost, measured on the compiled-in engine at Denver, 40m, 18:00 UTC: 288
 * points in 55 ms against the coarse grid's 192 points in 42 ms, so about
 * 0.14 ms a point over a fixed cost that is the coefficient load. The
 * widest patch, at the latitude where the longitude span stops widening,
 * is 640 points. On a device that is the same multiple of the coarse run,
 * which is why this is a query of its own: the coarse map paints first
 * and this arrives after it rather than delaying it.
 *
 * Null where the station is near the antimeridian — see `patchBounds`.
 */
export async function coverPatchAllBandsLocally(
  request: LocalCoverageRequest,
): Promise<Record<BandKey, CoveragePatch> | null> {
  // Where the map is pointed, or the station when it is showing the
  // whole globe and the two are the same place anyway.
  const region = request.region;
  const grid = region
    ? patchGrid(region.lat, region.lon, region.halfLatDeg)
    : patchGrid(request.from.lat, request.from.lon);
  if (grid === null) return null;
  const box = patchRequestBounds(grid);

  const { ssn, basis } = ssnFor(
    request.date.getUTCFullYear(),
    request.date.getUTCMonth() + 1,
    request.nowcast,
  );
  const ask = await areaAsk(request, ssn);

  // Every band, as the coarse grid does and for the same reason: this
  // rectangle's ionosphere does not depend on which band is drawn over
  // it, and the reader changes band far more often than they pan.
  const startedAt = Date.now();
  const answer = await Engine.predict<WireBands>({
    ...ask,
    freqMhz: undefined,
    freqsMhz: ALL_FREQS_MHZ,
    latStep: grid.latStep,
    lonStep: grid.lonStep,
    ...box,
  });
  const elapsedMs = Date.now() - startedAt;

  const patched = BANDS_BY_FREQ.map((band, index) => {
    const points = bandPoints(answer, index);
    if (points.length === 0) {
      throw new Error(`the engine produced no patch points for ${band}`);
    }
    return [band, {
      band,
      hour: request.hour,
      latStep: answer.latStep ?? grid.latStep,
      lonStep: answer.lonStep ?? grid.lonStep,
      // The engine snaps the rectangle to its own lattice, so these are
      // the grid that ran rather than the one asked for.
      latMin: answer.latMin ?? grid.latMin,
      latMax: answer.latMax ?? grid.latMax,
      lonMin: answer.lonMin ?? grid.lonMin,
      lonMax: answer.lonMax ?? grid.lonMax,
      basis,
      points,
    }] as const;
  });

  console.log(
    `[hfcast] patch ${patched.length} bands`
      + ` | ${(answer.points ?? []).length} points each`
      + ` | ${Math.round(elapsedMs)} ms`,
  );

  return Object.fromEntries(patched) as unknown as Record<
    BandKey,
    CoveragePatch
  >;
}
