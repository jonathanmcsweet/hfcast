import * as Engine from '../../modules/hfcast-engine';
import type { Station } from '../store/useStationStore';
import { LAT_STEP, LON_STEP, reachOf } from './coverageGrid';
import { engineStation } from './localPredict';
import { requiredSnrFor } from './modes';
import { ssnForMonth } from './ssn';
import {
  BAND_MHZ,
  type BandKey,
  type Coverage,
  type CoveragePoint,
  type Endpoint,
} from './types';

/**
 * The coverage map, computed on the device.
 *
 * This mirrors `server/src/coverage.ts` the way `localPredict.ts` mirrors the
 * server's prediction: same grid, same reach threshold, same area weighting,
 * and the same engine underneath. Kept separate from the path forecast for the
 * reason the server keeps them separate — an area run answers one hour in
 * every direction, so a whole day is 24 runs rather than one.
 *
 * Cost, measured on the compiled-in engine: 192 points is 48 ms on a desktop
 * and 0.8 s for the ARM build under emulation, which puts a phone somewhere
 * between. That is comfortable for a map drawn when the user looks at it, and
 * it is why the hour is part of the query key rather than something recomputed
 * as a slider moves.
 */

/** Man-made noise at a residential site, dBW in 1 Hz. VOACAP's own default. */
const NOISE_DBW = -145;

interface WireCoverage {
  latStep?: number;
  lonStep?: number;
  points?: readonly CoveragePoint[];
}

export const canMapLocally = (): boolean => Engine.isAvailable();

export interface LocalCoverageRequest {
  from: Endpoint;
  band: BandKey;
  /** UTC hour, 0-23. */
  hour: number;
  date: Date;
  station: Station;
}

export async function coverLocally(
  request: LocalCoverageRequest,
): Promise<Coverage> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  const { ssn, basis } = ssnForMonth(year, month);
  const station = await engineStation(request.station);

  const answer = await Engine.predict<WireCoverage>({
    ...station,
    mode: 'area',
    fromLat: request.from.lat,
    fromLon: request.from.lon,
    month,
    year,
    ssn,
    watts: request.station.watts,
    requiredSnrDb: requiredSnrFor(request.station.mode),
    noiseDbw: NOISE_DBW,
    hour: request.hour,
    // One band per call. Asking the engine for several frequencies at once
    // makes it report the best of them at each point, which saturates the
    // whole map: the map exists to show how the selected band differs from
    // the others.
    freqMhz: BAND_MHZ[request.band],
    latStep: LAT_STEP,
    lonStep: LON_STEP,
  });

  const points: readonly CoveragePoint[] = (answer.points ?? []).map((p) => ({
    lat: p.lat,
    lon: p.lon,
    reliability: Math.min(1, Math.max(0, p.reliability)),
  }));

  if (points.length === 0) {
    throw new Error('the engine produced no coverage points');
  }

  return {
    band: request.band,
    hour: request.hour,
    // The engine echoes the steps it used. Preferred over the steps asked
    // for, so the drawn cells match the grid that was actually run.
    latStep: answer.latStep ?? LAT_STEP,
    lonStep: answer.lonStep ?? LON_STEP,
    reach: reachOf(points),
    basis,
    points,
  };
}
