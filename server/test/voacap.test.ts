import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bearingDeg,
  distanceKm,
  gridToLatLon,
  latLonToGrid,
} from '../src/geo.ts';
import { BANDS_BY_FREQ } from '../src/types.ts';
import { buildDeck } from '../src/voacap/deck.ts';
import { parseVoacapOutput } from '../src/voacap/parse.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  path.join(here, 'fixtures/seattle-tokyo-jul2026-ssn68.out'),
  'utf8',
);

const SEATTLE = { lat: 47.61, lon: -122.33 };
const TOKYO = { lat: 35.68, lon: 139.77 };

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
  const deck = buildDeck({
    fromLat: SEATTLE.lat,
    fromLon: SEATTLE.lon,
    toLat: TOKYO.lat,
    toLon: TOKYO.lon,
    fromLabel: 'Seattle',
    toLabel: 'Tokyo',
    month: 7,
    year: 2026,
    ssn: 68,
    watts: 100,
    requiredSnrDb: 24,
    noiseDbw: 145,
  });
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
    'FREQUENCY  1.84 3.75 7.1010.1214.2018.1021.2024.9428.40 0.00 0.00',
  );
  // 100 W is 0.1 kW, and power sits in the last ten columns of the TX antenna.
  assert.ok(card('ANTENNA').endsWith('    0.1000'));
  // Sporadic-E on: validated against six months of measured reception
  // reports. See propcore/docs/accuracy.md before changing this.
  assert.equal(card('FPROB'), 'FPROB      1.00 1.00 1.00 1.00');
});

test('deck refuses a value that would overflow its field', () => {
  assert.throws(
    () =>
      buildDeck({
        fromLat: SEATTLE.lat,
        fromLon: SEATTLE.lon,
        toLat: TOKYO.lat,
        toLon: TOKYO.lon,
        fromLabel: 'a',
        toLabel: 'b',
        month: 7,
        year: 2026,
        ssn: 68,
        watts: 100_000_000,
        requiredSnrDb: 24,
        noiseDbw: 145,
      }),
    /overflows/,
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

test('parser keeps reliability in 0..1 and reads merged columns correctly', () => {
  const { cells } = parseVoacapOutput(fixture, BANDS_BY_FREQ);
  assert.ok(cells.every((c) => c.reliability >= 0 && c.reliability <= 1));

  // From the fixture's 01 UTC block:
  //   REL   0.17 0.00 0.00 0.00 0.00 0.11 0.17 0.03 0.00 0.00
  //   SNR     13 -503 -309 -100   -6   14   12  -15  -76 -139
  //
  // The first of those columns is the value at the MUF, not a requested
  // frequency. The bands start one column later, so 160m is 0.00 / -503 and
  // the leading 0.17 / 13 belongs to the MUF and is reported separately.
  const at1 = cells.filter((c) => c.hour === 1);
  const m160 = at1.find((c) => c.band === '160m');
  assert.equal(m160?.reliability, 0);
  // -503 fills its 5-column field completely. A whitespace split would have
  // merged it with its neighbour; reading by column position does not.
  assert.equal(m160?.snr, -503);

  // Slots run 160m, 80m, 40m, 30m, 20m, 17m, 15m, 12m, 10m, so the two
  // open bands at this hour are slot 4 and slot 5.
  const m20 = at1.find((c) => c.band === '20m');
  assert.equal(m20?.reliability, 0.11);
  assert.equal(m20?.snr, 14);

  const m17 = at1.find((c) => c.band === '17m');
  assert.equal(m17?.reliability, 0.17);
  assert.equal(m17?.snr, 12);
});
