import { AppState } from 'react-native';

import type {
  WireCoverage,
  WireCoveragePoint,
  WireMedians,
} from '../../../shared/wire.ts';
import * as Engine from '../../modules/engine-bridge';
import type { EngineModel } from '../store/useSettingsStore';
import type { Station } from '../store/useStationStore';
import { breathe } from './breathe.ts';
import { tunedThreadsFor } from './calibrate';
import { factorsFor } from './correct';
import {
  type CentreField,
  centreField,
  type CentrePoint,
  correctCoverage,
  type RawCoveragePoint,
} from './correctMap';
import { LAT_STEP, LON_STEP, reachOf } from './coverageGrid';
import { patchGrid, patchRequestBounds } from './coveragePatch';
import { timing } from './diagnostics';
import { STRIPS_PER_THREAD } from './engineBudget';
import { BACKGROUND_PIECE_POINTS, runLater, runNow } from './engineQueue';
import { FINE_LAT_STEP, FINE_LON_STEP, packGlobe } from './fineGlobe';
import {
  engineFields,
  engineStation,
  type Nowcast,
  ssnFor,
} from './localPredict';
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
 * Mirrors `server/src/coverage.ts`: same grid, same reach threshold, same
 * area weighting, same engine. Separate from the path forecast because an
 * area run answers one hour in every direction, so a whole day is 24 runs.
 *
 * Cost on the compiled-in engine: 192 points is 48 ms on a desktop and
 * 0.8 s for the ARM build under emulation, so a phone is between. Fine
 * for a map drawn when the reader looks at it, which is why the hour is
 * in the query key rather than recomputed as a slider moves.
 */

/** Man-made noise at a residential site, dBW in 1 Hz. VOACAP's own default. */
const NOISE_DBW = -145;

/**
 * One point as the map holds it, before the correction.
 *
 * Reliability is clamped rather than trusted, because the map colours by
 * it. Signal level and deciles pass through as reported: `correctMap.ts`
 * is the only reader and decides what an absent one means.
 */
const asPoint = (p: WireCoveragePoint): RawCoveragePoint => ({
  lat: p.lat,
  lon: p.lon,
  reliability: Math.min(1, Math.max(0, p.reliability)),
  takeoffAngleDeg: p.takeoffAngleDeg ?? null,
  snr: p.snr,
  snrLowDecile: p.snrLowDecile ?? null,
  snrUpDecile: p.snrUpDecile ?? null,
});

export const canMapLocally = (): boolean => Engine.isAvailable();

/**
 * Whether there is a screen to yield to, and so whether a yield works.
 *
 * The one effect behind `breathe`, kept here at the edge. See that
 * module for why the two questions have the same answer.
 */
const onScreen = (): boolean => AppState.currentState === 'active';

export interface LocalCoverageRequest {
  from: Endpoint;
  band: BandKey;
  /** UTC hour, 0-23. */
  hour: number;
  date: Date;
  station: Station;
  /** Absent offline, and then the run is climatology. */
  nowcast?: Nowcast | undefined;
  /** Which model answers. Absent runs the classic engine unchanged. */
  engine?: EngineModel | undefined;
  /**
   * The part of the world the map is showing, for the fine grid only.
   * Absent means the whole globe, and the fine grid goes around the
   * station — where the map is centred, so the two agree by default.
   */
  region?: MapRegion | null;
}

/** What the engine is asked, apart from the grid it covers. */
type AreaAsk = Record<string, unknown>;

/**
 * Runs one whole-world grid across this device's cores, and times it.
 *
 * The strips follow the device's core count, and the same function cuts
 * the calibration probes and the fine grid — which is what lets a line
 * fitted through the probes predict the grid. Runs cut the same way share
 * one fixed and one per-point cost; runs cut differently do not, and a
 * fit across them would describe no run that happens.
 *
 * Where the module is too old to batch, everything runs whole, probes
 * included, so the fit still describes what this device does.
 *
 * Generic over the answer: the same cut serves a one-band grid and an
 * every-band one, since strips are a property of the lattice.
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
  /**
   * Set to run behind the reader instead of in front of them.
   *
   * Used by computing ahead (`precompute.ts`). It changes the cut and the
   * lane: pieces are sized against `BACKGROUND_PIECE_POINTS` rather than
   * the thread count and queued separately, because the longest delay
   * background work can cause a reader is one piece. A whole grid as one
   * piece is over a second on a phone and several on a tablet.
   *
   * The cost is that pieces run one at a time, so a grid takes about half
   * as long again — 2,589 ms against 1,748 on the phone measured. The
   * right trade for work nobody is waiting for.
   */
  behind: string | null = null,
): Promise<ShardedRun<T>> {
  if (behind !== null) {
    return await inBackgroundStrips<T>(ask, latStep, lonStep, behind);
  }
  const cores = Engine.cores();
  // The measured count where this device has one, the starting rule
  // otherwise (`calibrate.ts`). The strips follow it, so a device tuned
  // to two threads is not cut sixteen ways.
  const threads = tunedThreadsFor(cores);
  // Latitude strips, so the batch can use more than one core. The
  // arithmetic is the server's, copied character for character, so both
  // paths run the same lattice (`shard.ts`). Null runs the grid whole.
  const strips = Engine.canBatch()
    ? latShards(undefined, latStep, lonStep, threads * STRIPS_PER_THREAD)
    : null;
  const request = { ...ask, latStep, lonStep };
  const startedAt = Date.now();
  const batch = await runNow(async () =>
    strips === null
      ? {
        answers: [await Engine.predict<T>(request)],
        // An unsharded run cannot separate the two: `predict` parses its
        // one answer inside itself. Charged to the engine, not guessed.
        nativeMs: Date.now() - startedAt,
        parseMs: 0,
      }
      : await Engine.predictMany<T>(
        strips.map((bounds) => ({ ...request, ...bounds })),
        threads,
      )
  );
  return {
    ...batch,
    elapsedMs: Date.now() - startedAt,
    strips: strips === null ? 1 : strips.length,
    threads: strips === null ? 1 : threads,
  };
}

/**
 * The same grid, cut small and run behind the reader.
 *
 * What `inStrips` does for the lattice of daily middles, for the
 * whole-world grid: twenty times as many places at one hour.
 *
 * One piece at a time, never together — cutting it up is the only thing
 * that bounds how long a reader can wait behind it.
 */
async function inBackgroundStrips<T>(
  ask: AreaAsk,
  latStep: number,
  lonStep: number,
  group: string,
): Promise<ShardedRun<T>> {
  const rows = Math.round(180 / latStep);
  const columns = Math.round(360 / lonStep);
  const pieces = Math.max(
    1,
    Math.min(
      Math.floor(rows / 2),
      Math.ceil((rows * columns) / BACKGROUND_PIECE_POINTS),
    ),
  );
  const request = { ...ask, latStep, lonStep };
  // The threshold is lowered as `inStrips` lowers it: this cut is about
  // how long a reader waits, not about spreading work over cores.
  const strips = latShards(undefined, latStep, lonStep, pieces, 1);
  const startedAt = Date.now();
  if (strips === null) {
    const answer = await runLater(group, () => Engine.predict<T>(request));
    return {
      answers: [answer],
      elapsedMs: Date.now() - startedAt,
      nativeMs: Date.now() - startedAt,
      parseMs: 0,
      strips: 1,
      threads: 1,
    };
  }

  // A loop rather than `Promise.all` over a map: the pieces must not run
  // together, which is the whole point of cutting them.
  const answers: T[] = [];
  for (const bounds of strips) {
    answers.push(
      await runLater(group, () => Engine.predict<T>({ ...request, ...bounds })),
    );
  }
  const elapsedMs = Date.now() - startedAt;
  return {
    answers,
    elapsedMs,
    // `predict` parses its own answer inside itself, so the two cannot
    // be separated. Charged to the engine, as the unsharded path does.
    nativeMs: elapsedMs,
    parseMs: 0,
    strips: strips.length,
    threads: 1,
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
    // The same pair of forms the path forecast sends, from the same
    // place, so a map and a forecast cannot describe different models.
    ...engineFields(request.engine, request.date, ssn, request.nowcast),
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
 * `BAND_ORDER` runs the other way, highest first, as the selector shows
 * them. The engine refuses a list that is not increasing: each band's
 * antenna table is installed in a window cut halfway to its neighbours.
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
  /**
   * What the correction reads, one entry a band. Optional because an
   * answer cached before engine 0.68.0 does not carry them, and a point
   * without them is left as the engine reported it.
   */
  snr?: readonly number[];
  snrLowDecile?: readonly (number | null)[];
  snrUpDecile?: readonly (number | null)[];
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
 * Pulls one band out of a multi-band answer. The engine echoes the
 * frequencies it answered, and the echo is checked rather than trusted:
 * see `checkEcho`.
 */
function bandPoints(
  answer: WireBands,
  index: number,
): RawCoveragePoint[] {
  checkEcho(answer.freqsMhz, index);
  return (answer.points ?? []).map((p) =>
    asPoint({
      lat: p.lat,
      lon: p.lon,
      reliability: p.reliability[index] ?? 0,
      takeoffAngleDeg: p.takeoffAngleDeg[index] ?? null,
      snr: p.snr?.[index],
      snrLowDecile: p.snrLowDecile?.[index] ?? null,
      snrUpDecile: p.snrUpDecile?.[index] ?? null,
    })
  );
}

/**
 * Holds the engine to the band it was asked about. Reading the arrays at
 * the wrong index draws one band's map under another band's name, which
 * this app has shipped once already.
 */
function checkEcho(echoed: readonly number[] | undefined, index: number): void {
  if (echoed === undefined || echoed.length !== BANDS_BY_FREQ.length) {
    throw new Error('the engine did not say which bands it answered');
  }
  const asked = ALL_FREQS_MHZ[index] as number;
  const said = echoed[index] as number;
  if (Math.abs(said - asked) > 1e-4) {
    throw new Error(`the engine answered ${said} MHz where ${asked} was asked`);
  }
}

/**
 * The middle of the day at every point of a lattice, for one band or all.
 *
 * The one thing the correction needs from the other 23 hours, computed in
 * a single pass (`dailyMedian` in `hfcast-engine/src/service.rs`). It
 * depends on neither the hour nor the storm widening, which touches only
 * the spread, so one answer serves every hour scrubbed to.
 *
 * `bands` null asks for every band together, as the coarse lattice does:
 * one pass over them all costs far less than one each.
 *
 * The whole lattice arrives in one call, so this uses `predict` rather
 * than a batch. The lattices are small — 192 points, or 1,728 fine — and
 * asking for the day at once saves more than spreading them over cores.
 */
export async function centresLocally(
  request: LocalCoverageRequest,
  latStep: number,
  lonStep: number,
  band: BandKey | null,
  /**
   * Set to fill a band in behind the map instead of in front of it.
   *
   * Background work is cut into strips, each queued on its own, so the
   * longest a reader waits is one strip. See `engineQueue.ts`.
   */
  behind: { group: string; } | null = null,
): Promise<Record<BandKey, CentreField | null>> {
  const { ssn } = ssnFor(
    request.date.getUTCFullYear(),
    request.date.getUTCMonth() + 1,
    request.nowcast,
  );
  const ask = await areaAsk(request, ssn);
  const bands = band === null ? BANDS_BY_FREQ : [band];
  const body = {
    ...ask,
    hour: undefined,
    dailyMedian: true,
    freqMhz: band === null ? undefined : BAND_MHZ[band],
    freqsMhz: band === null ? ALL_FREQS_MHZ : undefined,
    latStep,
    lonStep,
  };

  const startedAt = Date.now();
  const answer = behind === null
    ? await runNow(() => Engine.predict<WireMedians>(body))
    : await inStrips(body, latStep, lonStep, behind.group);
  const elapsedMs = Date.now() - startedAt;

  const rows = answer.points ?? [];
  const fields = bands.map((each, index) => {
    // A one-band answer carries a number where a several-band answer
    // carries an array. Checked against the echo like every other
    // several-band read.
    if (band === null) checkEcho(answer.freqsMhz, index);
    const centres: CentrePoint[] = rows.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      medianSnr: typeof p.medianSnr === 'number'
        ? p.medianSnr
        : (p.medianSnr[index] ?? 0),
    }));
    return [
      each,
      centreField(
        centres,
        answer.latStep ?? latStep,
        answer.lonStep ?? lonStep,
      ),
    ] as const;
  });

  timing('daily middles', {
    lattice: `${latStep} by ${lonStep}`,
    bands: `${bands.length} bands`,
    points: `${rows.length} points`,
    where: behind === null ? 'in front' : 'behind',
    ms: elapsedMs,
  });

  return Object.fromEntries(fields) as Record<BandKey, CentreField | null>;
}

/**
 * A whole-day lattice run one strip at a time, behind the map.
 *
 * The gaps between the strips are the point. The engine module takes one
 * request at a time and cannot be interrupted, so a background run holds
 * a reader up for one piece (`engineQueue.ts`). Whole, a fine lattice is
 * over a second of engine time; in strips a fraction of that.
 *
 * A whole day at one point costs about fifteen times an hour there, so
 * the strips are cut against a budget in hours of work rather than in
 * places. Sequential on purpose: asking for them together would put the
 * whole lattice in the queue at once and defeat the cutting.
 */
async function inStrips(
  body: AreaAsk,
  latStep: number,
  lonStep: number,
  group: string,
): Promise<WireMedians> {
  const rows = Math.round(180 / latStep);
  const columns = Math.round(360 / lonStep);
  const pieces = Math.max(
    1,
    Math.min(
      Math.floor(rows / 2),
      Math.ceil(
        (rows * columns * HOURS_IN_A_DAY_RUN) / BACKGROUND_PIECE_POINTS,
      ),
    ),
  );
  // The threshold is lowered to one strip's worth: splitting here is not
  // about speed. A lattice of 1,728 places is under the count that makes
  // a one-hour grid worth cutting, and far more work than it describes.
  const strips = latShards(undefined, latStep, lonStep, pieces, 1);
  if (strips === null) {
    return await runLater(group, () => Engine.predict<WireMedians>(body));
  }

  // A loop rather than `Promise.all` over a map: the strips must not run
  // together, which is the whole point of cutting them.
  const parts: WireMedians[] = [];
  for (const bounds of strips) {
    parts.push(
      await runLater(
        group,
        () => Engine.predict<WireMedians>({ ...body, ...bounds }),
      ),
    );
  }
  // Joined south to north, which is the order the strips were cut in and
  // the order one whole run would have emitted.
  return {
    ...(parts[0] ?? {}),
    points: parts.flatMap((part) => part.points ?? []),
  };
}

/**
 * How much dearer a whole day is than one hour at the same place.
 *
 * About two fifths of an area run is setting the place up, so 24 hours in
 * one pass costs about 15 times one hour rather than 24. Measured with
 * `HFCAST_PERF=1` in the engine.
 */
const HOURS_IN_A_DAY_RUN = 15;

/**
 * The coarse map, for every band at once.
 *
 * One run rather than one a band. Almost everything an area run does
 * before it reaches a frequency — the coefficient interpolation and the
 * ionogram built from it — is the same whatever the band. Measured in the
 * engine over a 3,072-point grid: eight bands separately 1,008 ms, in one
 * pass 297 ms. The reader gets a band change drawn from memory.
 *
 * Safe to read one band out of, because the engine holds a batch to exact
 * equality with the same bands run alone (`tests/area_bands.rs` there).
 * Not a property VOACAP has: its own multi-frequency area run reports the
 * maximum over the frequencies, which would saturate every map.
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
  const answer = await runNow(() =>
    Engine.predict<WireBands>({
      ...ask,
      freqMhz: undefined,
      freqsMhz: ALL_FREQS_MHZ,
      latStep: LAT_STEP,
      lonStep: LON_STEP,
    })
  );
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
      // The share of the world this reaches, as the engine gave it.
      // Recomputed once the correction arrives (`correctedCoverage`):
      // the sentence beside the map has to describe the map above it.
      reach: reachOf(points),
      basis,
      points,
    }] as const;
  });

  timing('coarse grid', {
    bands: `${covered.length} bands`,
    points: `${(answer.points ?? []).length} points each`,
    ms: elapsedMs,
  });

  // Every band of `BANDS_BY_FREQ` is present, which is every `BandKey`,
  // but `fromEntries` cannot say so.
  return Object.fromEntries(covered) as unknown as Record<BandKey, Coverage>;
}

/**
 * The fine grid, over the whole world, on the device.
 *
 * Every device runs it (user, 2026-08-01), with no measurement first: the
 * coarse map stays on screen, a progress bar runs beside it, and a slow
 * device finishes later than a fast one.
 *
 * The strips run on the module's threads; everything after them runs on
 * the thread that draws, a strip at a time with a yield between
 * (`breathe`). That is what keeps a slow device responsive. The result is
 * packed into typed arrays, so the engine's objects are released.
 *
 * `centre` is the lattice of daily middles the correction needs, applied
 * here before packing. The packed form holds reliability and the take-off
 * angle alone — 276 KB a grid against about 690 KB if it kept the signal
 * level and both deciles for a later correction. Twenty-four are held at
 * once: 6.6 MB against 16.5.
 *
 * So a grid is corrected by the lattice that existed when it ran, and a
 * better one afterwards does not improve it. That is why the fine grid
 * waits for the fine lattice: rebuilding 34,560 points to move a few
 * colours is the most expensive thing this application can do.
 */
export async function coverFineLocally(
  request: LocalCoverageRequest,
  centre: CentreField | null,
  /** Set to compute ahead, behind the reader. See `shardedWholeWorld`. */
  behind: string | null = null,
): Promise<FineGlobe> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  const { ssn, basis } = ssnFor(year, month, request.nowcast);
  const ask = await areaAsk(request, ssn);

  const run = await shardedWholeWorld<WireCoverage>(
    ask,
    FINE_LAT_STEP,
    FINE_LON_STEP,
    behind,
  );
  const { answers, elapsedMs } = run;

  // Concatenated in strip order. The engine emits rows south to north and
  // the strips are cut south to north, so this is the sequence one run
  // would have produced, which the columnar packing depends on.
  //
  // A strip at a time with a yield between, not one `flatMap` over all
  // sixteen: same work, but the screen gets sixteen chances to draw a
  // frame. A loop rather than a fold because the yields have to fall
  // between the strips. The correction goes in the same pass, being
  // 34,560 more pieces of arithmetic on the thread that draws.
  const packingAt = Date.now();
  const factors = factorsFor(request.nowcast?.kpMax24h ?? null);
  const required = requiredSnrFor(request.station.mode);
  const points: CoveragePoint[] = [];
  for (const answer of answers) {
    const raw = (answer.points ?? []).map(asPoint);
    for (const point of correctCoverage(raw, centre, required, factors)) {
      points.push(point);
    }
    // Skipped when the app is off screen, where a job computing ahead
    // spends most of its life: nothing to draw, and the timeout behind
    // this would not fire.
    await breathe(onScreen());
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

  // Split out because the parts are charged to different places and only
  // one is the engine. The strips run on their own threads; the parse of
  // one JSON string per strip, 34,560 objects built and then packed, runs
  // on the thread that draws.
  //
  // The two candidates need opposite fixes: if the engine half dominates
  // the arithmetic is the target, and if parse and pack do, no engine
  // work helps and the answer is to stop sending 34,560 points through
  // JSON. The strip and thread counts cover a third case — a phone
  // measuring one core's work while claiming eight threads is one whose
  // batch is not running in parallel, invisible in a total.
  timing('fine grid', {
    points: `${points.length} points`,
    cut: `${run.strips} strips on ${run.threads} threads`,
    engine: run.nativeMs,
    parse: run.parseMs,
    unpack: Date.now() - packingAt,
    total: elapsedMs,
  });

  return globe;
}

/**
 * The fine grid around the operator, at the same band and hour.
 *
 * A second run rather than a finer first one: the same step over the
 * whole globe is about a hundred times the work, and the question — where
 * the low bands reach without a skip zone — is about the region near the
 * station.
 *
 * Cost on the compiled-in engine at Denver, 40m, 18:00 UTC: 288 points in
 * 55 ms against the coarse grid's 192 in 42 ms, so about 0.14 ms a point
 * over the coefficient load. The widest patch is 640 points. Its own
 * query, so the coarse map paints first and this arrives after.
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

  // Every band, as the coarse grid does: this rectangle's ionosphere does
  // not depend on the band, and readers change band more often than pan.
  const startedAt = Date.now();
  const answer = await runNow(() =>
    Engine.predict<WireBands>({
      ...ask,
      freqMhz: undefined,
      freqsMhz: ALL_FREQS_MHZ,
      latStep: grid.latStep,
      lonStep: grid.lonStep,
      ...box,
    })
  );
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

  timing('patch', {
    bands: `${patched.length} bands`,
    points: `${(answer.points ?? []).length} points each`,
    ms: elapsedMs,
  });

  return Object.fromEntries(patched) as unknown as Record<
    BandKey,
    CoveragePatch
  >;
}

/**
 * The coarse map, corrected, with its reach percentage recomputed.
 *
 * Applied on read, not on run, so the map appears at once and becomes
 * correct a moment later without being computed twice. Affordable here
 * and nowhere else: 192 points against 34,560 for the fine grid.
 *
 * Reach is recomputed from the corrected cells because it is a sentence
 * about the map — "40m reaches about 8% of the world".
 *
 * A null lattice returns the coverage unchanged, which is the state of
 * the map for the first fraction of a second.
 */
export function correctedCoverage(
  coverage: Coverage,
  centre: CentreField | null,
  station: Station,
  kpMax24h: number | null,
): Coverage {
  if (centre === null) return coverage;
  const points = correctCoverage(
    coverage.points,
    centre,
    requiredSnrFor(station.mode),
    factorsFor(kpMax24h),
  );
  return { ...coverage, points, reach: reachOf(points) };
}

/** The same, for the fine rectangle near the station. */
export function correctedPatch(
  patch: CoveragePatch,
  centre: CentreField | null,
  station: Station,
  kpMax24h: number | null,
): CoveragePatch {
  if (centre === null) return patch;
  return {
    ...patch,
    points: correctCoverage(
      patch.points,
      centre,
      requiredSnrFor(station.mode),
      factorsFor(kpMax24h),
    ),
  };
}
