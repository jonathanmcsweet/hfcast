import type { BandHourPrediction, PathPrediction } from './types';

/**
 * Pure reads over a PathPrediction. These used to live beside the sample data;
 * now that predictions come from the server they belong on their own.
 */

const wrapHour = (hour: number) => ((hour % 24) + 24) % 24;

const cellKey = (band: BandKeyLike, hour: number) => `${band}:${hour}`;

/**
 * One cell, found by scanning.
 *
 * For a caller that wants one cell, which is most of them. A screen that
 * wants the whole grid builds an index with `cellsByBandHour` instead:
 * this is a linear scan, and the heat map asked for all 216 cells of a
 * 216-row list on every render.
 */
export function cellFor(
  p: PathPrediction,
  band: BandKeyLike,
  hour: number,
): BandHourPrediction | undefined {
  const h = wrapHour(hour);
  return p.cells.find((c) => c.band === band && c.hour === h);
}

/**
 * Every cell, by band and hour.
 *
 * Built once per prediction and read 216 times by the heat map. Memoise
 * it against the prediction — a new prediction is a new object, and
 * nothing changes the cells of one that already exists.
 */
export function cellsByBandHour(
  p: PathPrediction,
): ReadonlyMap<string, BandHourPrediction> {
  return new Map(p.cells.map((c) => [cellKey(c.band, c.hour), c]));
}

/** One cell out of an index from `cellsByBandHour`. */
export function cellAt(
  cells: ReadonlyMap<string, BandHourPrediction>,
  band: BandKeyLike,
  hour: number,
): BandHourPrediction | undefined {
  return cells.get(cellKey(band, wrapHour(hour)));
}

type BandKeyLike = BandHourPrediction['band'];

/**
 * Maximum usable frequency for the hour. VOACAP reports this directly, so it
 * is read rather than inferred from which bands happen to be open.
 */
export function mufAt(p: PathPrediction, hour: number): number {
  return p.mufByHour[wrapHour(hour)] ?? 0;
}
