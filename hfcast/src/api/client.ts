import type {
  Coverage,
  Place,
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

export class ApiError extends Error {
  /** 0 when the request never reached the server at all. */
  readonly status: number;
  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * A request must always finish, one way or the other. A refused connection
 * fails immediately, but a port that accepts and then never answers — a
 * forwarded port with nothing behind it, a sleeping laptop, a captive portal —
 * would otherwise leave the app on its loading spinner with no way out.
 */
const REQUEST_TIMEOUT_MS = 10_000;

async function getJson<T>(
  path: string,
  params: Record<string, string>,
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
  return (await response.json()) as T;
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
  return getJson<PredictionResponse>('/api/prediction', {
    from: p.from,
    to: p.to,
    fromLabel: p.fromLabel,
    toLabel: p.toLabel,
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
    ...p.station,
  });
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
  return getJson<PredictionResponse>('/api/survey', {
    from: p.from,
    fromLabel: p.fromLabel,
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
    ...p.station,
  });
}

/**
 * Several days in one request, for filling the cache before going
 * offline. The server never now-casts here and always answers with
 * `spaceWeather: null`, so this covers the days after today only —
 * today's own request stays separate because only it can be a now-cast.
 */
export function fetchForecast(
  p: Omit<PredictionParams, 'nowcast'> & { days: number; },
): Promise<PredictionResponse[]> {
  return getJson<PredictionResponse[]>('/api/forecast', {
    from: p.from,
    to: p.to,
    fromLabel: p.fromLabel,
    toLabel: p.toLabel,
    date: p.date,
    days: String(p.days),
    ...p.station,
  });
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
  return getJson<Sounding | null>('/api/ionosonde', { at: `${lat},${lon}` });
}

export function fetchGeocode(query: string, lang: string): Promise<Place[]> {
  return getJson<Place[]>('/api/geocode', { q: query, lang });
}

export function fetchSpaceWeather(): Promise<SpaceWeather> {
  return getJson<SpaceWeather>('/api/spaceweather', {});
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
  return getJson<Coverage>('/api/coverage', {
    from: p.from,
    fromLabel: p.fromLabel,
    band: p.band,
    hour: String(p.hour),
    date: p.date,
    nowcast: p.nowcast ? '1' : '',
    ...p.station,
  });
}
