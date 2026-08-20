import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  bearingDeg,
  distanceKm,
  gridToLatLon,
  latLonToGrid,
} from '../src/geo.ts';
import { BANDS_BY_FREQ } from '../src/types.ts';
import { buildDeck } from '../src/voacap/deck.ts';
import { parseVoacapOutput } from '../src/voacap/parse.ts';
import { FIXTURE_PATH, FIXTURE_REQUEST } from './fixtureRequest.ts';

const fixture = readFileSync(FIXTURE_PATH, 'utf8');

const SEATTLE = { lat: FIXTURE_REQUEST.fromLat, lon: FIXTURE_REQUEST.fromLon };
const TOKYO = { lat: FIXTURE_REQUEST.toLat, lon: FIXTURE_REQUEST.toLon };

test('grid conversion round-trips through a 6-character locator', () => {
  const grid = latLonToGrid(SEATTLE.lat, SEATTLE.lon);
  assert.equal(grid.slice(0, 4), 'CN87');
  const back = gridToLatLon(grid);
  // A 6-character square is about 4.6 x 2.3 km, so the centre is close.
  assert.ok(Math.abs(back.lat - SEATTLE.lat) < 0.05);
  assert.ok(Math.abs(back.lon - SEATTLE.lon) < 0.09);
});

test('grid conversion rejects things that are not locators', () => {
  assert.throws(() => gridToLatLon('nope'));
  assert.throws(() => gridToLatLon('ZZ99'));
});

test('great-circle maths agrees with what VOACAP computed', () => {
  // The fixture header reports 7690.7 km and an azimuth of 300.59 degrees.
  const d = distanceKm(SEATTLE.lat, SEATTLE.lon, TOKYO.lat, TOKYO.lon);
  const b = bearingDeg(SEATTLE.lat, SEATTLE.lon, TOKYO.lat, TOKYO.lon);
  assert.ok(Math.abs(d - 7690.7) < 15, `distance was ${d}`);
  assert.ok(Math.abs(b - 300.59) < 0.5, `bearing was ${b}`);
});

test('deck places every field on its documented column', () => {
  const deck = buildDeck(FIXTURE_REQUEST);
  const lines = deck.split('\n');
  const card = (name: string) =>
    lines.find((l) => l.startsWith(name)) ?? assert.fail(`no ${name} card`);

  assert.equal(
    card('CIRCUIT'),
    'CIRCUIT   47.61N   122.33W    35.68N   139.77E  S     0',
  );
  assert.equal(card('SUNSPOT'), 'SUNSPOT     68.');
  assert.equal(card('MONTH'), 'MONTH      2026 7.00');
  assert.equal(
    card('FREQUENCY'),
    'FREQUENCY  1.84 3.75 5.36 7.1010.1214.2018.1021.2024.9428.40 0.00',
  );
  // The antenna's frequency range. It read 2 to 30 MHz until 2026-08-19,
  // and a frequency in no card's range gets no antenna, so 160m at 1.84
  // ran isotropic. The end of the card was pinned here and the range was
  // not, which is how it went unseen.
  assert.equal(
    card('ANTENNA').slice(0, 30),
    'ANTENNA       1    1    1   30',
    'the transmit card must reach below 160m',
  );

  // 100 W is 0.1 kW, and power sits in the last ten columns of the TX antenna.
  assert.ok(card('ANTENNA').endsWith('    0.1000'));
  // Sporadic-E on: validated against six months of measured reception
  // reports. See hfcast-engine/docs/accuracy.md before changing this.
  assert.equal(card('FPROB'), 'FPROB      1.00 1.00 1.00 1.00');
});

test('deck refuses a value that would overflow its field', () => {
  assert.throws(
    () => buildDeck({ ...FIXTURE_REQUEST, watts: 100_000_000 }),
    /overflows/,
  );
});

/**
 * The deck VOACAP echoes above its first page header, one line in from
 * the margin and with the padding the LABEL card was written with cut off
 * the end.
 */
function echoedDeck(listing: string): readonly string[] {
  const lines = listing.split('\n');
  const first = lines.findIndex((l) => l.startsWith(' LINEMAX'));
  const last = lines.findIndex((l) => l.startsWith(' QUIT'));
  assert.ok(first >= 0 && last > first, 'the listing must echo its deck');
  return lines.slice(first, last + 1).map((l) => l.slice(1).trimEnd());
}

test('the listing was recorded from the deck the server writes today', () => {
  // The one guard that catches a stale fixture. Every other test here
  // reads the listing as if it answered the current question, and a
  // listing recorded before a band or a card changed answers a different
  // one — quietly, because the columns still line up. Re-record with
  // `pnpm record-fixture`.
  assert.deepEqual(
    echoedDeck(fixture),
    buildDeck(FIXTURE_REQUEST).trimEnd().split('\n').map((l) => l.trimEnd()),
  );
});

test('parser reads every hour and band from a real listing', () => {
  const { cells, mufByHour } = parseVoacapOutput(fixture, BANDS_BY_FREQ);

  const hours = new Set(cells.map((c) => c.hour));
  assert.equal(hours.size, 24, 'expected all 24 UTC hours');
  assert.ok(hours.has(0), 'hour 24 should fold to 0');
  assert.equal(cells.length, 24 * BANDS_BY_FREQ.length);

  assert.equal(mufByHour.length, 24);
  assert.ok(mufByHour.every((m) => m > 0 && m < 60), 'MUF should be plausible');
});

test('the Fortran path reports no operating window rather than an empty one', () => {
  // A method-30 listing prints neither the LUF nor the FOT, so this path
  // has nothing to report until it runs a second, method-26 deck. Null
  // says that; 24 nulls would say the frequencies were computed and
  // nothing worked, which is a different and untrue claim.
  const { window } = parseVoacapOutput(fixture, BANDS_BY_FREQ);
  assert.equal(window, null);
});

test('parser keeps reliability in 0..1 and reads merged columns correctly', () => {
  const { cells } = parseVoacapOutput(fixture, BANDS_BY_FREQ);
  assert.ok(cells.every((c) => c.reliability >= 0 && c.reliability <= 1));

  // From the fixture's 01 UTC block:
  //   REL   0.42 0.00 0.00 0.00 0.00 0.00 0.51 0.41 0.08 0.00 0.00
  //   SNR     22 -493 -299 -184  -90    4   24   22   -5  -66 -129
  //
  // The first of those columns is the value at the MUF, not a requested
  // frequency. The bands start one column later, so 160m is 0.00 / -493
  // and the leading 0.42 / 22 belongs to the MUF and is reported
  // separately.
  const at1 = cells.filter((c) => c.hour === 1);
  const m160 = at1.find((c) => c.band === '160m');
  assert.equal(m160?.reliability, 0);
  assert.equal(m160?.snr, -493);

  // Slots run 160m, 80m, 60m, 40m, 30m, 20m, 17m, 15m, 12m, 10m. 60m is
  // the third, and everything after it moved a column when it arrived.
  const m60 = at1.find((c) => c.band === '60m');
  assert.equal(m60?.reliability, 0);
  assert.equal(m60?.snr, -184);

  const m20 = at1.find((c) => c.band === '20m');
  assert.equal(m20?.reliability, 0.51);
  assert.equal(m20?.snr, 24);

  const m17 = at1.find((c) => c.band === '17m');
  assert.equal(m17?.reliability, 0.41);
  assert.equal(m17?.snr, 22);
});
