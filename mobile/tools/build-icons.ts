/**
 * Draws every icon PNG from the geometry in `icon-art.ts`.
 *
 * Run by hand when the icon changes:
 *
 *     node --experimental-strip-types tools/build-icons.ts
 *
 * The vector drawables in `design/android-icon/res/` are the design of record.
 * They are what an Android 8 or newer launcher would draw given a checked-in
 * `android/` folder — which this project does not have, because `expo prebuild`
 * rewrites that folder on every build. So the app ships the raster route
 * instead, and these PNGs have to say the same thing the vectors do.
 * `test/icon.test.ts` is what holds them to it.
 *
 * Output lands in two places. `design/android-icon/png/` is the full set,
 * including the store and legacy files nothing here consumes; `src/assets/`
 * gets the three `app.json` actually points at.
 */
import { writeFileSync } from 'node:fs';

import {
  BACKGROUND,
  CANVAS,
  type Cell,
  CELLS,
  GLYPH,
  type Glyph,
  LAUNCHER_GLYPH,
  mastRect,
  MONOCHROME_GLYPH,
  STORE_CELLS,
  STORE_GLYPH,
  VIEWPORT,
} from './icon-art.ts';
import {
  convexPolygon,
  encodePng,
  fill,
  flatten,
  type Frame,
  paste,
  render,
  rgb,
  roundedRect,
  type Shape,
} from './icon-raster.ts';

const DESIGN = 'design/android-icon/png';
const ASSETS = 'src/assets';

const WHITE = rgb('#FFFFFF');
const INDIGO = rgb(BACKGROUND);
const INK = rgb(GLYPH);

/** The field in full colour, and the same field carried by alpha alone. */
const colourField = (cells: readonly Cell[]): readonly Shape[] =>
  cells.map((cell) => ({
    form: roundedRect(cell.rect),
    fill: { colour: rgb(cell.colour), alpha: 1 },
  }));

const alphaField = (cells: readonly Cell[]): readonly Shape[] =>
  cells.map((cell) => ({
    form: roundedRect(cell.rect),
    fill: { colour: WHITE, alpha: cell.alpha },
  }));

/**
 * The symbol: a filled bar for the mast, because a butt-capped line is a
 * rectangle, and a stroked triangle over it.
 */
const symbol = (glyph: Glyph, colour = INK): readonly Shape[] => [
  { form: roundedRect(mastRect(glyph)), fill: { colour, alpha: 1 } },
  {
    form: convexPolygon(glyph.triangle),
    stroke: { colour, alpha: 1, width: glyph.width },
  },
];

/** The launcher cut, in colour and as the themed layer draws it. */
const FOREGROUND: readonly Shape[] = [
  ...colourField(CELLS),
  ...symbol(LAUNCHER_GLYPH),
];
const MONOCHROME: readonly Shape[] = [
  ...alphaField(CELLS),
  ...symbol(MONOCHROME_GLYPH, WHITE),
];
/** The full-bleed cut, which runs off every edge of the canvas. */
const STORE: readonly Shape[] = [
  ...colourField(STORE_CELLS),
  ...symbol(STORE_GLYPH),
];

const write = (
  path: string,
  width: number,
  height: number,
  rgba: Uint8Array,
): void => {
  writeFileSync(path, encodePng(width, height, rgba));
  console.log(`  ${path}`);
};

const square = (path: string, size: number, rgba: Uint8Array): void =>
  write(path, size, size, rgba);

/** The whole 108 dp layer, bleed included, as Expo's adaptive icon wants it. */
const layer = (size: number, shapes: readonly Shape[]): Uint8Array =>
  render(shapes, { size, viewport: CANVAS });

/**
 * What a launcher shows: the middle 72 dp, over the background, cut to shape.
 */
const launcher = (size: number, mask: Frame['mask']): Uint8Array =>
  render(FOREGROUND, {
    size,
    viewport: VIEWPORT,
    background: { colour: INDIGO, alpha: 1 },
    mask,
  });

/**
 * The store cut: the whole canvas, opaque, unmasked. The field is drawn past
 * every edge, so nothing here is framed — it is cropped, which is the point.
 */
const store = (size: number): Uint8Array =>
  flatten(
    render(STORE, {
      size,
      viewport: CANVAS,
      background: { colour: INDIGO, alpha: 1 },
    }),
    INDIGO,
  );

console.log('adaptive icon layers, 108 dp at 4x');
square(`${DESIGN}/icon-foreground.png`, 432, layer(432, FOREGROUND));
square(`${DESIGN}/icon-monochrome.png`, 432, layer(432, MONOCHROME));
square(`${DESIGN}/icon-background.png`, 432, fill(432, 432, INDIGO));

console.log('store and platform icons');
// Opaque and unrounded, both of them: Google rounds the Play listing itself,
// and iOS applies its own corner. Pre-rounding either gets rounded twice.
square(`${DESIGN}/play-store-512.png`, 512, store(512));
square(`${DESIGN}/ios-1024.png`, 1024, store(1024));

console.log('legacy rasters for API 25 and below');
const DENSITIES = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
] as const;

for (const { dir, size } of DENSITIES) {
  // Pre-masked on purpose: a launcher this old applies no mask of its own, so
  // an unmasked square would sit among rounded icons looking wrong.
  square(`${DESIGN}/${dir}/ic_launcher.png`, size, launcher(size, 'squircle'));
  square(
    `${DESIGN}/${dir}/ic_launcher_round.png`,
    size,
    launcher(size, 'circle'),
  );
}

console.log('what app.json points at');
square(`${ASSETS}/icon-foreground.png`, 432, layer(432, FOREGROUND));
square(`${ASSETS}/icon-monochrome.png`, 432, layer(432, MONOCHROME));
// `icon` is the square one, used for iOS and the web favicon. The store cut,
// because neither of those crops to a launcher's mask.
square(`${ASSETS}/icon.png`, 1024, store(1024));

/**
 * A sheet for checking small-size legibility by eye: every size a launcher asks
 * for, under both masks, on a light and a dark background.
 */
console.log('preview sheet');
const SHEET_SIZES = [192, 144, 96, 72, 48, 24] as const;
const GAP = 20;
const MARGIN = 24;
const HALF = 720;
const SHEET_W = HALF * 2;
const SHEET_H = MARGIN * 3 + 192 * 2;

const sheet = fill(SHEET_W, SHEET_H, rgb('#F2F3F7'));
// The dark half, painted over the light fill rather than rendered separately.
const dark = rgb('#0B0D14');
for (let y = 0; y < SHEET_H; y++) {
  for (let x = HALF; x < SHEET_W; x++) {
    const i = (y * SHEET_W + x) * 4;
    sheet[i] = dark[0];
    sheet[i + 1] = dark[1];
    sheet[i + 2] = dark[2];
  }
}

const rowWidth = SHEET_SIZES.reduce((total, size) => total + size, 0)
  + GAP * (SHEET_SIZES.length - 1);
const inset = (HALF - rowWidth) / 2;

for (const [row, mask] of (['squircle', 'circle'] as const).entries()) {
  const bottom = MARGIN + 192 + row * (MARGIN + 192);
  const drawn = SHEET_SIZES.map((size) => ({
    size,
    pixels: launcher(size, mask),
  }));
  for (const half of [0, HALF]) {
    // Placed left to right, each icon starting where the last one ended, so
    // the running offset has to carry between iterations.
    let x = half + inset;
    for (const { size, pixels } of drawn) {
      paste(sheet, SHEET_W, pixels, size, Math.round(x), bottom - size);
      x += size + GAP;
    }
  }
}

write('design/android-icon/preview-sheet.png', SHEET_W, SHEET_H, sheet);
