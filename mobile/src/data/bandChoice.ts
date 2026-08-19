/**
 * What a saved band selection becomes when the app learns a new band.
 *
 * Apart from the store so `node --test` can read it: the store reaches
 * AsyncStorage on import. This is a rule about what somebody meant, and
 * getting it wrong either computes maps nobody asked for or quietly
 * leaves a band out of "every band", so it is worth stating once and
 * testing.
 */
import { BAND_ORDER, type BandKey } from '../../../shared/bands.ts';

/**
 * The list as it stood before 60m, which persist version 8 and earlier
 * were saved against.
 *
 * Derived rather than written out, so it cannot drift from the real list
 * if a designation is ever spelled differently.
 */
export const BANDS_BEFORE_60M: readonly BandKey[] = BAND_ORDER.filter(
  (band) => band !== '60m',
);

/**
 * "Every band" is a choice about the whole list rather than about the
 * bands that happened to be in it, so it follows the list when the list
 * grows. Anything narrower is a choice about particular bands, and is
 * left exactly as it was — adding to a deliberate selection would spend
 * storage the reader had already decided to cap.
 *
 * `before` is what the whole list was when the choice was saved, and it
 * has to be passed in: without it there is no way to tell a reader who
 * took everything from one who happened to tick the same number of
 * boxes. A first attempt compared lengths and was wrong for every
 * selection, because the count of saved bands that are still real is
 * just the count of saved bands.
 */
export function withNewBands(
  held: readonly BandKey[] | undefined,
  before: readonly BandKey[] = BANDS_BEFORE_60M,
): readonly BandKey[] {
  if (held === undefined) return BAND_ORDER;
  const tookEverything = before.every((band) => held.includes(band));
  return tookEverything ? BAND_ORDER : held;
}
