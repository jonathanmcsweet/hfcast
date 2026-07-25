/**
 * HTTP API for the HFcast app.
 *
 * Routes:
 *   GET /health
 *   GET /api/spaceweather
 *   GET /api/geocode?q=            place name search, or a Maidenhead locator
 *   GET /api/prediction?from&to    one day, optionally as a now-cast
 *   GET /api/forecast?from&to&days several days, one prediction each
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import { TtlCache } from './cache.ts';
import { gridToLatLon, isGrid, latLonToGrid } from './geo.ts';
import { endpointFromLatLon, isoDate, predict } from './predict.ts';
import { fetchSpaceWeather } from './spaceweather.ts';
import type { Endpoint, PredictionResponse, SpaceWeather } from './types.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';

/** Defaults describing a modest amateur station. */
const DEFAULT_WATTS = 100;
const DEFAULT_REQUIRED_SNR_DB = 24;
const DEFAULT_NOISE_DBW = 145;

/** Space weather updates on the order of an hour; geocoding barely changes. */
const spaceWeatherCache = new TtlCache<SpaceWeather>(15 * 60 * 1000, 1);
const geocodeCache = new TtlCache<unknown>(24 * 60 * 60 * 1000, 200);

class BadRequest extends Error {}

function num(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new BadRequest(`not a number: ${value}`);
  return parsed;
}

/** Accepts a Maidenhead locator or a "lat,lon" pair. */
function parseEndpoint(
  raw: string | null,
  label: string | null,
  name: string,
): Endpoint {
  if (raw === null || raw.trim() === '') {
    throw new BadRequest(`missing "${name}"`);
  }
  const value = raw.trim();

  if (isGrid(value)) {
    const { lat, lon } = gridToLatLon(value);
    return {
      grid: value.toUpperCase(),
      label: label ?? value.toUpperCase(),
      lat,
      lon,
    };
  }

  const parts = value.split(',');
  if (parts.length !== 2) {
    throw new BadRequest(`"${name}" must be a locator or "lat,lon"`);
  }
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
    throw new BadRequest(`latitude out of range in "${name}"`);
  }
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) {
    throw new BadRequest(`longitude out of range in "${name}"`);
  }
  return endpointFromLatLon(lat, lon, label ?? undefined);
}

function parseDate(raw: string | null): Date {
  if (raw === null || raw.trim() === '') {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequest(`not a date: ${raw}`);
  }
  return parsed;
}

/** Space weather is optional: the app shows an indicator when it is missing. */
async function trySpaceWeather(): Promise<SpaceWeather | null> {
  try {
    return await spaceWeatherCache.fetch('current', fetchSpaceWeather);
  } catch {
    return null;
  }
}

async function handlePrediction(url: URL): Promise<PredictionResponse> {
  const from = parseEndpoint(
    url.searchParams.get('from'),
    url.searchParams.get('fromLabel'),
    'from',
  );
  const to = parseEndpoint(
    url.searchParams.get('to'),
    url.searchParams.get('toLabel'),
    'to',
  );
  const date = parseDate(url.searchParams.get('date'));
  const wantNowcast = url.searchParams.get('nowcast') === '1';

  const spaceWeather = wantNowcast ? await trySpaceWeather() : null;

  const prediction = await predict({
    from,
    to,
    date,
    watts: num(url.searchParams.get('watts'), DEFAULT_WATTS),
    requiredSnrDb: num(url.searchParams.get('snr'), DEFAULT_REQUIRED_SNR_DB),
    noiseDbw: num(url.searchParams.get('noise'), DEFAULT_NOISE_DBW),
    // Falling back to climatology when the upstream is down is deliberate:
    // a slightly stale basis beats no forecast, as long as it is labelled.
    ...(wantNowcast && spaceWeather
      ? { ssnOverride: spaceWeather.effectiveSsn, basis: 'nowcast' as const }
      : {}),
  });

  return { prediction, spaceWeather };
}

async function handleForecast(url: URL): Promise<PredictionResponse[]> {
  const days = Math.min(14, Math.max(1, num(url.searchParams.get('days'), 5)));
  const start = parseDate(url.searchParams.get('date'));
  const from = parseEndpoint(
    url.searchParams.get('from'),
    url.searchParams.get('fromLabel'),
    'from',
  );
  const to = parseEndpoint(
    url.searchParams.get('to'),
    url.searchParams.get('toLabel'),
    'to',
  );

  const watts = num(url.searchParams.get('watts'), DEFAULT_WATTS);
  const requiredSnrDb = num(
    url.searchParams.get('snr'),
    DEFAULT_REQUIRED_SNR_DB,
  );
  const noiseDbw = num(url.searchParams.get('noise'), DEFAULT_NOISE_DBW);

  const out: PredictionResponse[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start.getTime() + i * 86_400_000);
    // Sequential on purpose: each run is a process, and the box this is
    // expected to run on has far less memory than it has cores.
    const prediction = await predict({
      from,
      to,
      date,
      watts,
      requiredSnrDb,
      noiseDbw,
    });
    out.push({ prediction, spaceWeather: null });
  }
  return out;
}

interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
  grid: string;
  country: string | null;
  admin1: string | null;
}

interface OpenMeteoPlace {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

async function handleGeocode(url: URL): Promise<GeocodeResult[]> {
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query === '') throw new BadRequest('missing "q"');

  // A locator needs no upstream: it already is a position.
  if (isGrid(query)) {
    const { lat, lon } = gridToLatLon(query);
    return [
      {
        name: query.toUpperCase(),
        lat,
        lon,
        grid: query.toUpperCase(),
        country: null,
        admin1: null,
      },
    ];
  }

  return (await geocodeCache.fetch(query.toLowerCase(), async () => {
    const upstream = new URL('https://geocoding-api.open-meteo.com/v1/search');
    upstream.searchParams.set('name', query);
    upstream.searchParams.set('count', '8');
    upstream.searchParams.set('language', url.searchParams.get('lang') ?? 'en');
    upstream.searchParams.set('format', 'json');

    const response = await fetch(upstream, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`geocoder returned ${response.status}`);
    const body = (await response.json()) as { results?: OpenMeteoPlace[]; };

    return (body.results ?? []).map((r) => ({
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      grid: latLonToGrid(r.latitude, r.longitude),
      country: r.country ?? null,
      admin1: r.admin1 ?? null,
    }));
  })) as GeocodeResult[];
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function route(url: URL): Promise<unknown> {
  switch (url.pathname) {
    case '/health':
      return { ok: true, now: isoDate(new Date()) };
    case '/api/spaceweather': {
      const sw = await trySpaceWeather();
      if (!sw) throw new Error('space weather upstream unavailable');
      return sw;
    }
    case '/api/geocode':
      return await handleGeocode(url);
    case '/api/prediction':
      return await handlePrediction(url);
    case '/api/forecast':
      return await handleForecast(url);
    default:
      return undefined;
  }
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(
    req.url ?? '/',
    `http://${req.headers.host ?? 'localhost'}`,
  );

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    send(res, 405, { error: 'method not allowed' });
    return;
  }

  route(url)
    .then((body) => {
      if (body === undefined) send(res, 404, { error: 'not found' });
      else send(res, 200, body);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof BadRequest) send(res, 400, { error: message });
      else {
        console.error(`${url.pathname}: ${message}`);
        send(res, 502, { error: message });
      }
    });
});

server.listen(PORT, HOST, () => {
  console.log(`hfcast-server listening on http://${HOST}:${PORT}`);
});
