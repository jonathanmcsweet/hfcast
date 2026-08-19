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
 * How wide one band sits, and how far apart two of them are.
 *
 * Fixed rather than measured, because the snap has to know the stride
 * before anything is drawn. Wide enough for `160m`, which is the longest
 * designation, at the strong body face.
 */
export const CHIP_WIDTH = 64;
export const CHIP_GAP = 8;
export const STRIDE = CHIP_WIDTH + CHIP_GAP;

/** How wide the whole list is, laid out once. */
export const COPY_WIDTH = LEN * STRIDE;

/**
 * The widest the strip may be drawn.
 *
 * The strip is endless because the list is repeated, and that only reads
 * as endless while no band is on screen twice. A phone shows about five
 * chips and cannot break it; a browser window at 960 px showed 160m,
 * 10m, 12m, 15m, 17m and 20m twice over, which reads as a list that has
 * gone wrong rather than one that has no ends (user, 2026-08-18).
 *
 * Two chips of the same band sit `COPY_WIDTH` apart, so both are on
 * screen together only where the viewport is wider than that gap less
 * one chip. Staying a whole stride under it leaves room to spare and
 * keeps the number a multiple of the stride, which is what the snap
 * counts in. Wider screens get the strip centred rather than stretched:
 * there is nothing useful to put in the extra space, and the frame that
 * marks the selection has to stay in the middle of the strip.
 */
export const MAX_STRIP_WIDTH = COPY_WIDTH - STRIDE;

/**
 * Whether a strip this wide can show one band twice.
 *
 * The rule `MAX_STRIP_WIDTH` exists to satisfy, written out so a test
 * can check it rather than a reader having to trust the arithmetic.
 */
export const showsTwice = (width: number): boolean =>
  width > COPY_WIDTH - CHIP_WIDTH;

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
 * settles, and rather than fifty because every copy is another `LEN`
 * views to build on a device this app is meant to be gentle to.
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
 * the distance: 160m is last and 10m is first, and they are neighbours
 * under the frame, so this answers 1 rather than one less than the whole
 * list.
 *
 * Adding the answer to `from` and wrapping always lands on `to`, which is
 * the property the strip relies on.
 */
export function stepsTo(from: number, to: number): number {
  const half = Math.floor(LEN / 2);
  return wrap(to - from + half, LEN) - half;
}
