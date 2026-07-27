/**
 * Turns a path plus a date into a PathPrediction, running VOACAP when the
 * answer is not already cached.
 */
import { TtlCache } from './cache.ts';
import { latLonToGrid } from './geo.ts';
import { bearingDeg, distanceKm } from './geo.ts';
import { ssnForMonth } from './spaceweather.ts';
import {
  BANDS_BY_FREQ,
  type Endpoint,
  type PathPrediction,
  type PredictionBasis,
} from './types.ts';
import { correctCells, factorsFor, stormWidening } from './voacap/correct.ts';
import { buildDeck } from './voacap/deck.ts';
import { runEngine } from './voacap/engine.ts';
import { parseVoacapOutput } from './voacap/parse.ts';
import { runVoacap } from './voacap/run.ts';

/**
 * Which engine serves predictions.
 *
 * The Rust port is byte-identical to the Fortran reference and
 * `propcore`'s `paritycheck` confirms it returns the same fields this server
 * reads. The Fortran path is kept so a deployment can fall back without a
 * code change, and so the two can be compared on a live host.
 */
const USE_FORTRAN = process.env.HFCAST_ENGINE === 'fortran';

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
}

function keyFor(request: PredictRequest, ssn: number): string {
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
    // The storm widening changes the corrected cells, so a stormy now-cast
    // must not be served from a quiet cache entry or the reverse.
    request.kpMax24h === undefined
      ? 'climatology'
      : stormWidening(request.kpMax24h).toFixed(2),
  ].join('|');
}

export async function predict(
  request: PredictRequest,
): Promise<PathPrediction> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();

  let ssn: number;
  let basis: PredictionBasis;

  if (request.ssnOverride !== undefined) {
    ssn = request.ssnOverride;
    basis = request.basis ?? 'nowcast';
  } else {
    const resolved = await ssnForMonth(year, month);
    ssn = resolved.ssn;
    basis = resolved.predicted ? 'forecast' : 'climatology';
  }

  const key = keyFor(request, ssn);
  const cached = cache.get(key);
  if (cached) {
    // Date and basis are per-request; the VOACAP run behind them is not.
    return { ...cached, date: isoDate(request.date), basis };
  }

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
  };

  const parsed = USE_FORTRAN
    ? parseVoacapOutput(
      await runVoacap(buildDeck(engineRequest)),
      BANDS_BY_FREQ,
    )
    : await runEngine(engineRequest);

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

  const prediction: PathPrediction = {
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
    ssn,
    basis,
    month,
    year,
    date: isoDate(request.date),
    mufByHour,
    cells,
  };

  cache.set(key, prediction);
  return prediction;
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

export const predictionCacheSize = () => cache.size;
