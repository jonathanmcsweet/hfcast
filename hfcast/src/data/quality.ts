import type { QualityKey } from '../theme';

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
  takeoffAngleDeg: number | null,
  reliability: number,
): boolean {
  if (takeoffAngleDeg === null) return false;
  return takeoffAngleDeg >= NVIS_MIN_ANGLE_DEG
    && qualityFor(reliability) !== 'closed';
}
