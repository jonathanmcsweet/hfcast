import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fromBase64, toBase64 } from '../modules/engine-bridge/base64.ts';

/**
 * Node has `Buffer`, which is the reference these check against. The app
 * does not: this exists because the two Android builds are on React
 * Native versions that do not agree about `atob`, and a stored map is
 * read through it on both.
 */

const reference = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

describe('bytes turned into text and back', () => {
  it('agrees with a known encoder on every length of tail', () => {
    // Base64 works in threes. One, two and three left over at the end
    // are the three cases, and the padding differs in each.
    for (let length = 0; length < 40; length += 1) {
      const bytes = Uint8Array.from(
        { length },
        (_, i) => (i * 37 + length) % 256,
      );
      assert.equal(toBase64(bytes), reference(bytes), `length ${length}`);
      assert.deepEqual(fromBase64(toBase64(bytes)), bytes, `length ${length}`);
    }
  });

  it('carries every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    assert.equal(toBase64(all), reference(all));
    assert.deepEqual(fromBase64(toBase64(all)), all);
  });

  it('reads what a known encoder wrote', () => {
    const bytes = Uint8Array.from({ length: 1000 }, (_, i) => (i * 13) % 256);
    assert.deepEqual(fromBase64(reference(bytes)), bytes);
  });

  it('carries a whole stored grid', () => {
    // 67.5 KB is the real size, and the block joining in `toBase64` only
    // starts mattering above 4 KB. A round trip at the real length is
    // the case the app actually runs.
    const bytes = Uint8Array.from(
      { length: 69168 },
      (_, i) => (i * 7 + (i >> 8)) % 256,
    );
    const text = toBase64(bytes);
    assert.equal(text, reference(bytes));
    assert.deepEqual(fromBase64(text), bytes);
  });
});

describe('text that is not base64', () => {
  it('is refused rather than read as bytes', () => {
    assert.throws(() => fromBase64('ab c'), /not a base64 character/);
    assert.throws(() => fromBase64('AA*A'), /not a base64 character/);
  });

  it('is refused when the length cannot be a whole number of bytes', () => {
    // Five characters carry three bytes and one spare group of six
    // bits, which no encoder produces. It is a truncated file.
    assert.throws(() => fromBase64('AAAAA'), /not base64/);
  });

  it('is refused when the characters are outside ASCII', () => {
    assert.throws(() => fromBase64('AA€A'), /not a base64 character/);
  });
});

describe('the empty case', () => {
  it('goes both ways', () => {
    assert.equal(toBase64(new Uint8Array(0)), '');
    assert.deepEqual(fromBase64(''), new Uint8Array(0));
  });
});
