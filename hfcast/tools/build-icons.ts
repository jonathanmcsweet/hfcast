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
  CELLS,
  MARKER,
  MARKER_COLOUR,
  MARKER_STROKE,
  VIEWPORT,
} from './icon-art.ts';
import {
  encodePng,
  fill,
  flatten,
  type Frame,
  paste,
  render,
  rgb,
  type Shape,
} from './icon-raster.ts';

const DESIGN = 'design/android-icon/png';
const ASSETS = 'src/assets';

const WHITE = rgb('#FFFFFF');
const INDIGO = rgb(BACKGROUND);

/** The full-colour layer: the ramp, then the amber marker over it. */
const FOREGROUND: readonly Shape[] = [
  ...CELLS.map((cell) => ({
    rect: cell.rect,
    fill: { colour: rgb(cell.colour), alpha: 1 },
  })),
  {
    rect: MARKER,
    stroke: { colour: rgb(MARKER_COLOUR), alpha: 1, width: MARKER_STROKE },
  },
];

/** The themed-icon layer: white throughout, the ramp carried by alpha. */
const MONOCHROME: readonly Shape[] = [
  ...CELLS.map((cell) => ({
    rect: cell.rect,
    fill: { colour: WHITE, alpha: cell.alpha },
  })),
  {
    rect: MARKER,
    stroke: { colour: WHITE, alpha: 1, width: MARKER_STROKE },
  },
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

console.log('adaptive icon layers, 108 dp at 4x');
square(`${DESIGN}/icon-foreground.png`, 432, layer(432, FOREGROUND));
square(`${DESIGN}/icon-monochrome.png`, 432, layer(432, MONOCHROME));
square(`${DESIGN}/icon-background.png`, 432, fill(432, 432, INDIGO));

console.log('store and platform icons');
// Opaque and unrounded, both of them: Google rounds the Play listing itself,
// and iOS applies its own corner. Pre-rounding either gets rounded twice.
square(
  `${DESIGN}/play-store-512.png`,
  512,
  flatten(launcher(512, 'none'), INDIGO),
);
// iOS crops nothing, so mapping the whole 108 dp canvas would leave the art at
// 61% of the icon where Android shows it at 92%. Framing 90 dp instead puts it
// at 73%, which is the usual weight for a home screen icon there.
square(
  `${DESIGN}/ios-1024.png`,
  1024,
  flatten(
    render(FOREGROUND, {
      size: 1024,
      viewport: 90,
      background: { colour: INDIGO, alpha: 1 },
    }),
    INDIGO,
  ),
);

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
// `icon` is the square one, used for iOS and the web favicon.
square(
  `${ASSETS}/icon.png`,
  1024,
  flatten(
    render(FOREGROUND, {
      size: 1024,
      viewport: 90,
      background: { colour: INDIGO, alpha: 1 },
    }),
    INDIGO,
  ),
);

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
