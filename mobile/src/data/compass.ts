/**
 * The geometry of a compass rose, apart from the drawing of one.
 *
 * Here rather than in the component because nothing in this project can
 * look at a rendered screen: a sign error that put east on the left would
 * pass a type check, a lint and a bundle, and only be caught by somebody
 * holding the phone. As plain functions the placement can be asserted.
 *
 * One fixed frame, 100 by 100, scaled by the SVG viewBox. Bearings are
 * degrees true: 0 is up the screen and they increase clockwise, which is
 * the opposite turn to the usual mathematical convention and the reason
 * the y term is subtracted.
 */
// Named with its extension so node's test runner resolves it as well as
// Metro does; `allowImportingTsExtensions` is already on for this reason.
import { BEST_WITHIN_DEG } from './orientation.ts';

export const CENTRE = 50;
export const RING = 38;

/**
 * Half the width of a shaded lobe, degrees. Not a modelled beamwidth —
 * the app holds no copy of the antenna pattern, and a second model could
 * disagree with the engine.
 *
 * It is the boundary the wording uses, taken from there rather than set to
 * match it. Drawn a couple of degrees wider, as it first was, the picture
 * shaded directions the sentence beneath called off to one side.
 */
export const LOBE_HALF_WIDTH = BEST_WITHIN_DEG;

export interface Point {
  x: number;
  y: number;
}

/** Where a bearing lands at radius `r` from the centre. */
export const point = (deg: number, r: number): Point => ({
  x: CENTRE + r * Math.sin((deg * Math.PI) / 180),
  y: CENTRE - r * Math.cos((deg * Math.PI) / 180),
});

const round = (value: number) => value.toFixed(2);

/**
 * A pie slice centred on `deg`, as an SVG path.
 *
 * The arc is always drawn the short way and clockwise, which holds while
 * the slice is under half the circle; at 64 degrees wide it is far from
 * that.
 */
export function wedge(deg: number, r: number): string {
  const from = point(deg - LOBE_HALF_WIDTH, r);
  const to = point(deg + LOBE_HALF_WIDTH, r);
  return [
    `M ${CENTRE} ${CENTRE}`,
    `L ${round(from.x)} ${round(from.y)}`,
    `A ${r} ${r} 0 0 1 ${round(to.x)} ${round(to.y)}`,
    'Z',
  ].join(' ');
}

/** Every 30 degrees. The four cardinals are drawn longer. */
export const TICKS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

/** The four points, with the translation key for each letter. */
export const CARDINALS = [
  { deg: 0, key: 'n' },
  { deg: 90, key: 'e' },
  { deg: 180, key: 's' },
  { deg: 270, key: 'w' },
] as const;
