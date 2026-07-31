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
import { patchGrid, patchKey, patchRequestBounds } from './coveragePatch.ts';
import { resolveSsn } from './spaceweather.ts';
import type { BandKey, Endpoint, MapRegion, PredictionBasis } from './types.ts';
import { type Coverage, ITSHFBC_DIR, runCoverage } from './voacap/engine.ts';

/**
 * Cell size in degrees.
 *
 * 15 by 22.5 gives 12 rows of 16, which is 192 points: coarse enough to
 * run in well under a tenth of a second and fine enough that a continent
 * spans several cells. The longitude step is the wider one because
 * meridians converge — equal steps would make the polar cells slivers.
 */
export const LAT_STEP = 15;
export const LON_STEP = 22.5;

/** As long as a prediction: the run behind both is the same climatology. */
const COVERAGE_TTL_MS = 60 * 60 * 1000;

// One entry per band, hour and place. A user moving the clock across a
// day fills 24 of them for the band they are on, which is the access
// pattern this is sized for.
const cache = new TtlCache<CoverageResult>(COVERAGE_TTL_MS, 400);

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

export interface CoverageResult extends Coverage {
  from: Endpoint;
  basis: PredictionBasis;
  /** The share of sampled directions where a contact is at least patchy. */
  reach: number;
}

/**
 * The threshold "reachable" means, matching the app's `patchy` band.
 *
 * The share of the map above it is a more useful summary than the best
 * cell, which saturates at "reliable" for almost every band and hour and
 * so says nothing about the difference between them.
 */
export const REACHABLE = 0.4;

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

export async function coverage(
  request: CoverageRequest,
): Promise<CoverageResult> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();

  const { ssn, basis } = await resolveSsn(
    year,
    month,
    request.ssnOverride,
    request.basis,
  );

  const key = keyFor(request, ssn);
  const cached = cache.get(key);
  if (cached) return { ...cached, basis };

  // Written before the run: the card names a file the engine opens.
  const txAntenna = request.antenna
    ? await txCard(ITSHFBC_DIR, request.antenna)
    : null;

  const grid = await runCoverage({
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
    latStep: LAT_STEP,
    lonStep: LON_STEP,
    ...(txAntenna ? { txAntenna } : {}),
  });

  // Weighted by the cosine of the latitude, because equal-angle cells are
  // not equal areas: without it the polar rows, which are slivers of the
  // sphere, would count as much as the equatorial ones and every band
  // would look worse than it is.
  const { hit, total } = grid.points
    .map((point) => ({
      weight: Math.cos((point.lat * Math.PI) / 180),
      reached: point.reliability >= REACHABLE,
    }))
    .reduce(
      (sum, cell) => ({
        hit: sum.hit + (cell.reached ? cell.weight : 0),
        total: sum.total + cell.weight,
      }),
      { hit: 0, total: 0 },
    );

  const result: CoverageResult = {
    ...grid,
    from: request.from,
    basis,
    reach: total > 0 ? hit / total : 0,
  };
  cache.set(key, result);
  return result;
}

export const coverageCacheSize = () => cache.size;

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
const patchCache = new TtlCache<CoveragePatchResult>(COVERAGE_TTL_MS, 400);

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
  const box = patchRequestBounds(grid);

  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();

  const { ssn, basis } = await resolveSsn(
    year,
    month,
    request.ssnOverride,
    request.basis,
  );

  // The grid is part of the identity: two views that produce different
  // rectangles are different answers, and without this the first one
  // asked for would be served to every later one.
  const key = `patch|${keyFor(request, ssn)}|${patchKey(grid)}`;
  const cached = patchCache.get(key);
  if (cached) return { ...cached, basis };

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
    bounds: box,
    ...(txAntenna ? { txAntenna } : {}),
  });

  const result: CoveragePatchResult = {
    ...ran,
    from: request.from,
    basis,
    // The engine echoes the grid it snapped to; the request's own
    // rectangle is the fallback if an older build did not.
    latMin: ran.latMin ?? grid.latMin,
    latMax: ran.latMax ?? grid.latMax,
    lonMin: ran.lonMin ?? grid.lonMin,
    lonMax: ran.lonMax ?? grid.lonMax,
  };
  patchCache.set(key, result);
  return result;
}

export const coveragePatchCacheSize = () => patchCache.size;
