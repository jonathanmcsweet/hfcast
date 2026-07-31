/**
 * A forecast with no destination: how much of the world hears this station.
 *
 * This mirrors `hfcast/src/data/survey.ts`, which is where the reasoning for
 * the approach and the measurements behind it are written down. The short
 * version: filling the 9 x 24 grid with area runs is 216 of them and about ten
 * seconds, while sampling directions with ordinary path runs is 48 runs and
 * under one, because a path run returns the whole grid at once.
 *
 * The app has its own copy because it computes this on the device with the
 * engine compiled in. This one is for the web build, which has no engine.
 */
import { TtlCache } from './cache.ts';
import { latLonToGrid } from './geo.ts';
import { predict, type PredictRequest } from './predict.ts';
import type { BandHourPrediction, Endpoint, PathPrediction } from './types.ts';

/** Every 22.5 degrees, which is the compass rose. */
const SAMPLE_BEARINGS = Array.from({ length: 16 }, (_, i) => i * 22.5);

/** Regional, continental, and the far side of an ocean. */
const SAMPLE_RANGES_KM = [1500, 4000, 8000] as const;

/** The share of a path's reliability that counts as reached. Matches the map. */
const REACHABLE = 0.4;

/** Same reasoning as a prediction's: the climatology under it is monthly. */
const SURVEY_TTL_MS = 15 * 60 * 1000;

const cache = new TtlCache<PathPrediction>(SURVEY_TTL_MS);

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** The direct geodesic on a sphere: where you are after going that far. */
function pointFrom(
  from: { lat: number; lon: number; },
  bearing: number,
  distanceKm: number,
): { lat: number; lon: number; } {
  const angular = distanceKm / EARTH_RADIUS_KM;
  const lat1 = toRadians(from.lat);
  const lon1 = toRadians(from.lon);
  const theta = toRadians(bearing);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular)
      + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta),
  );
  const lon2 = lon1
    + Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: toDegrees(lat2),
    lon: ((toDegrees(lon2) + 540) % 360) - 180,
  };
}

function samplePoints(from: { lat: number; lon: number; }) {
  return SAMPLE_BEARINGS.flatMap((bearing) =>
    SAMPLE_RANGES_KM.map((distanceKm) => ({
      bearing,
      distanceKm,
      ...pointFrom(from, bearing, distanceKm),
    }))
  );
}

/** Each cell becomes the share of sampled directions that reach. */
function combine(runs: readonly PathPrediction[]): BandHourPrediction[] {
  const reached = new Map<string, number>();
  const seen = new Map<string, BandHourPrediction>();

  for (const run of runs) {
    for (const cell of run.cells) {
      const key = `${cell.band}:${cell.hour}`;
      seen.set(key, cell);
      const hit = cell.reliability >= REACHABLE ? 1 : 0;
      reached.set(key, (reached.get(key) ?? 0) + hit);
    }
  }

  return [...seen.entries()].map(([key, cell]) => ({
    band: cell.band,
    hour: cell.hour,
    reliability: (reached.get(key) ?? 0) / Math.max(1, runs.length),
    // Neither means anything across directions. Nothing reads them for a
    // survey; the cell shape has them.
    snr: 0,
    takeoffAngleDeg: null,
  }));
}

/** The median MUF per hour across the middle ring of samples. */
function midRangeMuf(runs: readonly PathPrediction[]): number[] {
  const middle = Math.floor(SAMPLE_RANGES_KM.length / 2);
  const chosen = runs.filter((_, i) => i % SAMPLE_RANGES_KM.length === middle);
  const from = chosen.length > 0 ? chosen : runs;

  return Array.from({ length: 24 }, (_, hour) => {
    const values = from
      .map((run) => run.mufByHour[hour] ?? 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  });
}

export type SurveyRequest = Omit<PredictRequest, 'to'>;

function keyFor(request: SurveyRequest): string {
  return [
    request.from.lat.toFixed(2),
    request.from.lon.toFixed(2),
    request.date.toISOString().slice(0, 10),
    Math.round(request.ssnOverride ?? -1),
    request.watts,
    request.requiredSnrDb,
    request.noiseDbw,
    JSON.stringify(request.antenna ?? null),
  ].join('|');
}

export async function survey(
  request: SurveyRequest,
): Promise<PathPrediction> {
  const key = keyFor(request);
  const cached = cache.get(key);
  if (cached) return cached;

  // Sequential on purpose. Each run spawns the engine, and forty-eight at
  // once would compete for the same cores and finish no sooner.
  const runs: PathPrediction[] = [];
  for (const point of samplePoints(request.from)) {
    const to: Endpoint = {
      lat: point.lat,
      lon: point.lon,
      grid: latLonToGrid(point.lat, point.lon),
      label: `${point.bearing}/${point.distanceKm}`,
    };
    runs.push(await predict({ ...request, to }));
  }

  const first = runs[0];
  if (first === undefined) throw new Error('a survey needs at least one run');

  const result: PathPrediction = {
    from: request.from,
    to: null,
    distanceKm: null,
    bearingDeg: null,
    ssn: first.ssn,
    requiredSnrDb: first.requiredSnrDb,
    basis: first.basis,
    month: first.month,
    year: first.year,
    date: first.date,
    mufByHour: midRangeMuf(runs),
    // The rail draws one path's usable window, and there is no one path.
    window: null,
    cells: combine(runs),
  };
  cache.set(key, result);
  return result;
}
