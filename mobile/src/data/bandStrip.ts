/**
 * The arithmetic behind the band strip.
 *
 * Apart from `BandSelector.tsx` because none of it touches React, so
 * `node --test` runs it. How far the strip travels is invisible to a
 * test once it is inside a component, and obvious to a reader when wrong.
 */
import { BAND_ORDER } from '../../../shared/bands.ts';

/** How many bands the strip holds. */
export const LEN = BAND_ORDER.length;

/**
 * How wide one band sits, and how far apart two of them are.
 *
 * Fixed, not measured: the snap needs the stride before anything is
 * drawn. Wide enough for `160m` at the strong body face.
 */
export const CHIP_WIDTH = 64;
export const CHIP_GAP = 8;
export const STRIDE = CHIP_WIDTH + CHIP_GAP;

/** How wide the whole list is, laid out once. */
export const COPY_WIDTH = LEN * STRIDE;

/**
 * The widest the strip may be drawn.
 *
 * Endless only reads as endless while no band is on screen twice. A phone
 * cannot break that; a browser window at 960 px showed 160m, 10m, 12m,
 * 15m, 17m and 20m twice over (user, 2026-08-18).
 *
 * Two chips of the same band sit `COPY_WIDTH` apart, so both fit only
 * past that gap less one chip. A whole stride under leaves room to spare
 * and keeps the cap a multiple of the stride, which the snap counts in.
 * Wider screens centre the strip: the frame has to stay in its middle.
 */
export const MAX_STRIP_WIDTH = COPY_WIDTH - STRIDE;

/**
 * Whether a strip this wide can show one band twice. The rule
 * `MAX_STRIP_WIDTH` satisfies, written out so a test can check it.
 */
export const showsTwice = (width: number): boolean =>
  width > COPY_WIDTH - CHIP_WIDTH;

/**
 * How many times the band list is laid out end to end.
 *
 * What makes the strip endless: there is no infinite scroll view, so the
 * list repeats and the position returns to the middle copy at rest. The
 * jump shows the same band with the same neighbours, so nothing changes
 * on screen.
 *
 * Five rather than three so a hard fling cannot run off the end, rather
 * than fifty because every copy is another `LEN` views to build.
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
 * Negative is to the left. List order is not distance on a strip with no
 * ends: 160m is last and 10m is first, and they are neighbours under the
 * frame, so this answers 1.
 *
 * Adding the answer to `from` and wrapping always lands on `to`, which is
 * what the strip relies on.
 */
export function stepsTo(from: number, to: number): number {
  const half = Math.floor(LEN / 2);
  return wrap(to - from + half, LEN) - half;
}
