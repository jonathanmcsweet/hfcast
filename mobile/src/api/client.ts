import { packGlobe } from '../data/fineGlobe';
import { ApiError } from './error';
import {
  checkCoverage,
  checkCoveragePatch,
  checkPredictionResponse,
  checkSpaceWeather,
} from './shape';

export { ApiError };
import type {
  BandKey,
  Coverage,
  CoveragePatch,
  FineGlobe,
  MapRegion,
  PredictionResponse,
  Sounding,
  SpaceWeather,
} from '../data/types';
/**
 * Where the prediction server lives.
 *
 * A build-time constant, and no longer something a user can be asked for. The
 * engine is compiled into the app, so a phone computes its own forecasts and
 * has no server to point at; what still reaches this client is the web build,
 * which has no engine, and there the default is the machine serving the page.
 *
 * `EXPO_PUBLIC_HFCAST_API` overrides it for a development build pointed
 * somewhere else.
 */
export const API_BASE = process.env.EXPO_PUBLIC_HFCAST_API
  ?? 'http://127.0.0.1:8787';

/**
 * A request must always finish, one way or the other. A refused connection
 * fails immediately, but a port that accepts and then never answers — a
 * forwarded port with nothing behind it, a sleeping laptop, a captive portal —
 * would otherwise leave the app on its loading spinner with no way out.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * A request, and a look at what came back.
 *
 * `check` turns the parsed body into the shape it claims to be, or throws
 * an `ApiError`. It is not optional and there is no cast without one: a
 * response nobody looked at reaches the screen as missing fields rather
 * than as a failure. See `shape.ts`.
 */
async function getJson<T>(
  path: string,
  params: Record<string, string>,
  check: (body: unknown) => T,
): Promise<T> {
  const base = API_BASE;
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== '') url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: controller.signal });
  } catch (cause) {
    // Both a refused connection and the abort above land here. Neither has a
    // status, so they are reported as 0 rather than invented as a 5xx.
    const timedOut = controller.signal.aborted;
    throw new ApiError(
      timedOut
        ? `no answer from ${base} after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `could not reach ${base}`,
      0,
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let message = `request failed with ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string; };
      if (body.error) message = body.error;
    } catch {
      // Keep the status-based message.
    }
    throw new ApiError(message, response.status);
  }
  return check(await response.json());
}

export interface PredictionParams {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  /** ISO date, UTC. */
  date: string;
  /** Ask the server to drive the run from current conditions. */
  nowcast: boolean;
  /**
   * Power, mode and antenna, already as query parameters. Built by
   * `stationParams` so the app and the server cannot disagree about the
   * spelling of a field that silently changes every number returned.
   */
  station: Record<string, string>;
}

export function fetchPrediction(
  p: PredictionParams,
): Promise<PredictionResponse> {
  return getJson('/api/prediction', {
    from: p.from,
    to: p.to,
    fromLabel: p.fromLabel,
    toLabel: p.toLabel,
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
    ...p.station,
  }, checkPredictionResponse<PredictionResponse>);
}

/**
 * The same day with no destination: how much of the world hears this station.
 *
 * Forty-eight runs behind one request, so it is the slow route. Only the web
 * build asks for it — a device computes its own, see `data/localSurvey.ts`.
 */
export function fetchSurvey(
  p: Omit<PredictionParams, 'to' | 'toLabel'>,
): Promise<PredictionResponse> {
  return getJson('/api/survey', {
    from: p.from,
    fromLabel: p.fromLabel,
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
    ...p.station,
  }, checkPredictionResponse<PredictionResponse>);
}

/**
 * Measured foF2 near a point, or null where no live sounder is close
 * enough. Fetched through the server rather than directly: GIRO restricts
 * its CORS header to its own origin, so a browser blocks a direct call.
 */
export function fetchSounding(
  lat: number,
  lon: number,
): Promise<Sounding | null> {
  // Not checked beyond being an object or null. Nothing on the screen
  // depends on it — a missing field empties one line of one card — and
  // null is the ordinary answer for most of the world.
  return getJson(
    '/api/ionosonde',
    { at: `${lat},${lon}` },
    (body) => body as Sounding | null,
  );
}

export function fetchSpaceWeather(): Promise<SpaceWeather> {
  return getJson('/api/spaceweather', {}, checkSpaceWeather<SpaceWeather>);
}

/**
 * Coverage for one band at one hour.
 *
 * One hour per request because an area run computes one: a whole day is 24
 * runs, not one call with a day in it.
 */
export function fetchCoverage(p: {
  from: string;
  fromLabel: string;
  band: string;
  hour: number;
  date: string;
  nowcast?: boolean;
  station: Record<string, string>;
}): Promise<Coverage> {
  return getJson('/api/coverage', {
    from: p.from,
    fromLabel: p.fromLabel,
    band: p.band,
    hour: String(p.hour),
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
    ...p.station,
  }, checkCoverage<Coverage>);
}

/**
 * The fine grid, over the whole world.
 *
 * About 2.2 MB on the wire, and packed into typed arrays before it is
 * returned so the objects it arrived as are released straight away and
 * never reach a cache. See `fineGlobe.ts`.
 *
 * Asked once per band and hour, with nothing about the view in it: the
 * whole point of a whole-world answer is that panning and zooming never
 * need another one.
 */
export async function fetchFineGlobe(p: {
  from: string;
  fromLabel: string;
  band: BandKey;
  hour: number;
  date: string;
  nowcast?: boolean;
  station: Record<string, string>;
}): Promise<FineGlobe> {
  const answer = await getJson('/api/coverage/fine', {
    from: p.from,
    fromLabel: p.fromLabel,
    band: p.band,
    hour: String(p.hour),
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
    ...p.station,
  }, checkCoverage<Coverage>);
  return packGlobe(p.band, p.hour, answer);
}

/**
 * The fine grid around the operator, for the same band and hour.
 *
 * A separate request rather than a bigger one, so the coarse map is drawn
 * from the first answer and this fills in behind it. Null where the
 * station is near the antimeridian and there is no rectangle to ask for.
 */
export function fetchCoveragePatch(p: {
  from: string;
  fromLabel: string;
  band: string;
  hour: number;
  date: string;
  nowcast?: boolean;
  station: Record<string, string>;
  /**
   * Where the map is pointed and how much of it is showing. Absent asks
   * for the fine grid around the station, which is what a whole-globe
   * view wants.
   */
  region?: MapRegion | null;
}): Promise<CoveragePatch | null> {
  return getJson('/api/coverage/patch', {
    from: p.from,
    fromLabel: p.fromLabel,
    band: p.band,
    hour: String(p.hour),
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
    ...(p.region
      ? {
        atLat: String(p.region.lat),
        atLon: String(p.region.lon),
        halfLat: String(p.region.halfLatDeg),
      }
      : {}),
    ...p.station,
  }, checkCoveragePatch<CoveragePatch | null>);
}
