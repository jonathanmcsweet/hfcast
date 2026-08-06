import type { BandHourPrediction, PathPrediction } from './types';

/**
 * Pure reads over a PathPrediction. These used to live beside the sample data;
 * now that predictions come from the server they belong on their own.
 */

const wrapHour = (hour: number) => ((hour % 24) + 24) % 24;

export function cellFor(
  p: PathPrediction,
  band: BandKeyLike,
  hour: number,
): BandHourPrediction | undefined {
  const h = wrapHour(hour);
  return p.cells.find((c) => c.band === band && c.hour === h);
}

type BandKeyLike = BandHourPrediction['band'];

/**
 * Maximum usable frequency for the hour. VOACAP reports this directly, so it
 * is read rather than inferred from which bands happen to be open.
 */
export function mufAt(p: PathPrediction, hour: number): number {
  return p.mufByHour[wrapHour(hour)] ?? 0;
}
