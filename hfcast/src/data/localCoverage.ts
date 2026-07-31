import * as Engine from '../../modules/hfcast-engine';
import { useEngineCost } from '../store/useEngineCost';
import type { Station } from '../store/useStationStore';
import { LAT_STEP, LON_STEP, reachOf } from './coverageGrid';
import { patchGrid, patchRequestBounds } from './coveragePatch';
import { FINE_LAT_STEP, FINE_LON_STEP, packGlobe } from './fineGlobe';
import { engineStation, type Nowcast, ssnFor } from './localPredict';
import { requiredSnrFor } from './modes';
import { latShards } from './shard';
import {
  BAND_MHZ,
  type BandKey,
  type Coverage,
  type CoveragePatch,
  type CoveragePoint,
  type Endpoint,
  type FineGlobe,
  type MapRegion,
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
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
  points?: readonly CoveragePoint[];
}

/** Clamped here rather than trusted: the map colours by this number. */
const asPoint = (p: CoveragePoint): CoveragePoint => ({
  lat: p.lat,
  lon: p.lon,
  reliability: Math.min(1, Math.max(0, p.reliability)),
  takeoffAngleDeg: p.takeoffAngleDeg ?? null,
});

export const canMapLocally = (): boolean => Engine.isAvailable();

export interface LocalCoverageRequest {
  from: Endpoint;
  band: BandKey;
  /** UTC hour, 0-23. */
  hour: number;
  date: Date;
  station: Station;
  /** Absent offline, and then the run is climatology. */
  nowcast?: Nowcast;
  /**
   * The part of the world the map is showing, for the fine grid only.
   *
   * Absent means the whole globe, and then the fine grid goes around the
   * station — which is the same place the map is centred on, so the two
   * agree at the default view.
   */
  region?: MapRegion | null;
}

/**
 * How the fine grid is cut on a device, and how many threads run it.
 *
 * Equal, because a strip is handed to a thread and an extra strip only
 * adds a coefficient load. Four is where a modern phone's cores stop
 * being idle without asking a four-core tablet to run more threads than
 * it has; the plan calls for measuring two and four on real hardware,
 * and this is the number that changes when that is done.
 *
 * Not the emulator: it runs five to ten times slow and its ratios do
 * not carry over to a device.
 */
const DEVICE_STRIPS = 4;
const DEVICE_THREADS = 4;

export async function coverLocally(
  request: LocalCoverageRequest,
): Promise<Coverage> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  const { ssn, basis } = ssnFor(year, month, request.nowcast);
  const station = await engineStation(request.station);

  // Timed, because this is the measurement the fine grid's decision
  // rests on: the same engine, the same antenna, the same coefficient
  // files, so the cost per point carries straight over to a bigger grid
  // on this device. It costs nothing — the run happens anyway.
  const startedAt = Date.now();
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
  const elapsedMs = Date.now() - startedAt;

  const points = (answer.points ?? []).map(asPoint);

  if (points.length === 0) {
    throw new Error('the engine produced no coverage points');
  }

  useEngineCost.getState().record(elapsedMs, points.length);

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

/**
 * The fine grid, over the whole world, on the device.
 *
 * One call at 34,560 points. The engine module runs predictions on a
 * single background thread by design — one intention at a time — so this
 * occupies it for as long as the run takes, which is seconds rather than
 * the coarse map's tens of milliseconds. Milestone 3 of
 * `docs/handoff-skia-globe.md` is what decides whether a given device
 * should be asked at all; this function only answers.
 *
 * The result is packed into typed arrays before returning, so the
 * objects the engine produced are released rather than cached.
 */
export async function coverFineLocally(
  request: LocalCoverageRequest,
): Promise<FineGlobe> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  const { ssn, basis } = ssnFor(year, month, request.nowcast);
  const station = await engineStation(request.station);

  const ask = {
    ...station,
    mode: 'area' as const,
    fromLat: request.from.lat,
    fromLon: request.from.lon,
    month,
    year,
    ssn,
    watts: request.station.watts,
    requiredSnrDb: requiredSnrFor(request.station.mode),
    noiseDbw: NOISE_DBW,
    hour: request.hour,
    freqMhz: BAND_MHZ[request.band],
    latStep: FINE_LAT_STEP,
    lonStep: FINE_LON_STEP,
  };

  // Cut into latitude strips so the batch can use more than one core.
  // The arithmetic is the server's, copied character for character, so
  // the two paths run the same lattice — see `shard.ts`. Null means the
  // grid should not be split, and then it runs whole.
  const strips = Engine.canBatch()
    ? latShards(undefined, FINE_LAT_STEP, FINE_LON_STEP, DEVICE_STRIPS)
    : null;

  const answers = strips === null
    ? [await Engine.predict<WireCoverage>(ask)]
    : await Engine.predictMany<WireCoverage>(
      strips.map((bounds) => ({ ...ask, ...bounds })),
      DEVICE_THREADS,
    );

  // Concatenated in strip order. The engine emits rows south to north,
  // the strips are cut south to north, so this is the sequence one run
  // would have produced — not the same points in some other order, which
  // is what the columnar packing depends on.
  const points = answers.flatMap((answer) =>
    (answer.points ?? []).map(asPoint)
  );
  if (points.length === 0) {
    throw new Error('the engine produced no fine coverage points');
  }

  const first = answers[0] as WireCoverage;
  return packGlobe(request.band, request.hour, {
    band: request.band,
    hour: request.hour,
    latStep: first.latStep ?? FINE_LAT_STEP,
    lonStep: first.lonStep ?? FINE_LON_STEP,
    reach: 0,
    basis,
    points,
  });
}

/**
 * The fine grid around the operator, at the same band and hour.
 *
 * A second run rather than a finer first one: the same step over the
 * whole globe would be about a hundred times the work, and the question
 * it answers — where the low bands reach without a skip zone — is only
 * about the region near the station.
 *
 * Cost, measured on the compiled-in engine at Denver, 40m, 18:00 UTC: 288
 * points in 55 ms against the coarse grid's 192 points in 42 ms, so about
 * 0.14 ms a point over a fixed cost that is the coefficient load. The
 * widest patch, at the latitude where the longitude span stops widening,
 * is 640 points. On a device that is the same multiple of the coarse run,
 * which is why this is a query of its own: the coarse map paints first
 * and this arrives after it rather than delaying it.
 *
 * Null where the station is near the antimeridian — see `patchBounds`.
 */
export async function coverPatchLocally(
  request: LocalCoverageRequest,
): Promise<CoveragePatch | null> {
  // Where the map is pointed, or the station when it is showing the
  // whole globe and the two are the same place anyway.
  const region = request.region;
  const grid = region
    ? patchGrid(region.lat, region.lon, region.halfLatDeg)
    : patchGrid(request.from.lat, request.from.lon);
  if (grid === null) return null;
  const box = patchRequestBounds(grid);

  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  const { ssn, basis } = ssnFor(year, month, request.nowcast);
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
    freqMhz: BAND_MHZ[request.band],
    latStep: grid.latStep,
    lonStep: grid.lonStep,
    ...box,
  });

  const points = (answer.points ?? []).map(asPoint);
  if (points.length === 0) {
    throw new Error('the engine produced no patch points');
  }

  return {
    band: request.band,
    hour: request.hour,
    latStep: answer.latStep ?? grid.latStep,
    lonStep: answer.lonStep ?? grid.lonStep,
    // The engine snaps the rectangle to its own lattice, so these are the
    // grid that ran rather than the one asked for.
    latMin: answer.latMin ?? grid.latMin,
    latMax: answer.latMax ?? grid.latMax,
    lonMin: answer.lonMin ?? grid.lonMin,
    lonMax: answer.lonMax ?? grid.lonMax,
    basis,
    points,
  };
}
