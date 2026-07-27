/**
 * The Rust engine path.
 *
 * These run the real `predict` binary, so they skip where it is not built.
 * The heavy comparison against the Fortran binary lives in hfcast-engine's
 * `paritycheck`; what is checked here is the part written in TypeScript —
 * that the request reaches the binary, and that what comes back is reshaped
 * into exactly what `parseVoacapOutput` used to return.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { BANDS_BY_FREQ } from '../src/types.ts';
import { PREDICT_BIN, runEngine } from '../src/voacap/engine.ts';
import { parseVoacapOutput } from '../src/voacap/parse.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const available = existsSync(PREDICT_BIN);
if (!available) {
  console.error(`skipping engine tests: no predict binary at ${PREDICT_BIN}`);
}

/** The request behind test/fixtures/seattle-tokyo-jul2026-ssn68.out. */
const FIXTURE_REQUEST = {
  fromLat: 47.61,
  fromLon: -122.33,
  toLat: 35.68,
  toLon: 139.77,
  fromLabel: 'SEATTLE',
  toLabel: 'TOKYO',
  month: 7,
  year: 2026,
  ssn: 68,
  watts: 100,
  requiredSnrDb: 24,
  noiseDbw: 145,
};

/**
 * The Fortran reference's own listing for the deck the server writes today.
 *
 * The older `seattle-tokyo-jul2026-ssn68.out` fixture predates the change
 * that enabled sporadic E (`FPROB` fourth value, server 0.2.0), so it is a
 * listing for a deck this server no longer sends. It stays because the
 * parser tests use it as known text; comparing engine output against it
 * would compare two different questions.
 */
test('the engine reproduces the reference listing cell for cell', {
  skip: !available,
}, async () => {
  const fixture = readFileSync(
    path.join(here, 'fixtures/seattle-tokyo-jul2026-ssn68-es.out'),
    'utf8',
  );
  const expected = parseVoacapOutput(fixture, BANDS_BY_FREQ);
  const actual = await runEngine(FIXTURE_REQUEST);

  assert.deepEqual(actual.mufByHour, expected.mufByHour);
  assert.equal(actual.cells.length, expected.cells.length);

  const key = (c: { hour: number; band: string; }) => `${c.hour}|${c.band}`;
  const byKey = new Map(actual.cells.map((c) => [key(c), c]));
  for (const want of expected.cells) {
    const got = byKey.get(key(want));
    assert.ok(got, `no cell for ${key(want)}`);
    assert.deepEqual(got, want, `cell ${key(want)} differs`);
  }
});

test('every returned cell carries the fields the correction layer reads', {
  skip: !available,
}, async () => {
  const { cells, mufByHour } = await runEngine(FIXTURE_REQUEST);
  assert.ok(cells.length > 0);
  assert.equal(mufByHour.length, 24);
  for (const cell of cells) {
    assert.ok(cell.hour >= 0 && cell.hour <= 23);
    assert.ok(BANDS_BY_FREQ.includes(cell.band));
    // correct.ts needs these to recompute reliability from the deciles.
    assert.equal(typeof cell.reliability, 'number');
    assert.equal(typeof cell.snr, 'number');
    assert.ok(cell.reliability >= 0 && cell.reliability <= 1);
  }
});

test('a request for one band returns only that band', {
  skip: !available,
}, async () => {
  const { cells } = await runEngine({ ...FIXTURE_REQUEST, bands: ['20m'] });
  assert.ok(cells.length > 0);
  assert.ok(cells.every((c) => c.band === '20m'));
});

test('a refused request reports why', { skip: !available }, async () => {
  await assert.rejects(
    runEngine({ ...FIXTURE_REQUEST, month: 13 }),
    /month/,
  );
});
