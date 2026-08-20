/**
 * What a saved band selection becomes when the app learns a new band.
 *
 * Apart from the store so `node --test` can read it. Getting the rule
 * wrong either computes maps nobody asked for or leaves a band out of
 * "every band", so it is stated once and tested.
 */
import { BAND_ORDER, type BandKey } from '../../../shared/bands.ts';

/**
 * The list as it stood before 60m, which persist version 8 and earlier
 * were saved against. Derived, not written out, so it cannot drift from
 * the real list.
 */
export const BANDS_BEFORE_60M: readonly BandKey[] = BAND_ORDER.filter(
  (band) => band !== '60m',
);

/**
 * "Every band" is a choice about the whole list, so it follows the list
 * when the list grows. Anything narrower is a choice about particular
 * bands and is left alone — adding to it would spend storage the reader
 * had capped on purpose.
 *
 * `before` is what the whole list was when the choice was saved. It has
 * to be passed in: comparing lengths instead was true for every
 * selection, since the count of saved bands that are still real is just
 * the count of saved bands.
 */
export function withNewBands(
  held: readonly BandKey[] | undefined,
  before: readonly BandKey[] = BANDS_BEFORE_60M,
): readonly BandKey[] {
  if (held === undefined) return BAND_ORDER;
  const tookEverything = before.every((band) => held.includes(band));
  return tookEverything ? BAND_ORDER : held;
}
