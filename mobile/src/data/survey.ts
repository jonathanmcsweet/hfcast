import { combineSurvey, midRangeMuf } from '../../../shared/survey.ts';
import type { Endpoint, PathPrediction } from './types.ts';

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
 *
 * The sampling and the tally are in `shared/survey.ts`, because the server
 * answers the same question for the web build and the threshold has to be
 * one number. What is left here is turning the runs into the shape this
 * app's screens render.
 */

// The sampling, so callers of this module reach for it here.
export {
  combineSurvey,
  pointFrom,
  SAMPLE_BEARINGS,
  SAMPLE_COUNT,
  SAMPLE_RANGES_KM,
  type SamplePoint,
  samplePoints,
} from '../../../shared/survey.ts';

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
