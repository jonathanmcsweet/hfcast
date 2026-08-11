/**
 * The coverage grid, and what "reachable" means on it.
 *
 * These are the numbers that decide what the map shows. A map drawn on a
 * different grid from the one that was run would put every cell in the
 * wrong place, and two thresholds would make one path's reach percentage
 * not comparable with another's.
 */
import type { CoveragePoint } from './points.ts';

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
 * The threshold "reachable" means, which is the app's `patchy` band.
 *
 * The share of the map above it is a more useful summary than the best cell,
 * which saturates at "reliable" for almost every band and hour and so says
 * nothing about the difference between them.
 *
 * `mobile/src/data/quality.ts` reads this for the bound between `weak` and
 * `patchy`, so retuning the bucket ladder moves what the map paints and what
 * the percentage counts together. Two numbers would let "reach 40%" stop
 * meaning "the share of the map at least patchy" with nothing failing.
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
