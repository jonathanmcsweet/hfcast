import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatLatLon, parseCoordinates } from '../src/data/coords.ts';

/**
 * A coordinate somebody typed is the one input where being nearly right is
 * worse than refusing. A misread pair puts the operator in the wrong place and
 * produces a forecast that looks exactly like a correct one, so everything
 * here is about the line between "this is a coordinate" and "this is not".
 */

const near = (
  actual: { lat: number; lon: number; } | null,
  lat: number,
  lon: number,
) => {
  assert.notEqual(actual, null);
  assert.ok(
    actual !== null && Math.abs(actual.lat - lat) < 1e-4
      && Math.abs(actual.lon - lon) < 1e-4,
    `expected about ${lat}, ${lon} but got ${JSON.stringify(actual)}`,
  );
};

describe('decimal coordinates, which is what a map app copies out', () => {
  it('reads a comma-separated pair', () => {
    near(parseCoordinates('39.74, -104.99'), 39.74, -104.99);
  });

  it('reads it without the space, and without the comma', () => {
    near(parseCoordinates('39.74,-104.99'), 39.74, -104.99);
    near(parseCoordinates('39.74 -104.99'), 39.74, -104.99);
  });

  it('takes a leading plus, which some tools write', () => {
    near(parseCoordinates('+39.74, +104.99'), 39.74, 104.99);
  });

  it('survives the punctuation a phone keyboard substitutes', () => {
    // A pasted en dash instead of a hyphen would otherwise flip a hemisphere
    // by failing to parse rather than by parsing wrongly.
    near(parseCoordinates('39.74, −104.99'), 39.74, -104.99);
  });

  it('refuses a pair outside the world', () => {
    assert.equal(parseCoordinates('91.0, 0.0'), null);
    assert.equal(parseCoordinates('0.0, 181.0'), null);
  });

  it('does not read two bare whole numbers as a coordinate', () => {
    // "39 104" is as likely to be a street address or a callsign fragment.
    // Refusing it lets the text fall through to the place-name search.
    assert.equal(parseCoordinates('39 104'), null);
  });
});

describe('degrees, minutes and seconds, which is what a paper map prints', () => {
  it('reads the form the design shows', () => {
    near(parseCoordinates('39°44′N 104°59′W'), 39.7333, -104.9833);
  });

  it('reads seconds when they are given', () => {
    near(
      parseCoordinates('39°44′30"N 104°59′30"W'),
      39.7417,
      -104.9917,
    );
  });

  it('takes the hemisphere letter before the number as well as after', () => {
    near(parseCoordinates('N39°44′ W104°59′'), 39.7333, -104.9833);
  });

  it('accepts either order, because both are written', () => {
    near(parseCoordinates('W104°59′ N39°44′'), 39.7333, -104.9833);
  });

  it('reads whole degrees with a hemisphere', () => {
    // Unambiguous where a bare pair is not: the letters say which is which.
    near(parseCoordinates('39N 104W'), 39, -104);
  });

  it('refuses a pair with no hemisphere letters', () => {
    // Nothing says which number is the latitude, and assuming an order is
    // how a coordinate ends up transposed into an ocean.
    assert.equal(parseCoordinates("39°44' 104°59'"), null);
  });

  it('refuses two letters on one number, which is a contradiction', () => {
    assert.equal(parseCoordinates('N39°44′S 104°59′W'), null);
  });

  it('refuses two latitudes', () => {
    assert.equal(parseCoordinates('39°N 40°S'), null);
  });
});

describe('what must never be read as a coordinate', () => {
  it('leaves a place name alone', () => {
    const names = ['Denver', 'Denver, CO', 'Rio de Janeiro', ''];
    assert.deepEqual(names.map(parseCoordinates), names.map(() => null));
  });

  it('leaves a Maidenhead locator alone', () => {
    // The locator has its own reader, and it runs first. This only has to
    // avoid claiming one.
    assert.equal(parseCoordinates('DM79mr'), null);
    assert.equal(parseCoordinates('CN87'), null);
  });

  it('leaves what3words alone', () => {
    assert.equal(parseCoordinates('///daring.lion.race'), null);
  });
});

describe('showing a coordinate back', () => {
  it('writes decimals, whatever notation was typed', () => {
    const dms = parseCoordinates('39°44′N 104°59′W');
    assert.notEqual(dms, null);
    assert.equal(dms && formatLatLon(dms), '39.7333, -104.9833');
  });

  it('drops trailing zeros rather than padding to four places', () => {
    assert.equal(formatLatLon({ lat: 51.5, lon: 0 }), '51.5, 0');
  });
});
