import type { EngineModel } from '../store/useSettingsStore';
import type { Station } from '../store/useStationStore';
import { latLonToGrid } from './grid';
import { type Nowcast, predictLocally } from './localPredict';
import { samplePoints, surveyPrediction } from './survey';
import type { Endpoint, PathPrediction } from './types';

/**
 * A forecast with no destination, computed on the device.
 *
 * One engine run per sampled direction, combined by `survey.ts`.
 * Sequential rather than concurrent: the native module answers one
 * request at a time, so issuing them together only queues them, and in
 * order the whole thing can be abandoned if the location changes.
 */

export interface LocalSurveyRequest {
  from: Endpoint;
  date: Date;
  station: Station;
  nowcast?: Nowcast | undefined;
  /** Which model answers. Absent runs the classic engine unchanged. */
  engine?: EngineModel | undefined;
}

export async function surveyLocally(
  request: LocalSurveyRequest,
): Promise<PathPrediction> {
  const points = samplePoints(request.from);

  // A loop rather than `map` with `Promise.all`: these must not run at once.
  // The engine serialises them anyway, and forty-eight concurrent calls would
  // hold forty-eight requests in memory to no purpose.
  const runs: PathPrediction[] = [];
  for (const point of points) {
    const to: Endpoint = {
      grid: latLonToGrid(point.lat, point.lon),
      // Never shown. A survey has no destination on screen; this exists
      // because the engine's request names both ends.
      label: `${point.bearing}°/${point.distanceKm}km`,
      lat: point.lat,
      lon: point.lon,
    };
    runs.push(
      await predictLocally({
        from: request.from,
        to,
        date: request.date,
        station: request.station,
        nowcast: request.nowcast,
        engine: request.engine,
      }),
    );
  }

  return surveyPrediction(request.from, runs);
}
