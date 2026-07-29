/** Maidenhead locators and great-circle maths. All pure. */

const A = 'A'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);

const GRID_RE = /^[A-R]{2}[0-9]{2}(?:[A-X]{2})?$/i;

export function isGrid(value: string): boolean {
  return GRID_RE.test(value.trim());
}

/**
 * Maidenhead locator to the latitude and longitude of the square's centre.
 * Accepts 4 or 6 characters. Throws on anything else, since a silently wrong
 * coordinate is worse than a failed request.
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
  const clampedLat = Math.min(89.99999, Math.max(-90, lat));
  const clampedLon = Math.min(179.99999, Math.max(-180, lon));

  const adjLon = clampedLon + 180;
  const adjLat = clampedLat + 90;

  const fieldLon = Math.floor(adjLon / 20);
  const fieldLat = Math.floor(adjLat / 10);
  const sqLon = Math.floor((adjLon % 20) / 2);
  const sqLat = Math.floor(adjLat % 10);
  const subLon = Math.floor(((adjLon % 2) / 2) * 24);
  const subLat = Math.floor((adjLat % 1) * 24);

  return (
    String.fromCharCode(A + fieldLon)
    + String.fromCharCode(A + fieldLat)
    + String.fromCharCode(ZERO + sqLon)
    + String.fromCharCode(ZERO + sqLat)
    + String.fromCharCode(A + subLon)
    + String.fromCharCode(A + subLat)
  );
}

const R_EARTH_KM = 6371.0088;
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
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
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
