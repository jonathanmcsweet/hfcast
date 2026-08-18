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

import { FINE_LAT_STEP, FINE_LON_STEP } from '../src/coverage.ts';
import { BANDS_BY_FREQ } from '../src/types.ts';
import { PREDICT_BIN, runCoverage, runEngine } from '../src/voacap/engine.ts';
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

test('the operating window arrives as 24 hours of frequencies', {
  skip: !available,
}, async () => {
  const { window } = await runEngine(FIXTURE_REQUEST);
  assert.ok(window, 'the Rust path must supply a window');
  for (const key of ['fotByHour', 'hpfByHour', 'lufByHour'] as const) {
    assert.equal(window[key].length, 24, key);
    for (const value of window[key]) {
      assert.ok(
        value === null || (typeof value === 'number' && value > 0),
        `${key} holds ${value}, which is neither absent nor a frequency`,
      );
    }
  }
});

test('the window is ordered LUF below FOT below MUF', {
  skip: !available,
}, async () => {
  // The point of the display is that these bound each other. If the
  // three curves were ever read out of the table in the wrong columns,
  // every value would still look plausible on its own and only the
  // ordering would give it away.
  const { window, mufByHour } = await runEngine(FIXTURE_REQUEST);
  assert.ok(window, 'the prediction must supply a window');
  let compared = 0;
  for (let hour = 0; hour < 24; hour++) {
    // Annotated: `assert.ok` is overloaded in @types/node 26, so an
    // assertion that mentions one of these values needs its type before
    // the type can be inferred from the initializer.
    const fot: number | null | undefined = window.fotByHour[hour];
    const hpf: number | null | undefined = window.hpfByHour[hour];
    const luf: number | null | undefined = window.lufByHour[hour];
    const muf = mufByHour[hour];
    if (fot === null || fot === undefined || muf === undefined) continue;
    compared++;
    assert.ok(fot <= muf, `hour ${hour}: FOT ${fot} above MUF ${muf}`);
    assert.ok(
      hpf !== null && hpf !== undefined && hpf >= fot,
      `hour ${hour}: HPF below FOT`,
    );
    if (luf !== null && luf !== undefined) {
      assert.ok(luf <= fot, `hour ${hour}: LUF ${luf} above FOT ${fot}`);
    }
  }
  assert.ok(compared >= 20, `only ${compared} hours had an FOT`);
});

test('a long path at low power reports no LUF rather than a wrong one', {
  skip: !available,
}, async () => {
  // Seattle to Tokyo at 100 W meets the 24 dB requirement at no
  // frequency, and the engine says so with a negative LUF. Reading that
  // as a number would put a 1 MHz floor on the chart that no equipment
  // could use.
  const { window } = await runEngine(FIXTURE_REQUEST);
  assert.ok(window);
  assert.ok(
    window.lufByHour.every((luf) => luf === null || luf > 0),
    'a negative LUF reached the caller',
  );
});

test('a refused request reports why', { skip: !available }, async () => {
  await assert.rejects(
    runEngine({ ...FIXTURE_REQUEST, month: 13 }),
    /month/,
  );
});

/**
 * A split grid against a whole one.
 *
 * The strips are worked out in `src/voacap/shard.ts` and tested there
 * without an engine, but arithmetic that looks right can still ask the
 * engine for the wrong rows. This is the check that the answer is the
 * same: every point, in the same order, to the same digits.
 */
test('a split grid is the same grid', { skip: !available }, async () => {
  const request = {
    fromLat: 47.61,
    fromLon: -122.33,
    month: 7,
    year: 2026,
    ssn: 100,
    watts: 100,
    requiredSnrDb: 24,
    noiseDbw: 145,
    hour: 14,
    band: '40m' as const,
    latStep: 2.5,
    lonStep: 3.75,
  };

  const whole = await runCoverage(request, 1);
  const split = await runCoverage(request, 4);

  assert.equal(whole.points.length, 6912);
  // Order included, not only membership: the strips are concatenated
  // south to north because that is the order one run emits its rows in.
  assert.deepEqual(split.points, whole.points);
  assert.equal(split.latStep, whole.latStep);
  assert.equal(split.lonStep, whole.lonStep);
  // A whole-world request reports no rectangle, split or not. The
  // strips are the engine layer's business, not its caller's.
  assert.equal(split.latMin, undefined);
});

test(
  'the fine globe is the same grid split four ways',
  { skip: !available },
  async () => {
    // The configuration the device actually runs: the whole world at the
    // fine step, cut into four strips because a phone has cores the
    // engine's single process cannot use. The app cuts it with a
    // character-for-character copy of the same arithmetic, so proving it
    // here proves it for both paths.
    const request = {
      fromLat: 27.6,
      fromLon: -80.4,
      month: 7,
      year: 2026,
      ssn: 40,
      watts: 100,
      requiredSnrDb: 24,
      noiseDbw: -145,
      hour: 16,
      band: '30m' as const,
      latStep: FINE_LAT_STEP,
      lonStep: FINE_LON_STEP,
    };

    const whole = await runCoverage(request, 1);
    const split = await runCoverage(request, 4);

    assert.equal(whole.points.length, 34560);
    // Point for point and in order, which is what the app's columnar
    // packing depends on: it stores no coordinates and computes them
    // from each point's place in the array.
    assert.deepEqual(split.points, whole.points);
  },
);
