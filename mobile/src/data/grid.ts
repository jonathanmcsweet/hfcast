/**
 * Maidenhead locators, both ways.
 *
 * This mirrors `server/src/geo.ts`. It is duplicated rather than shared because
 * a round trip for arithmetic this small would make the location button feel
 * slow — and because the app has to do it with no network at all: the server
 * resolved a typed locator without calling a geocoder, but reaching the server
 * was still a network call, so typing a grid square offline used to fail.
 */

const A = 'A'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);

const GRID_RE = /^[A-R]{2}[0-9]{2}(?:[A-X]{2})?$/i;

/** Whether this text is a 4 or 6 character locator. Case-insensitive. */
export function isGrid(value: string): boolean {
  return GRID_RE.test(value.trim());
}

/**
 * A locator to the centre of the square it names.
 *
 * Throws on anything that is not one, since a silently wrong coordinate is
 * worse than a refused search.
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

  // A locator names a rectangle and this returns its centre. Six characters
  // divide the square into subsquares and name one; four leave the whole
  // 2 by 1 degree square.
  const offset = g.length === 6
    ? {
      lon: (g.charCodeAt(4) - A) * (2 / 24) + 1 / 24,
      lat: (g.charCodeAt(5) - A) * (1 / 24) + 1 / 48,
    }
    : { lon: 1, lat: 0.5 };

  return { lat: corner.lat + offset.lat, lon: corner.lon + offset.lon };
}

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
