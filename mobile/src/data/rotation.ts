/**
 * Whether this device is big enough to be used on its side.
 *
 * The manifest holds the app portrait, which is right for a telephone and
 * was wrong for a tablet: `orientation: "portrait"` came from the Expo
 * template and was never a decision, so a tablet could not turn at all
 * (user, 2026-08-22). The layout has wanted to for a while, since dialogs
 * become cards past `COMPACT_WIDTH` and the map has a cap for the wide
 * arrangement.
 *
 * The smallest of the two sides, not the current width, because that is a
 * property of the hardware rather than of how the device is being held. A
 * telephone turned on its side is wider than 600 points and is still a
 * telephone.
 *
 * 600 is Android's own tablet line, `sw600dp`, and the same number
 * `ModalFrame` uses to decide between a card and a full screen, so one
 * device gets one answer from both.
 *
 * Android's manifest cannot make this decision itself. A resource under
 * `values-sw600dp/` is the obvious way to write it and lint rejects it,
 * "resources referenced from the manifest cannot vary by configuration",
 * which is why the app asks at run time instead (2026-08-22).
 */
export const TABLET_WIDTH = 600;

export const isTablet = (width: number, height: number): boolean =>
  Math.min(width, height) >= TABLET_WIDTH;

/**
 * Width in points past which the answer sits beside the map.
 *
 * `TABLET_WIDTH` asks what the device is; this asks how it is being held,
 * so it reads the current width rather than the smallest side. A ten inch
 * tablet is about 800 points across upright and about 1280 on its side,
 * and only the second has room for two columns.
 *
 * The number sits above 800 for that reason. Upright there is height to
 * spare and stacking reads better, and a split at 800 would fire the
 * moment a tablet was stood up. Above the line the map keeps its own
 * column and the answer, the sentences and the clock take the other,
 * which is what `MapSlot`'s cap was working around: on a 1280x800 tablet
 * the whole answer has to fit one screen, and stacked, the map was the
 * only part that could give.
 */
export const WIDE_WIDTH = 900;

export const isWideLayout = (width: number): boolean => width >= WIDE_WIDTH;

/**
 * Room the rest of the screen needs when the answer sits beside the map.
 *
 * The header, the radio row and the band chips come to about 195 points,
 * and under the map sit the detail line and the legend. 300 covers both
 * with a little to spare, so the card lands inside one screen rather than
 * pushing the clock under the fold.
 */
const WIDE_CHROME = 300;

/**
 * The smallest the map may be shrunk to before it stops being worth
 * splitting for. A short screen gets this and scrolls a little rather
 * than a map too small to read a shape from.
 */
const WIDE_MAP_FLOOR = 320;

/**
 * How big the map may be once it has a column of its own.
 *
 * Height binds, not width. The split exists because a tablet on its side
 * is short, so a map sized from the width alone would put the clock back
 * under the fold and undo the reason for it. The width still caps it, at
 * a little under half, so the answer keeps the larger share on a very
 * wide screen.
 */
export const wideMapSize = (width: number, height: number): number =>
  Math.max(
    WIDE_MAP_FLOOR,
    Math.min(Math.round(width * 0.42), height - WIDE_CHROME),
  );
