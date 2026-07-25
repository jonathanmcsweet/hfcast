/**
 * Maidenhead locator from a position.
 *
 * This mirrors `latLonToGrid` in `server/src/geo.ts`. It is duplicated rather
 * than shared because the only client-side use is labelling a GPS fix, and a
 * round trip to the server for that would make the location button feel slow.
 */

const A = 'A'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);

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
