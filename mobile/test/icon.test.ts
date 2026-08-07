import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';

import {
  BACKGROUND,
  CANVAS,
  type Cell,
  CELLS,
  furthestCell,
  furthestGlyph,
  GLYPH,
  type Glyph,
  LAUNCHER_GLYPH,
  mastPath,
  MONOCHROME_GLYPH,
  roundedRectPath,
  SAFE_RADIUS,
  STORE_CELLS,
  STORE_GLYPH,
  trianglePath,
} from '../tools/icon-art.ts';

/**
 * The app icon, from two directions.
 *
 * The vector drawables in `design/android-icon/res/` are the design of record
 * and the PNGs are generated, so the first half of this file checks that the
 * geometry the generator uses still describes those drawables. The second half
 * checks the PNGs themselves, because both sets of art that have arrived from
 * outside this repository were files that looked like PNGs to everything
 * except a decoder.
 */

const root = path.join(import.meta.dirname, '..');
const design = path.join(root, 'design/android-icon');

const read = (file: string): string =>
  readFileSync(path.join(design, file), 'utf8');

const attributes = (xml: string, name: string): readonly string[] =>
  [...xml.matchAll(new RegExp(`android:${name}="([^"]*)"`, 'g'))]
    .map((match) => match[1] ?? '');

/** The cell paths of a layer: everything the symbol did not draw. */
const cellPaths = (cells: readonly Cell[]): readonly string[] =>
  cells.map((cell) => roundedRectPath(cell.rect));

/** The symbol's two paths, in the order the drawables write them. */
const glyphPaths = (glyph: Glyph): readonly string[] => [
  mastPath(glyph),
  trianglePath(glyph),
];

describe('the vector drawables and the generator agree', () => {
  const foreground = read('res/drawable/ic_launcher_foreground.xml');
  const monochrome = read('res/drawable/ic_launcher_monochrome.xml');
  const store = read('res/drawable/ic_store_foreground.xml');

  it('draws the launcher field, cell for cell', () => {
    assert.deepEqual(
      attributes(foreground, 'pathData'),
      [...cellPaths(CELLS), ...glyphPaths(LAUNCHER_GLYPH)],
    );
  });

  it('draws the same field in the themed layer', () => {
    assert.deepEqual(
      attributes(monochrome, 'pathData'),
      [...cellPaths(CELLS), ...glyphPaths(MONOCHROME_GLYPH)],
    );
  });

  it('draws the full-bleed field for the store and iOS', () => {
    assert.deepEqual(
      attributes(store, 'pathData'),
      [...cellPaths(STORE_CELLS), ...glyphPaths(STORE_GLYPH)],
    );
  });

  it('uses the same ramp colours, in the same order', () => {
    assert.deepEqual(
      attributes(foreground, 'fillColor'),
      CELLS.map((cell) => cell.colour),
    );
    assert.deepEqual(
      attributes(store, 'fillColor'),
      STORE_CELLS.map((cell) => cell.colour),
    );
  });

  it('carries the ramp as alpha in the themed layer', () => {
    assert.deepEqual(
      attributes(monochrome, 'fillAlpha').map(Number),
      CELLS.map((cell) => cell.alpha),
    );
  });

  it('strokes the symbol, and nothing else', () => {
    // The field is filled and the symbol is stroked. A stroke appearing on a
    // cell, or a fill on the symbol, means the two descriptions have been
    // changed apart — and the raster route draws them as two different kinds
    // of shape, so the PNGs would stop matching the vectors.
    for (
      const [name, xml, glyph] of [
        ['colour', foreground, LAUNCHER_GLYPH],
        ['themed', monochrome, MONOCHROME_GLYPH],
        ['store', store, STORE_GLYPH],
      ] as const
    ) {
      assert.deepEqual(
        attributes(xml, 'strokeWidth').map(Number),
        [glyph.width, glyph.width],
        `${name} layer`,
      );
      // Butt caps and mitre joins are what make the symbol read as an
      // instrument against the rounded cells, and the renderer draws the
      // triangle as a mitred polygon on the strength of it.
      assert.deepEqual(
        new Set(attributes(xml, 'strokeLineJoin')),
        new Set(['miter']),
        `${name} layer`,
      );
      assert.deepEqual(
        new Set(attributes(xml, 'strokeLineCap')),
        new Set(['butt']),
        `${name} layer`,
      );
    }
    assert.deepEqual(
      new Set(attributes(foreground, 'strokeColor')),
      new Set([
        GLYPH,
      ]),
    );
  });

  it('names one background colour', () => {
    // The colour resource is what an adaptive icon reads; `app.json` is what
    // Expo writes into the build. Two places, one colour.
    const colour = read('res/values/ic_launcher_background.xml');
    assert.match(colour, new RegExp(`>${BACKGROUND}</color>`));
    const config = JSON.parse(
      readFileSync(path.join(root, 'app.json'), 'utf8'),
    ) as {
      expo: { android: { adaptiveIcon: { backgroundColor: string; }; }; };
    };
    assert.equal(config.expo.android.adaptiveIcon.backgroundColor, BACKGROUND);
  });
});

describe('the constraints a launcher enforces', () => {
  it('keeps the symbol inside the safe circle', () => {
    // The cells may run past it and be cut — that is what makes the field
    // read as continuing past the icon. The symbol is the part with a meaning
    // that a slice would destroy.
    for (const glyph of [LAUNCHER_GLYPH, MONOCHROME_GLYPH]) {
      const reach = furthestGlyph(glyph);
      assert.ok(reach <= SAFE_RADIUS, `${reach} dp from centre`);
    }
  });

  it('cuts no cell in half', () => {
    // A cell whose centre is outside the safe circle can lose more than half
    // of itself to a mask, which reads as a fragment rather than as a cell.
    const centre = CANVAS / 2;
    const outside = CELLS.filter((cell) =>
      Math.hypot(
        cell.rect.x + cell.rect.w / 2 - centre,
        cell.rect.y + cell.rect.h / 2 - centre,
      ) > SAFE_RADIUS
    );
    assert.deepEqual(outside, []);
  });

  it('keeps the launcher field inside the canvas', () => {
    // The compact cut is drawn into the 108 dp layer, so art past the edge is
    // art the layer cannot hold. The full-bleed cut is not checked: running
    // off every edge is what it is for.
    assert.ok(furthestCell(CELLS) <= CANVAS / 2, `${furthestCell(CELLS)} dp`);
  });

  it('centres the field on the canvas', () => {
    // Off-centre art is cropped unevenly by a circular mask, which is the one
    // launcher shape that gives the error nowhere to hide.
    const centre = CANVAS / 2;
    const spans = (pick: (cell: Cell) => number[]) => CELLS.flatMap(pick);
    const xs = spans((cell) => [cell.rect.x, cell.rect.x + cell.rect.w]);
    const ys = spans((cell) => [cell.rect.y, cell.rect.y + cell.rect.h]);
    assert.equal((Math.min(...xs) + Math.max(...xs)) / 2, centre);
    assert.equal((Math.min(...ys) + Math.max(...ys)) / 2, centre);
  });
});

/** Enough of a PNG reader to check what the generator wrote. */
function decode(file: string): {
  width: number;
  height: number;
  pixels: Uint8Array;
} {
  const data = readFileSync(file);
  assert.deepEqual(
    [...data.subarray(0, 8)],
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    `${file} is not a PNG`,
  );
  // Walks the chunk list, which is a linked structure rather than a
  // collection: each chunk's length says where the next one starts.
  const parts: Buffer[] = [];
  let width = 0;
  let height = 0;
  let at = 8;
  while (at < data.length) {
    const length = data.readUInt32BE(at);
    const type = data.toString('latin1', at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.equal(body[8], 8, `${file} is not 8 bits per channel`);
      assert.equal(body[9], 6, `${file} is not RGBA`);
    }
    if (type === 'IDAT') parts.push(Buffer.from(body));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    // The generator writes filter 0 on every row. A file that arrived from
    // somewhere else fails here rather than being read as though its filter
    // bytes were pixels — which is how a set of noise passed for art once.
    assert.equal(raw[y * (stride + 1)], 0, `${file} row ${y} is filtered`);
    pixels.set(
      raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
      y * stride,
    );
  }
  return { width, height, pixels };
}

const hex = (pixels: Uint8Array, at: number): string =>
  [0, 1, 2]
    .map((c) => (pixels[at + c] ?? 0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

/** Every distinct opaque colour in an image, as `RRGGBB`. */
function palette(pixels: Uint8Array): Set<string> {
  const found = new Set<string>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 255) found.add(hex(pixels, i));
  }
  return found;
}

describe('the generated PNGs are the icon', () => {
  const bare = (colour: string) => colour.replace('#', '');
  const launcherRamp = [...new Set(CELLS.map((cell) => bare(cell.colour)))];
  const storeRamp = [...new Set(STORE_CELLS.map((cell) => bare(cell.colour)))];

  const cases = [
    { file: 'src/assets/icon.png', size: 1024, opaque: true, ramp: storeRamp },
    {
      file: 'src/assets/icon-foreground.png',
      size: 432,
      opaque: false,
      ramp: launcherRamp,
    },
    {
      file: 'design/android-icon/png/play-store-512.png',
      size: 512,
      opaque: true,
      ramp: storeRamp,
    },
    {
      file: 'design/android-icon/png/ios-1024.png',
      size: 1024,
      opaque: true,
      ramp: storeRamp,
    },
    {
      file: 'design/android-icon/png/mipmap-xxxhdpi/ic_launcher.png',
      size: 192,
      opaque: false,
      ramp: launcherRamp,
    },
  ] as const;

  for (const { file, size, opaque, ramp } of cases) {
    it(`${file} is ${size} square and carries the ramp`, () => {
      const image = decode(path.join(root, file));
      assert.equal(image.width, size);
      assert.equal(image.height, size);

      // Every ramp colour has to appear somewhere, and so does the symbol. A
      // flat or corrupt export fails here, which is the whole point.
      const found = palette(image.pixels);
      for (const colour of [...ramp, bare(GLYPH)]) {
        assert.ok(found.has(colour), `${file} has no ${colour}`);
      }
    });

    if (opaque) {
      it(`${file} is fully opaque`, () => {
        // The Play listing and the iOS icon are rejected or drawn on an
        // unpredictable background if any pixel is transparent.
        const { pixels } = decode(path.join(root, file));
        const clear = [...Array(pixels.length / 4).keys()].find(
          (i) => pixels[i * 4 + 3] !== 255,
        );
        assert.equal(clear, undefined, `pixel ${clear} is transparent`);
      });
    }
  }

  it('leaves the adaptive icon its bleed', () => {
    // The foreground layer is 108 dp of which a launcher shows 72, so its
    // corners have to be empty or the mask has nothing to cut into.
    const { pixels, width } = decode(
      path.join(root, 'src/assets/icon-foreground.png'),
    );
    assert.equal(pixels[3], 0, 'the top-left corner is not transparent');
    assert.equal(
      pixels[(width * width - 1) * 4 + 3],
      0,
      'the corner is filled',
    );
  });

  it('carries the ramp as alpha in the themed PNG', () => {
    // White throughout: the system supplies the colour, and a themed layer
    // that kept any of the ramp would fight whatever colour that is.
    const { pixels } = decode(
      path.join(root, 'src/assets/icon-monochrome.png'),
    );
    assert.deepEqual([...palette(pixels)], ['FFFFFF']);
  });
});
