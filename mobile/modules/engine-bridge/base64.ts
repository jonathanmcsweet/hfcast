/**
 * Bytes as text, for the crossing into the native module.
 *
 * The stored grids are binary — see `globeCodec.ts` — and the module
 * boundary carries strings safely on both of the builds this app ships.
 * A typed array can be passed across it on the newer one and the older
 * one is a different library version with different rules, so the one
 * shape that is certain on both is used for both.
 *
 * The obvious alternative is `atob` and `btoa`. React Native added them
 * as globals in 0.74, and the Android 5.0 build is on 0.73, so a file
 * that used them would work on one build and fail on the other at the
 * moment a person opened a stored map. That is worth eighty lines here.
 *
 * The cost is real and small: a stored grid is 67.5 KB, which is 90 KB
 * of text, and turning that back into bytes is a pass over 90,000
 * characters. That is a few milliseconds against the second and a half
 * it takes to compute the same grid again.
 */

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const PAD = '='.charCodeAt(0);

/**
 * The value of each character, by its code, and -1 for the rest.
 *
 * A lookup table rather than `indexOf` in the loop: the decode walks
 * 90,000 characters, and a search through 64 of them for each one is
 * the difference between a few milliseconds and most of a second on the
 * slow devices this app is for.
 */
const VALUES = (() => {
  const table = new Int8Array(128).fill(-1);
  // A loop for its effect, filling a fixed table once at module load.
  for (let i = 0; i < ALPHABET.length; i += 1) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/** Turns bytes into base64 text. */
export function toBase64(bytes: Uint8Array): string {
  // Built in blocks rather than by joining an array of characters: the
  // array form holds 90,000 one-character strings at once, which is the
  // allocation this is trying not to make on a device with little
  // memory to spare.
  const parts: string[] = [];
  let block = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const one = bytes[i] as number;
    const two = bytes[i + 1];
    const three = bytes[i + 2];
    const packed = (one << 16) | ((two ?? 0) << 8) | (three ?? 0);
    block += ALPHABET[(packed >> 18) & 63] as string;
    block += ALPHABET[(packed >> 12) & 63] as string;
    block += two === undefined ? '=' : ALPHABET[(packed >> 6) & 63] as string;
    block += three === undefined ? '=' : ALPHABET[packed & 63] as string;
    if (block.length >= 4096) {
      parts.push(block);
      block = '';
    }
  }
  parts.push(block);
  return parts.join('');
}

/**
 * Turns base64 text back into bytes.
 *
 * Throws on anything that is not base64. The caller reads that the same
 * way it reads a missing file: there is no stored grid here, so compute
 * one.
 */
export function fromBase64(text: string): Uint8Array {
  const clean = text.length > 0 && text.charCodeAt(text.length - 1) === PAD
    ? text.charCodeAt(text.length - 2) === PAD
      ? text.slice(0, -2)
      : text.slice(0, -1)
    : text;
  if (clean.length % 4 === 1) {
    throw new Error(`${text.length} characters is not base64`);
  }
  // Four characters carry three bytes, and a last group of three or two
  // carries two or one. Rounding down says exactly that.
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));

  // A loop rather than a functional form: it fills a typed array from a
  // string four characters at a time, and every functional shape of it
  // builds an intermediate array the length of the text.
  let out = 0;
  let packed = 0;
  let held = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? (VALUES[code] as number) : -1;
    if (value < 0) {
      throw new Error(`"${clean[i]}" is not a base64 character`);
    }
    packed = (packed << 6) | value;
    held += 6;
    if (held >= 8) {
      held -= 8;
      bytes[out] = (packed >> held) & 0xff;
      out += 1;
    }
  }
  return out === bytes.length ? bytes : bytes.subarray(0, out);
}
