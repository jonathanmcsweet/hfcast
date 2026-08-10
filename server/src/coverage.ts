/**
 * Where a band reaches from one place, at one hour.
 *
 * Separate from `predict.ts` because it answers a different question with
 * a different shape and a different cost. A prediction covers one path and
 * all 24 hours; this covers one hour and every direction, so a whole day
 * would be 24 runs rather than one. That asymmetry is `HFAREA`'s, not a
 * choice made here.
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
import { type Coverage, ITSHFBC_DIR, runCoverage } from './voacap/engine.ts';

// The grid, the threshold and the reach calculation come from the shared
// lattice modules. They were written out again here, comments and all,
// which is the arrangement `shared/` replaced.
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
  basis?: PredictionBasis;
  /**
   * The operator's own antenna. A beam makes the map lopsided, which is
   * the honest picture: it shows where this station reaches, not where an
   * ideal one would.
   */
  antenna?: AntennaChoice;
  /**
   * The part of the world the map is showing, for the fine grid only.
   *
   * Absent means the whole globe, and then the fine grid goes around the
   * station — which is the same place the map is centred on, so the two
   * agree at the default view.
   */
  region?: MapRegion;
}

/**
 * The parts of an answer that belong to the caller rather than to the
 * run, and so are never held in an entry.
 *
 * `basis` says where the sunspot number came from, and it is per-request.
 * `from` is the station: the key rounds its position to three decimals
 * and holds no label at all, so two callers a few hundred metres apart,
 * or the same place under two names, share one entry and must still each
 * be answered with their own station.
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
  ].join('|');
}

/**
 * The antenna's contribution to the cache key. Every field reaching the
 * definition file is here: height alone moves a 14 MHz path by about
 * 9 dB, and a beam heading turns the map lopsided, so a shared entry
 * would be a wrong map that looks like an ordinary one.
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
 * One coverage run, held against a key.
 *
 * The coarse map, the whole-world fine grid and the viewport patch are
 * the same five steps: work out the month, resolve the sunspot number,
 * write the antenna card, ask the engine, and hold what comes back. Only
 * the grid asked for and the shape of the answer differ, so those are
 * the two parameters. They were written out three times, and two of the
 * three explanatory comments survived in only one copy.
 *
 * Through `fetch` rather than get-run-set, so a second request for the
 * same map that arrives while the first is still running waits on it
 * instead of starting another. At the fine step one run is up to eight
 * processes, and nothing upstream stops a caller asking twice.
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
      ssn,
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

    return assemble(ran);
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
 * `shared/coveragePatch.ts` holds. It is the viewport patch's own step,
 * so zooming in stops changing the answer and only changes the
 * magnification.
 *
 * Its own cache, and a small one: a fine result is about 2.2 MB against
 * roughly 12 KB for a coarse one, so the coarse cache's 400 entries
 * would be near a gigabyte. Twenty is about 44 MB and still holds a day
 * of one band, which is the pattern a user moving the hour slider
 * produces.
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
 * A second run rather than a finer first one. The same step over the
 * whole globe would be about a hundred times the work, and the question
 * it answers — where the low bands reach without a skip zone — is only
 * about the region near the station. See `coveragePatch.ts`.
 *
 * Null where the station is near the antimeridian and there is no
 * rectangle to ask for. Null rather than an error: it is a fact about
 * where the station is, and the coarse map is unaffected.
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
      // The rectangle is part of the identity: two views that produce
      // different ones are different answers, and without this the
      // first one asked for would be served to every later one.
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
