/**
 * Draws rounded rectangles into an RGBA buffer, and writes PNGs.
 *
 * Written here rather than taken from a package because there is no image
 * library in this project and the icon is nine rounded rectangles and one
 * rounded-rectangle outline — a shape with a closed-form distance function, so
 * the edges come out exact rather than approximated by a general renderer.
 *
 * Antialiasing is analytic, not sampled: the distance from a pixel's centre to
 * the shape's edge gives its coverage directly, which is both sharper than
 * supersampling and cheaper.
 */
import { deflateSync } from 'node:zlib';

import { CANVAS, type Rect } from './icon-art.ts';

export type Rgb = readonly [number, number, number];

/** Reads `#rrggbb`. The colours all come from the palette, so this is total. */
export function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export interface Fill {
  readonly colour: Rgb;
  readonly alpha: number;
}

export interface Shape {
  readonly rect: Rect;
  /** Filled when set. */
  readonly fill?: Fill;
  /** Outlined when set, with the width centred on the edge. */
  readonly stroke?: Fill & { readonly width: number; };
}

/** What a launcher cuts the icon down to before showing it. */
export type Mask = 'none' | 'squircle' | 'circle';

export interface Frame {
  /** Output edge, in pixels. Square. */
  readonly size: number;
  /**
   * How much of the 108 dp canvas fills the output, centred. `VIEWPORT` gives
   * the framing a launcher shows; `CANVAS` gives the whole layer including its
   * bleed.
   */
  readonly viewport: number;
  /** Painted first. Left out, the output is transparent where nothing draws. */
  readonly background?: Fill;
  readonly mask?: Mask;
}

/**
 * Signed distance from a point to a rounded rectangle: negative inside,
 * positive outside, and in the same units as the rectangle.
 */
function distance(px: number, py: number, rect: Rect): number {
  const qx = Math.abs(px - (rect.x + rect.w / 2)) - rect.w / 2 + rect.r;
  const qy = Math.abs(py - (rect.y + rect.h / 2)) - rect.h / 2 + rect.r;
  return Math.min(Math.max(qx, qy), 0)
    + Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
    - rect.r;
}

/**
 * Coverage of one pixel by an edge that distance `d` away, where `d` is already
 * in pixels. A pixel whose centre sits on the edge is half covered, and the
 * transition spans one pixel.
 */
const coverage = (d: number): number => Math.min(Math.max(0.5 - d, 0), 1);

/** The mask, as a rectangle in canvas units. */
function maskRect(mask: Mask): Rect | null {
  if (mask === 'none') return null;
  const inset = (CANVAS - 72) / 2;
  // 72 dp across, and the corner radius is what separates the two: a quarter
  // of the width reads as Android's squircle, half of it is a circle.
  const r = mask === 'circle' ? 36 : 18;
  return { x: inset, y: inset, w: 72, h: 72, r };
}

/**
 * Renders shapes into straight-alpha RGBA.
 *
 * Colours are composited premultiplied, which is what makes an antialiased edge
 * over a transparent background come out right: straight-alpha compositing
 * divides by an alpha that is near zero at the edge and the colour goes wild.
 */
export function render(
  shapes: readonly Shape[],
  frame: Frame,
): Uint8Array {
  const { size, viewport } = frame;
  const scale = size / viewport;
  const origin = (CANVAS - viewport) / 2;
  // Premultiplied accumulation, one float per channel.
  const buffer = new Float64Array(size * size * 4);

  const paint = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    at: (ux: number, uy: number) => Fill | null,
  ): void => {
    // Both loops walk a pixel grid to accumulate into a shared buffer. A
    // functional form would have to build and then merge one array per shape,
    // which for a 1024 px icon is tens of megabytes to say the same thing.
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const ux = origin + (px + 0.5) / scale;
        const uy = origin + (py + 0.5) / scale;
        const source = at(ux, uy);
        if (source === null || source.alpha <= 0) continue;
        const i = (py * size + px) * 4;
        const a = source.alpha;
        for (let c = 0; c < 3; c++) {
          const channel = source.colour[c] ?? 0;
          buffer[i + c] = channel * a + (buffer[i + c] ?? 0) * (1 - a);
        }
        buffer[i + 3] = a + (buffer[i + 3] ?? 0) * (1 - a);
      }
    }
  };

  const background = frame.background;
  if (background !== undefined) {
    paint(0, 0, size, size, () => background);
  }

  for (const shape of shapes) {
    // Only the pixels the shape can reach: the whole canvas per shape would be
    // ten times the work for the same picture.
    const pad = (shape.stroke?.width ?? 0) / 2 + 2 / scale;
    const box = shape.rect;
    const clamp = (v: number): number =>
      Math.min(Math.max(Math.floor(v), 0), size);
    const x0 = clamp((box.x - pad - origin) * scale);
    const y0 = clamp((box.y - pad - origin) * scale);
    const x1 = clamp((box.x + box.w + pad - origin) * scale + 1);
    const y1 = clamp((box.y + box.h + pad - origin) * scale + 1);

    paint(x0, y0, x1, y1, (ux, uy) => {
      const d = distance(ux, uy, box);
      const stroke = shape.stroke;
      if (stroke !== undefined) {
        const edge = (Math.abs(d) - stroke.width / 2) * scale;
        return { colour: stroke.colour, alpha: stroke.alpha * coverage(edge) };
      }
      const fill = shape.fill;
      if (fill === undefined) return null;
      return { colour: fill.colour, alpha: fill.alpha * coverage(d * scale) };
    });
  }

  const cut = maskRect(frame.mask ?? 'none');
  const out = new Uint8Array(size * size * 4);
  // Unpremultiplies, applies the mask and rounds, in one pass over the pixels.
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      const alpha = buffer[i + 3] ?? 0;
      const keep = cut === null ? 1 : coverage(
        distance(origin + (px + 0.5) / scale, origin + (py + 0.5) / scale, cut)
          * scale,
      );
      const final = alpha * keep;
      out[i + 3] = Math.round(final * 255);
      if (alpha <= 0) continue;
      for (let c = 0; c < 3; c++) {
        out[i + c] = Math.round(Math.min((buffer[i + c] ?? 0) / alpha, 255));
      }
    }
  }
  return out;
}

/** Places one rendered square inside a larger buffer, over what is there. */
export function paste(
  target: Uint8Array,
  targetWidth: number,
  patch: Uint8Array,
  patchSize: number,
  atX: number,
  atY: number,
): void {
  // Copies pixel by pixel because the rows land at different offsets in the two
  // buffers and the patch is composited rather than overwritten.
  for (let y = 0; y < patchSize; y++) {
    for (let x = 0; x < patchSize; x++) {
      const s = (y * patchSize + x) * 4;
      const a = (patch[s + 3] ?? 0) / 255;
      if (a <= 0) continue;
      const d = ((atY + y) * targetWidth + atX + x) * 4;
      for (let c = 0; c < 3; c++) {
        target[d + c] = Math.round(
          (patch[s + c] ?? 0) * a + (target[d + c] ?? 0) * (1 - a),
        );
      }
      const under = (target[d + 3] ?? 0) / 255;
      target[d + 3] = Math.round(255 * (a + under * (1 - a)));
    }
  }
}

/** Fills a whole buffer with one opaque colour. */
export function fill(
  width: number,
  height: number,
  colour: Rgb,
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = colour[0];
    out[i * 4 + 1] = colour[1];
    out[i * 4 + 2] = colour[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Drops alpha, over the colour given. For outputs that must be opaque. */
export function flatten(rgba: Uint8Array, over: Rgb): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = (rgba[i + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.round(
        (rgba[i + c] ?? 0) * a + (over[c] ?? 0) * (1 - a),
      );
    }
    out[i + 3] = 255;
  }
  return out;
}

const CRC_TABLE = Array.from(
  { length: 256 },
  (_, i) =>
    Array.from({ length: 8 }).reduce<number>(
      (c) => (c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1),
      i,
    ),
);

function crc32(bytes: Uint8Array): number {
  // Reduce over a megabyte of pixels allocates a closure per byte; this is the
  // one place in the file where that shows up in the wall clock.
  let c = 0xFFFFFFFF;
  for (const byte of bytes) {
    c = (CRC_TABLE[(c ^ byte) & 255] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/** Encodes 8-bit RGBA as a PNG. */
export function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  // 8 bits per channel, colour type 6 (RGBA), deflate, adaptive filtering,
  // no interlacing.
  ihdr.set([8, 6, 0, 0, 0], 8);

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  // Each row is prefixed with its filter byte, so the rows cannot simply be
  // concatenated. Filter 0 leaves the bytes as they are: the art is flat
  // colour, which deflate already handles well.
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
