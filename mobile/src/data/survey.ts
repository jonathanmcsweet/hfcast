import { pointFrom } from '../../../shared/geo.ts';
import { REACHABLE } from './coverageGrid.ts';
import type {
  BandHourPrediction,
  BandKey,
  Endpoint,
  PathPrediction,
} from './types.ts';

/**
 * The band and hour grid when there is no destination.
 *
 * With a destination the grid answers "what is the chance of reaching this
 * place", which is one path and one engine call — the engine returns all nine
 * bands at all twenty-four hours at once. Without one the question changes to
 * "how much of the world can hear me", and that has no single path to run.
 *
 * The obvious way to answer it is an area run per cell: 216 of them, each 192
 * points. Measured against the engine on a desktop that is 10.2 seconds, and a
 * phone is slower, so it is minutes on the device it is for.
 *
 * So directions are sampled instead. Each sample is an ordinary path run,
 * which returns the whole grid, and the cell value becomes the share of
 * samples that reach. Measured: 19 ms per run against 47 ms per area run, so
 * 48 samples is 0.9 seconds where the area approach is 10.2 — about eleven
 * times less work for the same 216 numbers.
 *
 * What is lost is spatial resolution: 48 sample points where an area run uses
 * 192. That is the right thing to spend, because the grid is read as a shape
 * over the day rather than as a percentage to two figures, and the map above
 * it still does the fine-grained version for the one band being looked at.
 */

/** Every 22.5 degrees. Sixteen is the compass rose, which is no accident. */
export const SAMPLE_BEARINGS = Array.from(
  { length: 16 },
  (_, index) => index * 22.5,
);

/**
 * Three ranges, because a band that reaches 1,500 km at noon and 8,000 km at
 * midnight is the entire question and one range would answer neither. Roughly:
 * regional, continental, and the far side of an ocean.
 */
export const SAMPLE_RANGES_KM = [1500, 4000, 8000] as const;

/** How many engine runs a survey costs. */
export const SAMPLE_COUNT = SAMPLE_BEARINGS.length * SAMPLE_RANGES_KM.length;

export interface SamplePoint {
  bearing: number;
  distanceKm: number;
  lat: number;
  lon: number;
}

// `pointFrom` is re-exported because the survey test measures the sampling
// through this module, which is where the sampling is described.
export { pointFrom };

/** The directions a survey runs, in a fixed order so a result is repeatable. */
export function samplePoints(from: { lat: number; lon: number; }) {
  return SAMPLE_BEARINGS.flatMap((bearing) =>
    SAMPLE_RANGES_KM.map((distanceKm): SamplePoint => ({
      bearing,
      distanceKm,
      ...pointFrom(from, bearing, distanceKm),
    }))
  );
}

/**
 * The sampled runs as one grid.
 *
 * A cell's value is the share of sample directions this band reaches at this
 * hour, using the same threshold the map's reach figure uses — so the number
 * under the map and the number in the grid mean the same thing.
 */
export function combineSurvey(
  runs: readonly PathPrediction[],
): BandHourPrediction[] {
  if (runs.length === 0) return [];

  const reached = new Map<string, number>();
  const seen = new Map<string, { band: BandKey; hour: number; }>();

  for (const run of runs) {
    for (const cell of run.cells) {
      const key = `${cell.band}:${cell.hour}`;
      seen.set(key, { band: cell.band, hour: cell.hour });
      const hit = cell.reliability >= REACHABLE ? 1 : 0;
      reached.set(key, (reached.get(key) ?? 0) + hit);
    }
  }

  return [...seen.entries()].map(([key, { band, hour }]) => ({
    band,
    hour,
    reliability: (reached.get(key) ?? 0) / runs.length,
    // Neither has a meaning across directions. An SNR averaged over a 1,500 km
    // path and an 8,000 km one describes no signal that exists, and a take-off
    // angle is a property of one path. Nothing on screen reads either for a
    // survey; they are here because the grid's cell shape has them.
    snr: 0,
    takeoffAngleDeg: null,
  }));
}

/**
 * The survey as the shape the screen already renders.
 *
 * `to` is null and so are the distance and bearing, which is what tells every
 * component below that this describes no single path.
 */
export function surveyPrediction(
  from: Endpoint,
  runs: readonly PathPrediction[],
): PathPrediction {
  const first = runs[0];
  if (first === undefined) throw new Error('a survey needs at least one run');

  return {
    from,
    to: null,
    distanceKm: null,
    bearingDeg: null,
    ssn: first.ssn,
    requiredSnrDb: first.requiredSnrDb,
    basis: first.basis,
    month: first.month,
    year: first.year,
    date: first.date,
    // Taken from the mid-range samples: the MUF is a property of the
    // ionosphere over the path, and the middle ring is the one whose paths
    // most of the bands are actually working.
    mufByHour: midRangeMuf(runs),
    // The rail draws one path's usable window. There is no one path here, and
    // an invented window would be read as a dial setting.
    window: null,
    cells: combineSurvey(runs),
  };
}

/** The median MUF per hour across the samples at the middle range. */
function midRangeMuf(runs: readonly PathPrediction[]): number[] {
  const middle = Math.floor(SAMPLE_RANGES_KM.length / 2);
  const chosen = runs.filter((_, index) =>
    index % SAMPLE_RANGES_KM.length === middle
  );
  const from = chosen.length > 0 ? chosen : runs;

  return Array.from({ length: 24 }, (_, hour) => {
    const values = from
      .map((run) => run.mufByHour[hour] ?? 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  });
}
