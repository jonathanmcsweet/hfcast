import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isLoopback, normaliseAddress } from '../src/store/useServerStore.ts';

/**
 * The address was fixed when the APK was built, at `127.0.0.1`, which on a
 * phone is the phone. Every forecast failed, the error screen told the reader
 * to run a dev server, and there was no way to say where to look instead —
 * the app was one dead-end screen.
 *
 * So this is now typed by a person on a touch keyboard, and these are the
 * shapes they type.
 */

describe('reading an address somebody typed', () => {
  it('accepts a host and port, which is what is on the network', () => {
    // Nobody reads "http://" off their router. Refusing this in favour of a
    // lecture about schemes would be pedantry.
    assert.equal(
      normaliseAddress('192.168.1.5:8787'),
      'http://192.168.1.5:8787',
    );
    assert.equal(
      normaliseAddress('hfcast.local:8787'),
      'http://hfcast.local:8787',
    );
  });

  it('keeps a scheme that was given, including https', () => {
    assert.equal(
      normaliseAddress('https://hfcast.example.com'),
      'https://hfcast.example.com',
    );
    assert.equal(
      normaliseAddress('HTTP://10.0.0.9:8787'),
      'http://10.0.0.9:8787',
    );
  });

  it('forgives the spaces a phone keyboard adds', () => {
    assert.equal(normaliseAddress('  10.0.0.9:8787 '), 'http://10.0.0.9:8787');
  });

  it('drops a trailing slash, which would double up on every path', () => {
    // Every request path starts with one, so `…:8787/` + `/forecast` would
    // ask for `//forecast`.
    assert.equal(
      normaliseAddress('http://10.0.0.9:8787/'),
      'http://10.0.0.9:8787',
    );
  });

  it('keeps only the origin, so a pasted URL cannot break every path', () => {
    // Pasting a tunnel URL with a path on it is easy to do, and the path
    // would land in front of /forecast and read as the server being down.
    assert.equal(
      normaliseAddress('https://x.trycloudflare.com/forecast?foo=1'),
      'https://x.trycloudflare.com',
    );
  });

  it('refuses what cannot be used, rather than storing it', () => {
    // A stored unusable address would fail on every request afterwards with
    // no clue that this was the reason.
    assert.equal(normaliseAddress(''), null);
    assert.equal(normaliseAddress('   '), null);
    assert.equal(normaliseAddress('http://'), null);
    assert.equal(normaliseAddress('::::'), null);
  });
});

describe('naming the mistake that caused this', () => {
  it('recognises an address that means the device itself', () => {
    // The error screen says so in words, because "could not reach
    // 127.0.0.1:8787" reads as a broken app rather than a wrong setting.
    const own = [
      'http://127.0.0.1:8787',
      'http://localhost:8787',
      'http://[::1]:8787',
    ];
    assert.deepEqual(own.map(isLoopback), own.map(() => true));
  });

  it('does not accuse an ordinary address', () => {
    const elsewhere = [
      'http://192.168.1.5:8787',
      'https://hfcast.example.com',
      'http://10.0.0.9:8787',
    ];
    assert.deepEqual(elsewhere.map(isLoopback), elsewhere.map(() => false));
  });

  it('says nothing rather than throwing on a value it cannot parse', () => {
    assert.equal(isLoopback('nonsense'), false);
  });
});
