/**
 * The app icon's geometry, in the 108 dp units Android adaptive icons use.
 *
 * This is the one place the shapes are described. `tools/build-icons.ts` draws
 * every PNG from it, and `test/icon.test.ts` rebuilds the path data of the
 * vector drawables in `design/android-icon/res/` from it and compares that with
 * the files on disk. The rasters and the vectors therefore cannot drift apart
 * without a test failing.
 *
 * Nine cells on a grid, and nothing else: the band grid the app draws. The
 * amber the app uses for the selected hour is deliberately not here, so that
 * colour keeps one meaning — the hour you are looking at.
 */

/** The adaptive icon canvas. */
export const CANVAS = 108;
/**
 * The part of the canvas a launcher keeps. Everything outside it is bleed that
 * exists so a mask of any shape has something to cut into.
 */
export const VIEWPORT = 72;
/**
 * The part every mask is guaranteed to show, as a radius from the centre. Art
 * outside this can be cut off by a launcher and no art here is.
 */
export const SAFE_RADIUS = 33;

const CELL = 12;
const CELL_RADIUS = 3.2;
const PITCH = 17;
/** Left and top edge of the first cell, which centres the 46 dp grid. */
const ORIGIN = 31;

/** A rounded rectangle, the only shape in the icon. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r: number;
}

/** Behind the foreground layer. The app's own indigo. */
export const BACKGROUND = '#2A1656';

/**
 * The ramp runs along the anti-diagonal: a cell's colour is fixed by its row
 * plus its column, so the grid darkens from top-left to bottom-right.
 */
const RAMP = [
  '#C9B4F7',
  '#C9B4F7',
  '#9B78E8',
  '#7C4BD0',
  '#4A2F7D',
] as const;

/**
 * The same ramp expressed as opacity, for the Android 13 themed icon. That
 * layer carries alpha only — the system supplies the colour — so the ramp has
 * to survive as transparency or the grid reads as one flat block.
 */
const MONOCHROME = [1, 1, 0.62, 0.4, 0.24] as const;

export interface Cell {
  readonly rect: Rect;
  /** Its colour in the full-colour foreground layer. */
  readonly colour: string;
  /** Its opacity in the monochrome layer, where the colour is white. */
  readonly alpha: number;
}

const ROWS = [0, 1, 2] as const;

export const CELLS: readonly Cell[] = ROWS.flatMap((row) =>
  ROWS.map((col) => ({
    rect: {
      x: ORIGIN + col * PITCH,
      y: ORIGIN + row * PITCH,
      w: CELL,
      h: CELL,
      r: CELL_RADIUS,
    },
    colour: RAMP[row + col] ?? RAMP[RAMP.length - 1],
    alpha: MONOCHROME[row + col] ?? 0,
  }))
);

/**
 * Trims a computed coordinate to the shortest exact form.
 *
 * The coordinates are sums of decimals — 31 + 3.2 — which binary floating point
 * cannot always hold exactly. Without this a path reads `34.200000000000003`,
 * which Android accepts and a comparison with the file does not.
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

/**
 * How far the furthest point of any art is from the centre of the canvas.
 *
 * Checked rather than asserted in a comment: the safe radius is the one
 * constraint that, if broken, shows up as art sliced off by a launcher on
 * somebody else's phone rather than in any build here.
 */
export function furthestArt(): number {
  const centre = CANVAS / 2;
  const reach = ({ x, y, w, h, r }: Rect): number => {
    // The outermost point of a rounded rectangle is its corner arc's centre
    // plus the radius, measured from the canvas centre.
    const cx = Math.max(Math.abs(x - centre), Math.abs(x + w - centre)) - r;
    const cy = Math.max(Math.abs(y - centre), Math.abs(y + h - centre)) - r;
    return Math.hypot(cx, cy) + r;
  };
  return Math.max(...CELLS.map((cell) => reach(cell.rect)));
}
