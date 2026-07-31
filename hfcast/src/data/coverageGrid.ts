import type { CoveragePoint } from './types.ts';

/**
 * The coverage grid, and what "reachable" means on it.
 *
 * Separate from `localCoverage.ts` so it can be tested without the native
 * engine: these are the numbers that decide what the map shows, and they are
 * the same ones `server/src/coverage.ts` uses. A test in the server pins the
 * two together, because a map drawn on a different grid from the one that was
 * run would put every cell in the wrong place.
 */

/**
 * Cell size in degrees.
 *
 * 15 by 22.5 gives 12 rows of 16, which is 192 points: coarse enough to run
 * quickly and fine enough that a continent spans several cells. The longitude
 * step is the wider one because meridians converge — equal steps would make
 * the polar cells slivers.
 */
export const LAT_STEP = 15;
export const LON_STEP = 22.5;

/**
 * The threshold "reachable" means, matching the app's `patchy` band.
 *
 * The share of the map above it is a more useful summary than the best cell,
 * which saturates at "reliable" for almost every band and hour and so says
 * nothing about the difference between them.
 */
export const REACHABLE = 0.4;

/**
 * The share of the sphere this band reaches, weighted by area.
 *
 * Weighted by the cosine of the latitude because equal-angle cells are not
 * equal areas: without it the polar rows, which are slivers of the sphere,
 * would count as much as the equatorial ones and every band would look worse
 * than it is.
 */
export function reachOf(points: readonly CoveragePoint[]): number {
  const { hit, total } = points
    .map((point) => ({
      weight: Math.cos((point.lat * Math.PI) / 180),
      reached: point.reliability >= REACHABLE,
    }))
    .reduce(
      (sum, cell) => ({
        hit: sum.hit + (cell.reached ? cell.weight : 0),
        total: sum.total + cell.weight,
      }),
      { hit: 0, total: 0 },
    );
  return total > 0 ? hit / total : 0;
}
