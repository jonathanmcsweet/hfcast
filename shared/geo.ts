/**
 * Maidenhead locators and great-circle maths. All pure.
 *
 * One module for both projects. There were four `distanceKm` — two in the
 * app, two on the server — with two different earth radii and two
 * different formulations, and two `latLonToGrid` that agreed only because
 * nobody had changed either.
 */

const A = 'A'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);

const GRID_RE = /^[A-R]{2}[0-9]{2}(?:[A-X]{2})?$/i;

/** Whether this text is a 4 or 6 character locator. Case-insensitive. */
export function isGrid(value: string): boolean {
  return GRID_RE.test(value.trim());
}

/**
 * A locator to the centre of the square it names. Accepts 4 or 6
 * characters.
 *
 * Throws on anything else, since a silently wrong coordinate is worse
 * than a refused search.
 */
export function gridToLatLon(grid: string): { lat: number; lon: number; } {
  const g = grid.trim().toUpperCase();
  if (!GRID_RE.test(g)) throw new Error(`not a Maidenhead locator: ${grid}`);

  const field = [g.charCodeAt(0) - A, g.charCodeAt(1) - A] as const;
  const square = [g.charCodeAt(2) - ZERO, g.charCodeAt(3) - ZERO] as const;

  const corner = {
    lon: field[0] * 20 + square[0] * 2 - 180,
    lat: field[1] * 10 + square[1] - 90,
  };

  // A locator names a rectangle, and the coordinate returned is its
  // centre. Six characters divide the square into subsquares and name
  // one; four leave the whole 2 by 1 degree square.
  const offset = g.length === 6
    ? {
      lon: (g.charCodeAt(4) - A) * (2 / 24) + 1 / 24,
      lat: (g.charCodeAt(5) - A) * (1 / 24) + 1 / 48,
    }
    : { lon: 1, lat: 0.5 };

  return { lat: corner.lat + offset.lat, lon: corner.lon + offset.lon };
}

/** Latitude and longitude to a 6-character Maidenhead locator. */
export function latLonToGrid(lat: number, lon: number): string {
  const adjLon = Math.min(179.99999, Math.max(-180, lon)) + 180;
  const adjLat = Math.min(89.99999, Math.max(-90, lat)) + 90;

  return (
    String.fromCharCode(A + Math.floor(adjLon / 20))
    + String.fromCharCode(A + Math.floor(adjLat / 10))
    + String.fromCharCode(ZERO + Math.floor((adjLon % 20) / 2))
    + String.fromCharCode(ZERO + Math.floor(adjLat % 10))
    + String.fromCharCode(A + Math.floor(((adjLon % 2) / 2) * 24))
    + String.fromCharCode(A + Math.floor((adjLat % 1) * 24))
  );
}

/**
 * The earth's mean radius, kilometres.
 *
 * The IUGG mean. The app's two copies used a rounded 6371, which is
 * 1.4 parts per million smaller — invisible in a distance shown to the
 * nearest kilometre, and not a reason to keep two numbers.
 */
export const EARTH_RADIUS_KM = 6371.0088;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in kilometres. */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial great-circle bearing in degrees, 0-360 clockwise from north. */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2)
    - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Where you are after travelling `distanceKm` on `bearing` from a point.
 *
 * The direct geodesic on a sphere. Both surveys sample directions with
 * it, and both had their own copy.
 */
export function pointFrom(
  from: { lat: number; lon: number; },
  bearing: number,
  distanceKm: number,
): { lat: number; lon: number; } {
  const angular = distanceKm / EARTH_RADIUS_KM;
  const lat1 = toRad(from.lat);
  const lon1 = toRad(from.lon);
  const theta = toRad(bearing);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular)
      + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta),
  );
  const lon2 = lon1
    + Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: toDeg(lat2),
    lon: ((toDeg(lon2) + 540) % 360) - 180,
  };
}
