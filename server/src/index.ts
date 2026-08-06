/**
 * HTTP API for the HFcast app.
 *
 * Routes:
 *   GET /health
 *   GET /api/spaceweather
 *   GET /api/geocode?q=            place name search, or a Maidenhead locator
 *   GET /api/prediction?from&to    one day, optionally as a now-cast
 *   GET /api/survey?from           one day with no destination, every direction
 *   GET /api/ionosonde?at=lat,lon  measured foF2 from the nearest sounder
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import {
  ANTENNA_ORDER,
  type AntennaChoice,
  type AntennaKey,
  DEFAULT_ANTENNA,
  isAntennaKey,
  normaliseAntenna,
} from './antenna.ts';
import { TtlCache } from './cache.ts';
import { coverage, coverageFine, coveragePatch } from './coverage.ts';
import { gridToLatLon, isGrid, latLonToGrid } from './geo.ts';
import {
  fetchSounding,
  IONOSONDE_TTL_MS,
  type Sounding,
  usefulStation,
} from './ionosonde.ts';
import { endpointFromLatLon, isoDate, predict } from './predict.ts';
import { fetchSpaceWeather } from './spaceweather.ts';
import {
  DEFAULT_MODE,
  isModeKey,
  MODE_ORDER,
  type ModeKey,
  requiredSnrFor,
} from './station.ts';
import { survey } from './survey.ts';
import {
  BAND_ORDER,
  type BandKey,
  type Endpoint,
  type MapRegion,
  type PredictionResponse,
  type SpaceWeather,
} from './types.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';

/** Defaults describing a modest amateur station. */
const DEFAULT_WATTS = 100;
const DEFAULT_NOISE_DBW = 145;

/**
 * The power the deck can actually carry.
 *
 * VOACAP takes power in kilowatts in a fixed four-decimal field, so a
 * tenth of a watt is the smallest value that survives being written down.
 * Measured on Seattle to Tokyo, 2026-07-29: from 100 W down to 0.1 W
 * every step moves the signal-to-noise by exactly ten log of the ratio.
 * At 0.05 W the field rounds and nothing moves, and at 0.01 W it rounds
 * to zero and the run returns 38 dB — a better answer than 100 W.
 *
 * That last case is why this is a floor and not a suggestion: the wrong
 * answer looks entirely ordinary. QRP operators work at a watt and below,
 * so the range has to reach down there, and it has to stop where the
 * model stops meaning anything.
 *
 * The ceiling is where an amateur station ends: 1500 W is the legal
 * limit in the countries this is built for, and it is the top of the
 * app's own control. Clamped rather than refused, because a control that
 * stops is friendlier than a request that fails.
 *
 * These are the app's `LIMITS.watts` — see
 * `mobile/src/store/useStationStore.ts`, whose comment says it repeats
 * what the server clamps to. It did not: this was 10,000 while the app
 * offered 1500, so the sentence the reader is shown named one number and
 * the service enforced another.
 */
const MIN_WATTS = 0.1;
const MAX_WATTS = 1500;

/** Space weather updates on the order of an hour; geocoding barely changes. */
const spaceWeatherCache = new TtlCache<SpaceWeather>(15 * 60 * 1000, 1);
const geocodeCache = new TtlCache<unknown>(24 * 60 * 60 * 1000, 200);
// Keyed on the station rather than the request point, since every point
// near one station wants the same reading.
const ionosondeCache = new TtlCache<Sounding | null>(IONOSONDE_TTL_MS, 50);

class BadRequest extends Error {}

function num(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new BadRequest(`not a number: ${value}`);
  return parsed;
}

/**
 * The station behind a request: power, what it has to be good enough for,
 * and the antenna.
 *
 * `mode` sets the required signal-to-noise, and an explicit `snr` still
 * overrides it. Both are kept because they answer different questions: a
 * reader picks a mode, and anyone measuring the engine wants the number
 * itself without having to find a mode that happens to produce it.
 */
function parseStation(url: URL): {
  watts: number;
  requiredSnrDb: number;
  noiseDbw: number;
  antenna: AntennaChoice;
} {
  const mode = url.searchParams.get('mode');
  if (mode !== null && mode.trim() !== '' && !isModeKey(mode)) {
    throw new BadRequest(`mode must be one of ${MODE_ORDER.join(', ')}`);
  }
  const fromMode = requiredSnrFor(
    isModeKey(mode ?? '') ? mode as ModeKey : DEFAULT_MODE,
  );

  const type = url.searchParams.get('ant');
  if (type !== null && type.trim() !== '' && !isAntennaKey(type)) {
    throw new BadRequest(`ant must be one of ${ANTENNA_ORDER.join(', ')}`);
  }

  return {
    watts: Math.min(
      MAX_WATTS,
      Math.max(MIN_WATTS, num(url.searchParams.get('watts'), DEFAULT_WATTS)),
    ),
    requiredSnrDb: num(url.searchParams.get('snr'), fromMode),
    noiseDbw: num(url.searchParams.get('noise'), DEFAULT_NOISE_DBW),
    antenna: normaliseAntenna({
      type: isAntennaKey(type ?? '') ? type as AntennaKey : 'isotropic',
      heightM: num(url.searchParams.get('antHeight'), DEFAULT_ANTENNA.heightM),
      gainDbd: num(url.searchParams.get('antGain'), DEFAULT_ANTENNA.gainDbd),
      beamDeg: num(url.searchParams.get('beam'), 0),
    }),
  };
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
    ...parseStation(url),
    // Falling back to climatology when the upstream is down is deliberate:
    // a slightly stale basis beats no forecast, as long as it is labelled.
    ...(wantNowcast && spaceWeather
      ? {
        ssnOverride: spaceWeather.effectiveSsn,
        kpMax24h: spaceWeather.kpMax24h,
        basis: 'nowcast' as const,
      }
      : {}),
  });

  return { prediction, spaceWeather };
}

/**
 * The same forecast with no destination: how much of the world hears this
 * station, hour by hour and band by band.
 *
 * Forty-eight engine runs behind one request, so it is slower than a
 * prediction and cached for the same fifteen minutes. See `survey.ts`.
 */
async function handleSurvey(url: URL): Promise<PredictionResponse> {
  const from = parseEndpoint(
    url.searchParams.get('from'),
    url.searchParams.get('fromLabel'),
    'from',
  );
  const date = parseDate(url.searchParams.get('date'));
  const wantNowcast = url.searchParams.get('nowcast') === '1';

  const spaceWeather = wantNowcast ? await trySpaceWeather() : null;

  const prediction = await survey({
    from,
    date,
    ...parseStation(url),
    ...(wantNowcast && spaceWeather
      ? {
        ssnOverride: spaceWeather.effectiveSsn,
        kpMax24h: spaceWeather.kpMax24h,
        basis: 'nowcast' as const,
      }
      : {}),
  });

  return { prediction, spaceWeather };
}

/**
 * Coverage for one band at one hour.
 *
 * Takes the hour explicitly rather than deriving it from the clock: the
 * app's map follows a slider the user moves, so "now" is only one of the
 * twenty-four answers it asks for.
 */
async function coverageRequest(url: URL) {
  const from = parseEndpoint(
    url.searchParams.get('from'),
    url.searchParams.get('fromLabel'),
    'from',
  );
  const band = url.searchParams.get('band');
  if (band === null || !(BAND_ORDER as readonly string[]).includes(band)) {
    throw new BadRequest(
      `band must be one of ${BAND_ORDER.join(', ')}`,
    );
  }
  const hour = num(url.searchParams.get('hour'), 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new BadRequest('hour must be a whole number from 0 to 23');
  }
  const date = parseDate(url.searchParams.get('date'));
  const wantNowcast = url.searchParams.get('nowcast') === '1';
  const spaceWeather = wantNowcast ? await trySpaceWeather() : null;

  return {
    from,
    date,
    band: band as BandKey,
    hour,
    ...parseStation(url),
    ...(spaceWeather
      ? { ssnOverride: spaceWeather.effectiveSsn, basis: 'nowcast' as const }
      : {}),
  };
}

async function handleCoverage(url: URL) {
  return await coverage(await coverageRequest(url));
}

/**
 * The fine grid, over the whole world.
 *
 * The same request as the coarse map at a step a hundred and eighty
 * times finer. A separate route for the same reason the patch has one:
 * the coarse map is the answer and must be drawn as soon as it exists,
 * and this arrives behind it and replaces its cells.
 *
 * The response is about 2.2 MB. That is the price of asking the question
 * once for the whole world instead of asking it again on every pan.
 */
async function handleCoverageFine(url: URL) {
  return await coverageFine(await coverageRequest(url));
}

/**
 * The fine grid around the operator, for the same band and hour.
 *
 * The same request as the coarse map, answered over a rectangle instead
 * of the world. A separate route rather than a parameter on the other
 * one, because the two are fetched separately on purpose: the coarse map
 * is the answer and has to be drawn as soon as it exists, and this is
 * detail that arrives behind it.
 *
 * Answers `null` for a station near the antimeridian, which is a fact
 * about where it is rather than a failure — see `coveragePatch.ts`.
 */
async function handleCoveragePatch(url: URL) {
  const region = parseRegion(url);
  return await coveragePatch({
    ...(await coverageRequest(url)),
    ...(region ? { region } : {}),
  });
}

/**
 * Where the map is pointed, if the caller said.
 *
 * All three together or none: a half-extent with no centre, or a centre
 * with no half-extent, describes nothing, and guessing the missing one
 * would put the detail somewhere the reader is not looking. Absent is
 * the whole-globe view, where the fine grid belongs at the station.
 */
function parseRegion(url: URL): MapRegion | null {
  const at = ['atLat', 'atLon', 'halfLat']
    .map((name) => url.searchParams.get(name));
  if (at.every((value) => value === null)) return null;
  if (at.some((value) => value === null)) {
    throw new BadRequest('atLat, atLon and halfLat go together or not at all');
  }
  const [lat, lon, halfLatDeg] = at.map((value) => Number(value));
  if (
    !Number.isFinite(lat) || !Number.isFinite(lon)
    || !Number.isFinite(halfLatDeg)
  ) {
    throw new BadRequest('atLat, atLon and halfLat must be numbers');
  }
  if ((lat as number) < -90 || (lat as number) > 90) {
    throw new BadRequest('atLat must be between -90 and 90');
  }
  if ((lon as number) < -180 || (lon as number) > 180) {
    throw new BadRequest('atLon must be between -180 and 180');
  }
  if ((halfLatDeg as number) <= 0) {
    throw new BadRequest('halfLat must be above zero');
  }
  return {
    lat: lat as number,
    lon: lon as number,
    halfLatDeg: halfLatDeg as number,
  };
}

/**
 * Measured foF2 near a point. `null` when there is no live station in
 * range or the service did not answer, which is the ordinary case outside
 * Europe rather than a failure.
 */
async function handleIonosonde(url: URL): Promise<Sounding | null> {
  const at = parseEndpoint(url.searchParams.get('at'), null, 'at');
  const station = usefulStation(at.lat, at.lon);
  if (station === null) return null;
  const cached = ionosondeCache.get(station.ursi);
  if (cached !== undefined) return cached;
  const sounding = await fetchSounding(at.lat, at.lon);
  ionosondeCache.set(station.ursi, sounding);
  return sounding;
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
    case '/api/survey':
      return await handleSurvey(url);
    case '/api/coverage':
      return await handleCoverage(url);
    case '/api/coverage/patch':
      return await handleCoveragePatch(url);
    case '/api/coverage/fine':
      return await handleCoverageFine(url);
    case '/api/ionosonde':
      return await handleIonosonde(url);
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
