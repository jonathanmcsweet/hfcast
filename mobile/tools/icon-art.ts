/**
 * The app icon's geometry, in the 108 dp units Android adaptive icons use.
 *
 * This is the one place the shapes are described. `tools/build-icons.ts` draws
 * every PNG from it, and `test/icon.test.ts` rebuilds the path data of the
 * vector drawables in `design/android-icon/res/` from it and compares that with
 * the files on disk. The rasters and the vectors therefore cannot drift apart
 * without a test failing.
 *
 * A field of identical rounded cells on the product's violet ramp, with a
 * circular opening at the centre holding the antenna symbol: storm cells around
 * a station. The cells are the same square the forecast grid draws, and the
 * ramp is the same ramp, so the icon and the map say one thing.
 *
 * Two cuts of the field, because two places crop it differently. The compact
 * cut is what a launcher shows; the full-bleed cut runs off the canvas and is
 * for the store listing and iOS, which apply no mask.
 */

/** The adaptive icon canvas. */
export const CANVAS = 108;
/**
 * The part of the canvas a launcher keeps. Everything outside it is bleed that
 * exists so a mask of any shape has something to cut into.
 */
export const VIEWPORT = 72;
/**
 * The part every mask is guaranteed to show, as a radius from the centre.
 *
 * The compact field deliberately reaches past it: the outermost cells are cut
 * by a circular mask, and that reads as the field continuing beyond the icon
 * rather than as art that was lost. The symbol inside the opening is what has
 * to stay whole, and `test/icon.test.ts` holds it to that.
 */
export const SAFE_RADIUS = 33;

const CELL = 7;
const CELL_RADIUS = 1.8;
/** Centre-to-centre spacing. Every cell sits on this lattice. */
const PITCH = 8.5;
const CENTRE = CANVAS / 2;

/** A rounded rectangle: every cell, and the mast of the symbol. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r: number;
}

/** Behind the foreground layer. The app's own indigo. */
export const BACKGROUND = '#2A1656';

/** The symbol inside the opening, and the only thing that is not a cell. */
export const GLYPH = '#F3ECFF';

/**
 * The ramp, brightest first, with the opacity each rung carries in the themed
 * layer. That layer has no colour of its own — the system supplies it — so the
 * ramp has to survive as transparency or the field reads as one flat block.
 */
const RAMP = [
  { colour: '#C9B4F7', alpha: 1 },
  { colour: '#9B78E8', alpha: 0.72 },
  { colour: '#7C4BD0', alpha: 0.48 },
  { colour: '#4A2F7D', alpha: 0.26 },
] as const;

/**
 * One cell: its place on the lattice as whole steps from the centre, and which
 * rung of the ramp it takes.
 *
 * Written out rather than computed. The shade of a cell carries a noise term
 * that makes neighbours differ, which is what stops the field reading as a
 * gradient; a rule that reproduced it would be longer than the table and would
 * still have to be checked against the drawables cell by cell.
 */
type Place = readonly [col: number, row: number, rung: number];

/** The launcher cut: 28 cells, with seven sitting outside the main ring. */
const COMPACT: readonly Place[] = [
  [-2, -3, 1],
  [-1, -3, 1],
  [0, -3, 1],
  [2, -3, 1],
  [-3, -2, 1],
  [-2, -2, 0],
  [-1, -2, 0],
  [1, -2, 1],
  [2, -2, 1],
  [3, -2, 2],
  [-2, -1, 0],
  [2, -1, 1],
  [3, -1, 3],
  [3, 0, 3],
  [-3, 1, 2],
  [-2, 1, 1],
  [2, 1, 3],
  [3, 1, 2],
  [-2, 2, 1],
  [-1, 2, 1],
  [1, 2, 0],
  [2, 2, 2],
  [3, 2, 2],
  [-2, 3, 2],
  [-1, 3, 2],
  [0, 3, 1],
  [1, 3, 1],
  [2, 3, 1],
];

/**
 * The full-bleed cut: 70 cells, running off every edge.
 *
 * It never reaches the brightest rung. The opening removes the cells at the
 * core, which are the bright ones, so this cut sits on the lower three.
 */
const FULL: readonly Place[] = [
  [-2, -6, 3],
  [-3, -5, 3],
  [-2, -5, 3],
  [-1, -5, 3],
  [0, -5, 2],
  [1, -5, 2],
  [2, -5, 3],
  [3, -5, 3],
  [-4, -4, 3],
  [-3, -4, 2],
  [-2, -4, 2],
  [-1, -4, 1],
  [0, -4, 2],
  [1, -4, 2],
  [2, -4, 2],
  [3, -4, 2],
  [-4, -3, 2],
  [-3, -3, 2],
  [-2, -3, 2],
  [-1, -3, 2],
  [0, -3, 1],
  [1, -3, 2],
  [2, -3, 2],
  [3, -3, 2],
  [4, -3, 3],
  [-4, -2, 3],
  [-3, -2, 2],
  [-2, -2, 1],
  [2, -2, 1],
  [3, -2, 1],
  [4, -2, 3],
  [5, -2, 2],
  [-4, -1, 2],
  [-3, -1, 1],
  [3, -1, 2],
  [4, -1, 3],
  [-6, 0, 3],
  [-5, 0, 2],
  [-4, 0, 2],
  [-3, 0, 2],
  [3, 0, 2],
  [4, 0, 3],
  [5, 0, 2],
  [-5, 1, 2],
  [-4, 1, 2],
  [-3, 1, 2],
  [3, 1, 2],
  [4, 1, 2],
  [-5, 2, 3],
  [-4, 2, 2],
  [-3, 2, 1],
  [-2, 2, 1],
  [2, 2, 2],
  [3, 2, 2],
  [5, 2, 3],
  [-4, 3, 3],
  [-3, 3, 3],
  [-2, 3, 2],
  [-1, 3, 2],
  [0, 3, 3],
  [1, 3, 2],
  [2, 3, 2],
  [3, 3, 2],
  [-3, 4, 2],
  [-2, 4, 2],
  [-1, 4, 3],
  [5, 4, 3],
  [-3, 5, 3],
  [-1, 5, 3],
  [2, 5, 3],
];

export interface Cell {
  readonly rect: Rect;
  /** Its colour in the full-colour foreground layer. */
  readonly colour: string;
  /** Its opacity in the monochrome layer, where the colour is white. */
  readonly alpha: number;
}

const field = (places: readonly Place[]): readonly Cell[] =>
  places.map(([col, row, rung]) => {
    // The fallback is the darkest rung, which exists: `RAMP` is a fixed
    // non-empty tuple, so this is a rung however far the index reaches.
    const step = RAMP[rung] ?? RAMP[RAMP.length - 1] as (typeof RAMP)[number];
    return {
      rect: {
        x: CENTRE + col * PITCH - CELL / 2,
        y: CENTRE + row * PITCH - CELL / 2,
        w: CELL,
        h: CELL,
        r: CELL_RADIUS,
      },
      colour: step.colour,
      alpha: step.alpha,
    };
  });

/** The cells a launcher shows. */
export const CELLS: readonly Cell[] = field(COMPACT);
/** The cells the store listing and iOS show. */
export const STORE_CELLS: readonly Cell[] = field(FULL);

/**
 * The antenna symbol: a mast under an inverted triangle.
 *
 * Drawn sharp against the rounded cells — butt caps, mitre joins — so it reads
 * as an instrument rather than as one more cell. It is not centred on the
 * canvas: the triangle's mass sits above the stem, so a geometric centring
 * reads top-heavy and the whole symbol is shifted down.
 */
export interface Glyph {
  /** The stem, bottom to top, as the drawables write it. */
  readonly mast: {
    readonly x: number;
    readonly from: number;
    readonly to: number;
  };
  /** The triangle, clockwise from its top-left corner. */
  readonly triangle: readonly (readonly [number, number])[];
  readonly width: number;
}

/** The launcher and legacy cut, at 0.9 of the symbol's own scale. */
export const LAUNCHER_GLYPH: Glyph = {
  mast: { x: 54, from: 68, to: 58.1 },
  triangle: [[44.1, 49.1], [63.9, 49.1], [54, 58.1]],
  width: 2,
};

/**
 * The themed layer's cut of it. A heavier stroke, because a themed icon is
 * drawn in one colour on a background the app does not choose, and the symbol
 * has to hold at whatever contrast that gives.
 */
export const MONOCHROME_GLYPH: Glyph = { ...LAUNCHER_GLYPH, width: 2.3 };

/** The full-bleed cut, at the symbol's own scale. */
export const STORE_GLYPH: Glyph = {
  mast: { x: 54, from: 67.5, to: 56.5 },
  triangle: [[43, 46.5], [65, 46.5], [54, 56.5]],
  width: 2.2,
};

/**
 * Trims a computed coordinate to the shortest exact form.
 *
 * The coordinates are sums of decimals — 54 + 8.5 − 3.5 — which binary floating
 * point cannot always hold exactly. Without this a path reads
 * `34.200000000000003`, which Android accepts and a comparison with the file
 * does not.
 */
const n = (value: number): string => String(Number(value.toFixed(4)));

/**
 * The `android:pathData` for a rounded rectangle, in the form the drawables in
 * `design/android-icon/res/` use: four sides and four corner arcs, clockwise
 * from the top-left corner's end.
 */
export function roundedRectPath({ x, y, w, h, r }: Rect): string {
  const x2 = x + w;
  const y2 = y + h;
  const arc = `A${n(r)},${n(r)} 0 0 1 `;
  return `M${n(x + r)},${n(y)}`
    + `H${n(x2 - r)}${arc}${n(x2)},${n(y + r)}`
    + `V${n(y2 - r)}${arc}${n(x2 - r)},${n(y2)}`
    + `H${n(x + r)}${arc}${n(x)},${n(y2 - r)}`
    + `V${n(y + r)}${arc}${n(x + r)},${n(y)}Z`;
}

/** The `android:pathData` for the mast, and for the triangle after it. */
export const mastPath = ({ mast }: Glyph): string =>
  `M${n(mast.x)},${n(mast.from)}L${n(mast.x)},${n(mast.to)}`;

export const trianglePath = ({ triangle }: Glyph): string =>
  `${
    triangle.map(([x, y], at) => `${at === 0 ? 'M' : 'L'}${n(x)},${n(y)}`)
      .join('')
  }Z`;

/** The mast as the rectangle it is: a butt-capped line has square ends. */
export const mastRect = ({ mast, width }: Glyph): Rect => ({
  x: mast.x - width / 2,
  y: Math.min(mast.from, mast.to),
  w: width,
  h: Math.abs(mast.from - mast.to),
  r: 0,
});

/**
 * How far the furthest point of the symbol is from the centre of the canvas.
 *
 * The cells may run past the safe circle and are cut by the mask on purpose.
 * The symbol may not: it is the one part with a meaning that a slice would
 * destroy, and a launcher on somebody else's phone is where that would show up.
 */
export function furthestGlyph(glyph: Glyph): number {
  const centre = CANVAS / 2;
  const reach = (x: number, y: number): number =>
    Math.hypot(x - centre, y - centre) + glyph.width / 2;
  const rect = mastRect(glyph);
  return Math.max(
    ...glyph.triangle.map(([x, y]) => reach(x, y)),
    reach(rect.x, rect.y + rect.h),
    reach(rect.x + rect.w, rect.y + rect.h),
  );
}

/** How far the furthest cell corner is from the centre. */
export function furthestCell(cells: readonly Cell[]): number {
  const centre = CANVAS / 2;
  const reach = ({ x, y, w, h, r }: Rect): number => {
    // The outermost point of a rounded rectangle is its corner arc's centre
    // plus the radius, measured from the canvas centre.
    const cx = Math.max(Math.abs(x - centre), Math.abs(x + w - centre)) - r;
    const cy = Math.max(Math.abs(y - centre), Math.abs(y + h - centre)) - r;
    return Math.hypot(cx, cy) + r;
  };
  return Math.max(...cells.map((cell) => reach(cell.rect)));
}
