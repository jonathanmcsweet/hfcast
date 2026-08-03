import { latLonToGrid } from './grid.ts';
import type { Place } from './types.ts';

/**
 * Place-name search, asked for by the app itself.
 *
 * This mirrors `handleGeocode` in `server/src/index.ts`, which used to be the
 * only way to reach a geocoder. It is not any more: the server address stopped
 * being something a user can set, so an installed build had no server to ask
 * and could only search the 4,064 places bundled with it.
 *
 * Open-Meteo's geocoder is free, needs no key and no registration, and answers
 * with `access-control-allow-origin: *` when a browser asks — so unlike the
 * ionosonde this works from the web build too, and there is one implementation
 * rather than two.
 *
 * The bundled city list is still tried first and still answers most queries;
 * this is for what it lacks, which is everything smaller than a city. See
 * `useGeocode`.
 */

const GEOCODER = 'https://geocoding-api.open-meteo.com/v1/search';

/** Long enough for a slow connection, short enough to not hold the field. */
const FETCH_TIMEOUT_MS = 8000;

/** Eight is what the server asked for, and more than a list wants to show. */
const RESULT_COUNT = 8;

interface OpenMeteoPlace {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export async function fetchGeocode(
  query: string,
  lang: string,
): Promise<Place[]> {
  const url = new URL(GEOCODER);
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(RESULT_COUNT));
  url.searchParams.set('language', lang);
  url.searchParams.set('format', 'json');

  // AbortController rather than `AbortSignal.timeout`, which Hermes does not
  // have on the older of the two React Native versions this builds against.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`geocoder returned ${response.status}`);
    }
    const body = (await response.json()) as { results?: OpenMeteoPlace[]; };
    return (body.results ?? []).map(toPlace);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A result as the app holds a place.
 *
 * The locator is computed here rather than asked for, because the geocoder
 * does not know what one is and every other place in the app carries one.
 */
export function toPlace(result: OpenMeteoPlace): Place {
  return {
    name: result.name,
    lat: result.latitude,
    lon: result.longitude,
    grid: latLonToGrid(result.latitude, result.longitude),
    country: result.country ?? null,
    admin1: result.admin1 ?? null,
  };
}
