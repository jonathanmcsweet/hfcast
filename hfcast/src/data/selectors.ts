import { BAND_ORDER } from './types';
import type { BandHourPrediction, PathPrediction } from './types';

/**
 * Pure reads over a PathPrediction. These used to live beside the sample data;
 * now that predictions come from the server they belong on their own.
 */

const wrapHour = (hour: number) => ((hour % 24) + 24) % 24;

/**
 * Every band at one hour, in display order. A real run always fills all 24
 * hours, but a band can be missing if the server ever trims a slot, so this
 * returns only what is present rather than asserting.
 */
export function cellsForHour(
  p: PathPrediction,
  hour: number,
): BandHourPrediction[] {
  const h = wrapHour(hour);
  return BAND_ORDER.map((band) =>
    p.cells.find((c) => c.band === band && c.hour === h)
  ).filter((c): c is BandHourPrediction => c !== undefined);
}

export function cellFor(
  p: PathPrediction,
  band: BandKeyLike,
  hour: number,
): BandHourPrediction | undefined {
  const h = wrapHour(hour);
  return p.cells.find((c) => c.band === band && c.hour === h);
}

type BandKeyLike = BandHourPrediction['band'];

/** The band with the highest reliability at this hour. */
export function bestBandAt(
  p: PathPrediction,
  hour: number,
): BandHourPrediction | undefined {
  const rows = cellsForHour(p, hour);
  if (rows.length === 0) return undefined;
  return rows.reduce((
    best,
    c,
  ) => (c.reliability > best.reliability ? c : best));
}

/**
 * Maximum usable frequency for the hour. VOACAP reports this directly, so it
 * is read rather than inferred from which bands happen to be open.
 */
export function mufAt(p: PathPrediction, hour: number): number {
  return p.mufByHour[wrapHour(hour)] ?? 0;
}
