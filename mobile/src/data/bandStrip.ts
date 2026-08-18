/**
 * The arithmetic behind the band strip.
 *
 * Kept apart from `BandSelector.tsx` for the reason `globeName.ts` is kept
 * apart from the store: none of it touches React, a theme or a screen, so
 * `node --test` runs it. What it decides is how far the strip travels,
 * which is a thing no test can see once it is inside a component, and a
 * thing a reader notices at once when it is wrong.
 */
import { BAND_ORDER } from '../../../shared/bands.ts';

/** How many bands the strip holds. */
export const LEN = BAND_ORDER.length;

/**
 * How many times the band list is laid out end to end.
 *
 * This is what makes the strip endless. There is no such thing as an
 * infinite scroll view, so the list is repeated and the position is moved
 * back to the middle copy whenever it comes to rest. The jump is
 * invisible because every copy is identical: the band in the middle and
 * both of its neighbours are the same before and after, so there is
 * nothing on screen that could change.
 *
 * Five rather than three so a hard fling cannot leave the strip before it
 * settles, and rather than fifty because every copy is nine more views to
 * build on a device this app is meant to be gentle to.
 */
export const COPIES = 5;
export const MIDDLE = Math.floor(COPIES / 2);

/** Positive remainder. `%` alone gives a negative one for a negative left. */
export const wrap = (n: number, m: number): number => ((n % m) + m) % m;

/** Which band of the list a position has come to, whatever copy it is in. */
export const bandOf = (steps: number): number => wrap(steps, LEN);

/** How many strides from the start of the strip to `band` in the middle copy. */
export const stridesTo = (band: number): number => MIDDLE * LEN + band;

/**
 * How many places from one band to another, the short way round.
 *
 * Negative is to the left. On a strip with no ends the list order is not
 * the distance: 160m is the last of the nine and 10m is the first, and
 * they are neighbours under the frame, so this answers 1 rather than -8.
 *
 * Adding the answer to `from` and wrapping always lands on `to`, which is
 * the property the strip relies on.
 */
export function stepsTo(from: number, to: number): number {
  const half = Math.floor(LEN / 2);
  return wrap(to - from + half, LEN) - half;
}
