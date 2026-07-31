import type { QualityKey } from '../theme';
// Extensions spelled out because a test imports this module and node's
// type stripping loads the file named. Metro resolves it either way.
import { angularDistanceDeg, EARTH_KM } from './projection.ts';
import type { CoveragePoint } from './types.ts';

/**
 * VOACAP reliability is continuous, but the decision it feeds is not:
 * an operator is choosing whether to call on this band. Four buckets
 * carry that decision better than a gradient does.
 */
export function qualityFor(reliability: number): QualityKey {
  if (reliability >= 0.7) return 'reliable';
  if (reliability >= 0.4) return 'patchy';
  if (reliability >= 0.15) return 'weak';
  return 'closed';
}

export const QUALITY_ORDER: QualityKey[] = [
  'reliable',
  'patchy',
  'weak',
  'closed',
];

/**
 * Above this take-off angle the path is working by near-vertical
 * incidence: the signal leaves steeply, comes back down close to where it
 * started, and there is no skip zone.
 *
 * Sixty degrees is the conventional line rather than a computed one, and
 * the engine's own numbers sit well clear of it in both directions — a
 * 30 km path measured 81 to 88 degrees, an 8,200 km path never exceeded
 * 38. So the exact value does not decide any real case.
 */
export const NVIS_MIN_ANGLE_DEG = 60;

/**
 * Whether this band and hour reach by near-vertical incidence.
 *
 * A closed band is excluded on purpose. The angle describes the geometry
 * of a mode the engine found, and calling a band that does not work
 * "near-vertical" would explain nothing and imply something false.
 */
export function isNvis(
  takeoffAngleDeg: number | null | undefined,
  reliability: number,
): boolean {
  if (takeoffAngleDeg === null || takeoffAngleDeg === undefined) return false;
  return takeoffAngleDeg >= NVIS_MIN_ANGLE_DEG
    && qualityFor(reliability) !== 'closed';
}

/** One degree of great circle, in kilometres. */
const KM_PER_DEGREE = (EARTH_KM * Math.PI) / 180;

/**
 * How far the near-vertical region reaches, in kilometres, or null.
 *
 * The furthest grid point still working by near-vertical incidence. It is
 * the number the map's shading cannot give: a shape is not a distance,
 * and the question an operator has is how far this band carries without a
 * skip zone — which is the difference between a county and a state.
 *
 * Measured to the cell's own point rather than to its far edge, so it is
 * the last place that was computed rather than an extrapolation past it.
 * Null when no point qualifies, which is the ordinary answer on a high
 * band or at night.
 */
export function nvisReachKm(
  from: { lat: number; lon: number; },
  points: readonly CoveragePoint[],
): number | null {
  const reaches = points
    .filter((point) => isNvis(point.takeoffAngleDeg, point.reliability))
    .map((point) =>
      angularDistanceDeg(from.lon, from.lat, point.lon, point.lat)
      * KM_PER_DEGREE
    );
  return reaches.length === 0 ? null : Math.max(...reaches);
}
