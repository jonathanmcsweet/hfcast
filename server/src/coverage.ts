/**
 * Where a band reaches from one place, at one hour.
 *
 * Separate from `predict.ts`: a prediction covers one path and all 24
 * hours, this covers one hour and every direction, so a whole day is 24
 * runs rather than one. The asymmetry is `HFAREA`'s, not a choice here.
 */
import { type AntennaChoice, txCard } from './antenna.ts';
import { TtlCache } from './cache.ts';
import { LAT_STEP, LON_STEP, reachOf } from './coverageGrid.ts';
import {
  FINE_LAT_STEP,
  FINE_LON_STEP,
  type PatchBounds,
  patchGrid,
  patchKey,
  patchRequestBounds,
} from './coveragePatch.ts';
import { resolveSsn } from './spaceweather.ts';
import type { BandKey, Endpoint, MapRegion, PredictionBasis } from './types.ts';
import { factorsFor, stormWidening } from './voacap/correct.ts';
import {
  type CentreField,
  centreField,
  correctCoverage,
  FINE_CENTRE_LAT_STEP,
  FINE_CENTRE_LON_STEP,
} from './voacap/correctMap.ts';
import {
  type Coverage,
  ITSHFBC_DIR,
  runCoverage,
  runDailyMedians,
} from './voacap/engine.ts';

// Grid, threshold and reach come from the shared lattice modules. They
// were written out again here, comments and all — the arrangement
// `shared/` replaced.
export { LAT_STEP, LON_STEP, REACHABLE } from './coverageGrid.ts';
export { FINE_LAT_STEP, FINE_LON_STEP } from './coveragePatch.ts';

/** As long as a prediction: the run behind both is the same climatology. */
const COVERAGE_TTL_MS = 60 * 60 * 1000;

// One entry per band, hour and place. A user moving the clock across a
// day fills 24 of them for the band they are on, which is the access
// pattern this is sized for.
const cache = new TtlCache<Held<CoverageResult>>(COVERAGE_TTL_MS, 400);

export interface CoverageRequest {
  from: Endpoint;
  date: Date;
  band: BandKey;
  /** UTC hour, 0-23. */
  hour: number;
  watts: number;
  requiredSnrDb: number;
  noiseDbw: number;
  /** Effective sunspot number from live readings, when there are any. */
  ssnOverride?: number;
  /**
   * Highest K index of the last 24 hours, when it is known.
   *
   * A storm widens the spread below the median, changing what a corrected
   * map is painted with. It does not move the middle of the day, so the
   * lattice of middles is cached without it.
   */
  kpMax24h?: number;
  basis?: PredictionBasis;
  /** Which model answers. Absent runs the classic engine unchanged. */
  engine?: 'voacap' | 'truecast';
  /**
   * The operator's own antenna. A beam makes the map lopsided, which is
   * the honest picture: where this station reaches, not an ideal one.
   */
  antenna?: AntennaChoice;
  /**
   * The part of the world the map is showing, for the fine grid only.
   * Absent means the whole globe, and the fine grid goes around the
   * station — where the map is centred, so the two agree by default.
   */
  region?: MapRegion;
}

/**
 * The parts of an answer that belong to the caller rather than the run,
 * and are never held in an entry.
 *
 * `basis` says where the sunspot number came from. `from` is the station:
 * the key rounds its position to three decimals and holds no label, so
 * two callers a few hundred metres apart share an entry and must each be
 * answered with their own station.
 */
type PerRequest = 'from' | 'basis';

/** An answer as the cache holds it, with the caller's own parts removed. */
type Held<T> = Omit<T, PerRequest>;

export interface CoverageResult extends Coverage {
  from: Endpoint;
  basis: PredictionBasis;
  /** The share of sampled directions where a contact is at least patchy. */
  reach: number;
}

function keyFor(request: CoverageRequest, ssn: number): string {
  const { from, band, hour, watts, requiredSnrDb, noiseDbw, date } = request;
  return [
    from.lat.toFixed(3),
    from.lon.toFixed(3),
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    ssn.toFixed(1),
    band,
    hour,
    watts,
    requiredSnrDb,
    noiseDbw,
    antennaKey(request.antenna),
    // The correction is applied before an answer is held, so two storm
    // conditions are two answers. Rounded, because the widening is smooth
    // in the K index and a third decimal makes every poll a fresh entry.
    request.kpMax24h === undefined
      ? 'quiet'
      : stormWidening(request.kpMax24h).toFixed(2),
    // Two models, two answers; one must never be served as the other.
    request.engine ?? 'voacap',
    // The new model's offline form moves along a day-of-year curve, so
    // its runs are per-day where the classic run is per-month.
    request.engine === 'truecast' ? date.getUTCDate() : 0,
  ].join('|');
}

/**
 * The request fields that pick the model, for an area run.
 *
 * The same pair of forms `predict.ts` sends, and exclusive for the same
 * reason: the engine refuses `ssn` beside `engine:"truecast"`. With no
 * live reading the new model derives its own index from the day-of-year
 * correction — the offline form.
 */
function modelFieldsFor(
  request: CoverageRequest,
  ssn: number,
  basis: PredictionBasis,
): { ssn: number; } | { engine: 'truecast'; day: number; essn?: number; } {
  if (request.engine !== 'truecast') return { ssn };
  return {
    engine: 'truecast',
    day: request.date.getUTCDate(),
    ...(basis === 'nowcast' ? { essn: ssn } : {}),
  };
}

/**
 * The antenna's contribution to the cache key. Every field reaching the
 * definition file: height alone moves a 14 MHz path by about 9 dB and a
 * beam heading turns the map lopsided, so a shared entry would be a wrong
 * map that looks like an ordinary one.
 */
function antennaKey(antenna: AntennaChoice | undefined): string {
  if (antenna === undefined || antenna.type === 'isotropic') return 'iso';
  const { type, heightM, gainDbd, beamDeg } = antenna;
  return `${type}:${heightM}:${gainDbd}:${beamDeg}`;
}

/** Which grid to ask the engine for, and what keeps its answers apart. */
interface GridRequest {
  latStep: number;
  lonStep: number;
  /** The rectangle to cover. Absent means the whole world. */
  bounds?: PatchBounds;
  /**
   * Put in front of the cache key. Two grids of the same band and hour
   * are different answers, and a shared key would serve one for the
   * other.
   */
  keyPrefix: string;
}

/**
 * The lattice of daily middles, one entry per band and place.
 *
 * Small — 1,728 numbers a band — and reused by every hour and grid step,
 * so there is room for many. It depends on neither the hour nor the K
 * index: a storm widens the spread below the median and leaves it alone.
 */
const centreCache = new TtlCache<CentreField | null>(COVERAGE_TTL_MS, 200);

/**
 * The middle of the day at every lattice point, for this request's band.
 *
 * Always the fine lattice: this is cached across every request for the
 * place, so only the first caller waits and the rest read it.
 */
async function dailyCentres(
  request: CoverageRequest,
  ssn: number,
  basis: PredictionBasis,
  month: number,
  year: number,
  txAntenna: Awaited<ReturnType<typeof txCard>> | null,
): Promise<CentreField | null> {
  const key = [
    'centres',
    request.from.lat.toFixed(3),
    request.from.lon.toFixed(3),
    year,
    month,
    ssn.toFixed(1),
    request.band,
    request.watts,
    request.noiseDbw,
    antennaKey(request.antenna),
    // The middles come from the engine too, so they belong to one model
    // or the other. The day is in the key for the new model alone: its
    // offline form moves daily, where the classic run holds all month.
    request.engine ?? 'voacap',
    request.engine === 'truecast' ? request.date.getUTCDate() : 0,
  ].join('|');

  return await centreCache.fetch(key, async () => {
    const ran = await runDailyMedians({
      fromLat: request.from.lat,
      fromLon: request.from.lon,
      month,
      year,
      ...modelFieldsFor(request, ssn, basis),
      watts: request.watts,
      requiredSnrDb: request.requiredSnrDb,
      noiseDbw: request.noiseDbw,
      band: request.band,
      latStep: FINE_CENTRE_LAT_STEP,
      lonStep: FINE_CENTRE_LON_STEP,
      ...(txAntenna ? { txAntenna } : {}),
    });
    return centreField(ran.points, ran.latStep, ran.lonStep);
  });
}

/**
 * One coverage run, held against a key.
 *
 * The coarse map, the whole-world fine grid and the viewport patch are
 * the same five steps: work out the month, resolve the sunspot number,
 * write the antenna card, ask the engine, hold what comes back. Only the
 * grid and the shape of the answer differ, so those are the parameters.
 *
 * Through `fetch` rather than get-run-set, so a second request arriving
 * while the first runs waits on it. At the fine step one run is up to
 * eight processes, and nothing upstream stops a caller asking twice.
 */
async function cachedRun<T>(
  request: CoverageRequest,
  grid: GridRequest,
  store: TtlCache<Held<T>>,
  assemble: (ran: Coverage) => Held<T>,
): Promise<Held<T> & { from: Endpoint; basis: PredictionBasis; }> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();

  const { ssn, basis } = await resolveSsn(
    year,
    month,
    request.ssnOverride,
    request.basis,
  );

  const key = `${grid.keyPrefix}${keyFor(request, ssn)}`;
  const result = await store.fetch(key, async () => {
    // Written before the run: the card names a file the engine opens.
    // Null for an isotropic station, which names no file at all.
    const txAntenna = request.antenna
      ? await txCard(ITSHFBC_DIR, request.antenna)
      : null;

    const ran = await runCoverage({
      fromLat: request.from.lat,
      fromLon: request.from.lon,
      month,
      year,
      ...modelFieldsFor(request, ssn, basis),
      watts: request.watts,
      requiredSnrDb: request.requiredSnrDb,
      noiseDbw: request.noiseDbw,
      hour: request.hour,
      band: request.band,
      latStep: grid.latStep,
      lonStep: grid.lonStep,
      ...(grid.bounds ? { bounds: grid.bounds } : {}),
      ...(txAntenna ? { txAntenna } : {}),
    });

    // Corrected before it is held, so every reader of an entry gets the
    // same map. The app corrects on read instead, because it computes
    // the lattice on the device and has to draw something meanwhile;
    // here the lattice is shared, so waiting costs the first caller only.
    const centre = await dailyCentres(
      request,
      ssn,
      basis,
      month,
      year,
      txAntenna,
    );
    return assemble({
      ...ran,
      points: correctCoverage(
        ran.points,
        centre,
        request.requiredSnrDb,
        factorsFor(request.kpMax24h ?? null),
      ),
    });
  });
  // See `PerRequest`: these two are the caller's, so they are put on
  // here rather than read from an entry another caller wrote.
  return { ...result, from: request.from, basis };
}

export async function coverage(
  request: CoverageRequest,
): Promise<CoverageResult> {
  return await cachedRun<CoverageResult>(
    request,
    { latStep: LAT_STEP, lonStep: LON_STEP, keyPrefix: '' },
    cache,
    (ran) => ({ ...ran, reach: reachOf(ran.points) }),
  );
}

/**
 * The fine grid, over the whole world.
 *
 * 34,560 points, a hundred and eighty times the coarse map, at the step
 * `shared/coveragePatch.ts` holds — the viewport patch's own step, so
 * zooming in only magnifies.
 *
 * Its own small cache: a fine result is about 2.2 MB against 12 KB for a
 * coarse one, so the coarse cache's 400 entries would be near a
 * gigabyte. Twenty is about 44 MB and still holds a day of one band.
 */
const fineCache = new TtlCache<Held<CoverageResult>>(COVERAGE_TTL_MS, 20);

export async function coverageFine(
  request: CoverageRequest,
): Promise<CoverageResult> {
  return await cachedRun<CoverageResult>(
    request,
    { latStep: FINE_LAT_STEP, lonStep: FINE_LON_STEP, keyPrefix: 'fine|' },
    fineCache,
    (ran) => ({ ...ran, reach: reachOf(ran.points) }),
  );
}

/**
 * The fine grid around the operator, at the same band and hour.
 *
 * A second run rather than a finer first one: the same step over the
 * whole globe is about a hundred times the work, and the question — where
 * the low bands reach without a skip zone — is about the region near the
 * station. See `coveragePatch.ts`.
 *
 * Null near the antimeridian, where there is no rectangle to ask for.
 * Null rather than an error: a fact about where the station is, and the
 * coarse map is unaffected.
 */
export type CoveragePatchResult = Coverage & {
  from: Endpoint;
  basis: PredictionBasis;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
};

// Its own cache, sized like the coarse one and keyed the same way. A
// shared one would let a patch and a whole-world run collide on a key
// that says nothing about which grid it holds.
const patchCache = new TtlCache<Held<CoveragePatchResult>>(
  COVERAGE_TTL_MS,
  400,
);

export async function coveragePatch(
  request: CoverageRequest,
): Promise<CoveragePatchResult | null> {
  // Where the map is pointed, or the station when it is showing the
  // whole globe and the two are the same place anyway.
  const grid = request.region
    ? patchGrid(
      request.region.lat,
      request.region.lon,
      request.region.halfLatDeg,
    )
    : patchGrid(request.from.lat, request.from.lon);
  if (grid === null) return null;

  return await cachedRun<CoveragePatchResult>(
    request,
    {
      latStep: grid.latStep,
      lonStep: grid.lonStep,
      bounds: patchRequestBounds(grid),
      // The rectangle is part of the identity: without it the first view
      // asked for would be served to every later one.
      keyPrefix: `patch|${patchKey(grid)}|`,
    },
    patchCache,
    (ran) => ({
      ...ran,
      // The engine echoes the grid it snapped to; the request's own
      // rectangle is the fallback if an older build did not.
      latMin: ran.latMin ?? grid.latMin,
      latMax: ran.latMax ?? grid.latMax,
      lonMin: ran.lonMin ?? grid.lonMin,
      lonMax: ran.lonMax ?? grid.lonMax,
    }),
  );
}
