/**
 * Maidenhead locators, both ways — see `shared/geo.ts`.
 *
 * Kept as a name under `src/data/` because that is where the app's callers
 * reach for it, and because the reason it is not a request to the server
 * is worth saying here: a round trip for arithmetic this small would make
 * the location button feel slow, and typing a grid square has to work
 * with no network at all.
 */
export { gridToLatLon, isGrid, latLonToGrid } from '../../../shared/geo.ts';
