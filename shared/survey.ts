/**
 * A forecast with no destination: how much of the world hears this station.
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
 *
 * One module for both projects, and the reason is the threshold. The app
 * computes this on the device with the engine compiled in; the server
 * computes it for the web build, which has no engine. The two carried
 * line-for-line equivalents of the sampling and the tally, and the server
 * held a private copy of `REACHABLE` — so retuning the shared threshold
 * would have left the server's survey disagreeing with both the map and
 * the app, with no test and no type failing.
 *
 * Running the samples is left to each side, because that is where they
 * genuinely differ: one spawns processes behind a semaphore, the other
 * calls into a compiled-in engine one request at a time.
 */
import type { BandHourPrediction, BandKey } from './bands.ts';
import { REACHABLE } from './coverageGrid.ts';
import { pointFrom } from './geo.ts';

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
 * The part of one sample run this module reads.
 *
 * Structural rather than either project's `PathPrediction`, because the
 * two declare that type separately and neither is this module's to name.
 */
export interface SurveyRun {
  readonly cells: readonly BandHourPrediction[];
  readonly mufByHour: readonly number[];
}

interface Tally {
  band: BandKey;
  hour: number;
  /** How many of the sampled directions reached at this band and hour. */
  reached: number;
}

/**
 * The sampled runs as one grid.
 *
 * A cell's value is the share of sample directions this band reaches at this
 * hour, using the same threshold the map's reach figure uses — so the number
 * under the map and the number in the grid mean the same thing.
 */
export function combineSurvey(
  runs: readonly SurveyRun[],
): BandHourPrediction[] {
  if (runs.length === 0) return [];

  // A fold over every cell of every run. The accumulator is written into
  // rather than rebuilt: this is 48 runs of 216 cells, and a fresh map per
  // cell would be ten thousand copies of a growing map to produce one.
  // Nothing outside this function sees it before it is finished.
  const tally = runs
    .flatMap((run) => run.cells)
    .reduce((into, cell) => {
      const key = `${cell.band}:${cell.hour}`;
      const hit = cell.reliability >= REACHABLE ? 1 : 0;
      return into.set(key, {
        band: cell.band,
        hour: cell.hour,
        reached: (into.get(key)?.reached ?? 0) + hit,
      });
    }, new Map<string, Tally>());

  return [...tally.values()].map(({ band, hour, reached }) => ({
    band,
    hour,
    reliability: reached / runs.length,
    // Neither has a meaning across directions. An SNR averaged over a 1,500 km
    // path and an 8,000 km one describes no signal that exists, and a take-off
    // angle is a property of one path. Nothing on screen reads either for a
    // survey; they are here because the grid's cell shape has them.
    snr: 0,
    takeoffAngleDeg: null,
  }));
}

/**
 * The median MUF per hour across the samples at the middle range.
 *
 * The MUF is a property of the ionosphere over the path, and the middle
 * ring is the one whose paths most of the bands are actually working.
 *
 * The runs must be in `samplePoints` order, which is what makes "every
 * third one" the middle ring.
 */
export function midRangeMuf(runs: readonly SurveyRun[]): number[] {
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
