import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';

import {
  CELLS,
  furthestArt,
  MARKER,
  MARKER_COLOUR,
  MARKER_STROKE,
  roundedRectPath,
  SAFE_RADIUS,
} from '../tools/icon-art.ts';

/**
 * The app icon, from two directions.
 *
 * The vector drawables in `design/android-icon/res/` are the design of record
 * and the PNGs are generated, so the first half of this file checks that the
 * geometry the generator uses still describes those drawables. The second half
 * checks the PNGs themselves, because the set that arrived before this tool
 * existed was sixteen files of noise that looked like PNGs to everything except
 * a decoder.
 */

const root = path.join(import.meta.dirname, '..');
const design = path.join(root, 'design/android-icon');

const read = (file: string): string =>
  readFileSync(path.join(design, file), 'utf8');

const attributes = (xml: string, name: string): readonly string[] =>
  [...xml.matchAll(new RegExp(`android:${name}="([^"]*)"`, 'g'))]
    .map((match) => match[1] ?? '');

describe('the vector drawables and the generator agree', () => {
  const foreground = read('res/drawable/ic_launcher_foreground.xml');
  const monochrome = read('res/drawable/ic_launcher_monochrome.xml');
  const expected = [
    ...CELLS.map((cell) => roundedRectPath(cell.rect)),
    roundedRectPath(MARKER),
  ];

  it('draws the same nine cells and marker as the colour layer', () => {
    assert.deepEqual(attributes(foreground, 'pathData'), expected);
  });

  it('draws the same shapes in the themed layer', () => {
    assert.deepEqual(attributes(monochrome, 'pathData'), expected);
  });

  it('uses the same ramp colours, in the same order', () => {
    // The last fill is the marker's, which is a stroke over a transparent
    // fill — hence the '#00000000' the drawable carries for it.
    assert.deepEqual(attributes(foreground, 'fillColor'), [
      ...CELLS.map((cell) => cell.colour),
      '#00000000',
    ]);
    assert.deepEqual(attributes(foreground, 'strokeColor'), [MARKER_COLOUR]);
    assert.deepEqual(attributes(foreground, 'strokeWidth'), [
      String(MARKER_STROKE),
    ]);
  });

  it('carries the ramp as alpha in the themed layer', () => {
    assert.deepEqual(
      attributes(monochrome, 'fillAlpha').map(Number),
      CELLS.map((cell) => cell.alpha),
    );
  });
});

describe('the constraints a launcher enforces', () => {
  it('keeps every part of the art inside the safe circle', () => {
    // Art outside this can be sliced off by a launcher mask, which would show
    // up on somebody else's phone rather than in any build here.
    const reach = furthestArt();
    assert.ok(reach <= SAFE_RADIUS, `${reach} dp from centre`);
  });

  it('runs the marker through the gutters without touching a cell', () => {
    const half = MARKER_STROKE / 2;
    const left = MARKER.x - half;
    const right = MARKER.x + MARKER.w + half;
    const columns = [...new Set(CELLS.map((cell) => cell.rect.x))].sort(
      (a, b) => a - b,
    );
    const width = CELLS[0]?.rect.w ?? 0;
    const [first, , third] = columns;
    assert.ok(left > (first ?? 0) + width, `marker reaches ${left}`);
    assert.ok(right < (third ?? 0), `marker reaches ${right}`);
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
  const ramp = new Set(CELLS.map((cell) => cell.colour.replace('#', '')));
  const amber = MARKER_COLOUR.replace('#', '');

  const cases = [
    { file: 'src/assets/icon.png', size: 1024, opaque: true },
    { file: 'src/assets/icon-foreground.png', size: 432, opaque: false },
    {
      file: 'design/android-icon/png/play-store-512.png',
      size: 512,
      opaque: true,
    },
    { file: 'design/android-icon/png/ios-1024.png', size: 1024, opaque: true },
    {
      file: 'design/android-icon/png/mipmap-xxxhdpi/ic_launcher.png',
      size: 192,
      opaque: false,
    },
  ] as const;

  for (const { file, size, opaque } of cases) {
    it(`${file} is ${size} square and carries the ramp`, () => {
      const image = decode(path.join(root, file));
      assert.equal(image.width, size);
      assert.equal(image.height, size);

      // Every ramp colour and the amber have to appear somewhere. A flat or
      // corrupt export fails here, which is the whole point of the check.
      const found = palette(image.pixels);
      for (const colour of [...ramp, amber]) {
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
});
