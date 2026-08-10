/**
 * Turns a path plus a date into a PathPrediction, running VOACAP when the
 * answer is not already cached.
 */
import { type AntennaChoice, txCard } from './antenna.ts';
import { TtlCache } from './cache.ts';
import { latLonToGrid } from './geo.ts';
import { bearingDeg, distanceKm } from './geo.ts';
import { resolveSsn } from './spaceweather.ts';
import type { Endpoint, PathPrediction, PredictionBasis } from './types.ts';
import { correctCells, factorsFor, stormWidening } from './voacap/correct.ts';
import { ITSHFBC_DIR } from './voacap/engine.ts';
import { runPath } from './voacap/pathEngine.ts';

/** Climatology does not change quickly. A day is a conservative lifetime. */
const PREDICTION_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new TtlCache<PathPrediction>(PREDICTION_TTL_MS);

export interface PredictRequest {
  from: Endpoint;
  to: Endpoint;
  /** UTC date the prediction describes. */
  date: Date;
  /** Supply this to force a specific sunspot number, as a now-cast does. */
  ssnOverride?: number;
  /**
   * Highest Kp over the last 24 hours, when known. Only a now-cast knows it;
   * it widens the downward spread after a geomagnetic storm.
   */
  kpMax24h?: number;
  basis?: PredictionBasis;
  watts: number;
  requiredSnrDb: number;
  noiseDbw: number;
  /**
   * The operator's own antenna. The far end stays isotropic: it belongs
   * to a station this server knows nothing about.
   */
  antenna?: AntennaChoice;
}

/**
 * The antenna's contribution to the cache key.
 *
 * Every field that reaches the definition file has to be here. Height
 * alone moves a 14 MHz path by about 9 dB, so serving a 20 m dipole from
 * a 5 m dipole's entry would be a wrong answer that looks entirely
 * ordinary.
 */
function antennaKey(antenna: AntennaChoice | undefined): string {
  if (antenna === undefined || antenna.type === 'isotropic') return 'iso';
  const { type, heightM, gainDbd, beamDeg } = antenna;
  return `${type}:${heightM}:${gainDbd}:${beamDeg}`;
}

/**
 * What makes two requests the same run.
 *
 * Exported so a test can pin it. Anything left out of this is either
 * the same for every caller of the entry, or has to be put back on the
 * answer after the read — see `endpointsOf`.
 */
export function keyFor(request: PredictRequest, ssn: number): string {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  return [
    request.from.grid,
    request.to.grid,
    year,
    month,
    Math.round(ssn),
    request.watts,
    request.requiredSnrDb,
    request.noiseDbw,
    antennaKey(request.antenna),
    // The storm widening changes the corrected cells, so a stormy now-cast
    // must not be served from a quiet cache entry or the reverse.
    request.kpMax24h === undefined
      ? 'climatology'
      : stormWidening(request.kpMax24h).toFixed(2),
  ].join('|');
}

/**
 * The parts of the answer that describe the two ends rather than the
 * prediction.
 *
 * These belong to the caller, not to the run. The cache key holds each
 * end as a 6-character locator — a square about 4.6 km by 9.3 km — and
 * holds no label at all, so two callers can share one entry and still
 * have different coordinates and different names for their stations.
 */
function endpointsOf(
  request: PredictRequest,
): Pick<PathPrediction, 'from' | 'to' | 'distanceKm' | 'bearingDeg'> {
  return {
    from: request.from,
    to: request.to,
    distanceKm: distanceKm(
      request.from.lat,
      request.from.lon,
      request.to.lat,
      request.to.lon,
    ),
    bearingDeg: bearingDeg(
      request.from.lat,
      request.from.lon,
      request.to.lat,
      request.to.lon,
    ),
  };
}

export async function predict(
  request: PredictRequest,
): Promise<PathPrediction> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();

  const { ssn, basis } = await resolveSsn(
    year,
    month,
    request.ssnOverride,
    request.basis,
  );

  // The date, the basis and the two ends are per-request; the VOACAP run
  // behind them is not, so they are put back on the answer rather than
  // read from the entry the first caller wrote.
  //
  // Through `fetch` so that two requests for the same path arriving
  // together run the engine once. A survey is forty-eight of these in a
  // row, and two readers on one path used to be ninety-six runs.
  const key = keyFor(request, ssn);
  const prediction = await cache.fetch(key, async () => {
    // Written before the run, because the card names a file the engine
    // opens. Null for an isotropic station, which names no file at all.
    const txAntenna = request.antenna
      ? await txCard(ITSHFBC_DIR, request.antenna)
      : null;

    return await runOnce(request, ssn, basis, month, year, txAntenna);
  });
  return {
    ...prediction,
    ...endpointsOf(request),
    date: isoDate(request.date),
    basis,
  };
}

/** One run of whichever engine is configured, corrected and assembled. */
async function runOnce(
  request: PredictRequest,
  ssn: number,
  basis: PredictionBasis,
  month: number,
  year: number,
  txAntenna: Awaited<ReturnType<typeof txCard>> | null,
): Promise<PathPrediction> {
  const engineRequest = {
    fromLat: request.from.lat,
    fromLon: request.from.lon,
    toLat: request.to.lat,
    toLon: request.to.lon,
    fromLabel: request.from.label,
    toLabel: request.to.label,
    month,
    year,
    ssn,
    watts: request.watts,
    requiredSnrDb: request.requiredSnrDb,
    noiseDbw: request.noiseDbw,
    ...(txAntenna ? { txAntenna } : {}),
  };

  const parsed = await runPath(engineRequest, txAntenna);

  if (parsed.cells.length === 0) {
    throw new Error('the engine produced no usable rows');
  }

  // Validated against eight months of measured reception reports: the
  // engine's daily swing is shrunk to the fraction of it that is real,
  // reliability is recomputed to match, and a recent geomagnetic storm
  // widens the downward spread. See src/voacap/correct.ts for provenance.
  const cells = correctCells(
    parsed.cells,
    request.requiredSnrDb,
    factorsFor(request.kpMax24h ?? null),
  );
  const mufByHour = parsed.mufByHour;

  return {
    ...endpointsOf(request),
    ssn,
    requiredSnrDb: request.requiredSnrDb,
    basis,
    month,
    year,
    date: isoDate(request.date),
    mufByHour,
    // Frequencies, not signal levels, so the corrections above do not
    // apply to them and they pass through as the engine reported them.
    window: parsed.window,
    cells,
  };
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Build an endpoint from coordinates, deriving the locator. */
export function endpointFromLatLon(
  lat: number,
  lon: number,
  label?: string,
): Endpoint {
  const grid = latLonToGrid(lat, lon);
  return { grid, label: label ?? grid, lat, lon };
}
