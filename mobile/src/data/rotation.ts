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
