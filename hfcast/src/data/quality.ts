import type { QualityKey } from '../theme';

/**
 * VOACAP reliability is continuous, but the decision it feeds is not:
 * an operator is choosing whether to call on this band. Four buckets
 * carry that decision better than a gradient does.
 */
export function qualityFor(reliability: number): QualityKey {
  if (reliability >= 0.7) return 'reliable';
  if (reliability >= 0.4) return 'marginal';
  if (reliability >= 0.15) return 'poor';
  return 'closed';
}

export const QUALITY_ORDER: QualityKey[] = [
  'reliable', 'marginal', 'poor', 'closed',
];
