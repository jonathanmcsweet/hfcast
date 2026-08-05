/**
 * The rolling timeline: 24 hours that start at "now" and run forward.
 *
 * Every module shows hours as absolute UTC values, 0..23, and the
 * prediction is climatology keyed on that hour — so the timeline does
 * not change what an hour means, only the order the hours are offered
 * in. An anchor names the hour the window starts at, and everything
 * here is the arithmetic between an hour and its place on the track.
 *
 * The hour after 23 is 0. That is a wrap, not a new day of data: the
 * forecast for tomorrow 03:00 is this month's climatology for 03:00,
 * the same answer as today's.
 */

/** The 24 hours from `anchor` forward, in track order. */
export const hoursFrom = (anchor: number): number[] =>
  Array.from({ length: 24 }, (_, i) => (anchor + i) % 24);

/** Where `hour` sits on a track anchored at `anchor`: 0..23 from the left. */
export const offsetOf = (hour: number, anchor: number): number =>
  (hour - anchor + 24) % 24;

/** The hour at track position `offset`, the inverse of `offsetOf`. */
export const hourAt = (offset: number, anchor: number): number =>
  (anchor + offset) % 24;
