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
import { buildDeck } from './voacap/deck.ts';
import { parseVoacapOutput } from './voacap/parse.ts';
import { runVoacap } from './voacap/run.ts';

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

  const deck = buildDeck({
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
  });

  const listing = await runVoacap(deck);
  const { cells, mufByHour } = parseVoacapOutput(listing, BANDS_BY_FREQ);

  if (cells.length === 0) {
    throw new Error('VOACAP produced no usable rows');
  }

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
