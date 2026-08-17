/**
 * A forecast with no destination: how much of the world hears this station.
 *
 * The sampling and the tally are in `shared/survey.ts`, which is where the
 * reasoning and the measurements behind the approach are written down. The
 * short version: filling the 9 x 24 grid with area runs is 216 of them and
 * about ten seconds, while sampling directions with ordinary path runs is
 * 48 runs and under one, because a path run returns the whole grid at once.
 *
 * What is here is the running of the samples, which is the part the two
 * projects do differently: this spawns engine processes behind the
 * server's semaphore, while the app calls a compiled-in engine that takes
 * one request at a time.
 */
import {
  combineSurvey,
  midRangeMuf,
  samplePoints,
} from '../../shared/survey.ts';
import { TtlCache } from './cache.ts';
import { latLonToGrid } from './geo.ts';
import { predict, type PredictRequest } from './predict.ts';
import type { Endpoint, PathPrediction } from './types.ts';
import { stormWidening } from './voacap/correct.ts';

/** Same reasoning as a prediction's: the climatology under it is monthly. */
const SURVEY_TTL_MS = 15 * 60 * 1000;

const cache = new TtlCache<PathPrediction>(SURVEY_TTL_MS);

export type SurveyRequest = Omit<PredictRequest, 'to'>;

/**
 * What makes two surveys the same set of runs.
 *
 * Exported so a test can pin it, the same way `predict.ts` does.
 */
export function keyFor(request: SurveyRequest): string {
  return [
    request.from.lat.toFixed(2),
    request.from.lon.toFixed(2),
    request.date.toISOString().slice(0, 10),
    Math.round(request.ssnOverride ?? -1),
    request.watts,
    request.requiredSnrDb,
    request.noiseDbw,
    JSON.stringify(request.antenna ?? null),
    // Every run below is corrected with `factorsFor(kpMax24h)`, so the
    // same term the prediction key carries has to be here too. Without
    // it a request made after a storm and a quiet one land on the same
    // entry, and one of them is answered with the other's reliabilities
    // for the quarter of an hour the entry lives.
    request.kpMax24h === undefined
      ? 'climatology'
      : stormWidening(request.kpMax24h).toFixed(2),
    // Two models, two answers, and the new model's offline form moves
    // along a day-of-year curve — the same terms the prediction key adds.
    request.engine ?? 'voacap',
    request.engine === 'truecast' ? request.date.getUTCDate() : 0,
  ].join('|');
}

export async function survey(
  request: SurveyRequest,
): Promise<PathPrediction> {
  // Through `fetch`, which matters more here than anywhere else: a
  // survey is forty-eight engine runs, and two readers on one station
  // arriving together used to start both sets rather than share one.
  return await cache.fetch(keyFor(request), async () => {
    // Asked for together. These were sequential, against the day when
    // nothing bounded how many engine processes could be alive: the
    // comment here said forty-eight at once would compete for the same
    // cores and finish no sooner. `limit.ts` now holds that bound for
    // every engine call in the server, so the sequence was spending
    // seven eighths of the wait on an empty machine.
    //
    // `Promise.all` keeps the order of its input, which `midRangeMuf`
    // depends on: it picks the middle ring by position.
    //
    // A survey can now hold every engine slot at once, so a prediction
    // arriving beside one waits behind more of it than it used to. The
    // gate hands slots out first in, first out, and a path run is short,
    // so the wait is bounded and the survey stops holding the machine
    // for forty-eight times as long.
    const runs = await Promise.all(
      samplePoints(request.from).map((point) => {
        const to: Endpoint = {
          lat: point.lat,
          lon: point.lon,
          grid: latLonToGrid(point.lat, point.lon),
          label: `${point.bearing}/${point.distanceKm}`,
        };
        return predict({ ...request, to });
      }),
    );

    const first = runs[0];
    if (first === undefined) throw new Error('a survey needs at least one run');

    return {
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
      cells: combineSurvey(runs),
    };
  });
}
