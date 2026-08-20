/**
 * Checks the empirical swing correction and its reliability recomputation.
 *
 * The first test is the important one: with no correction applied (factor
 * 1), the decile formula must reproduce the engine's own printed
 * reliability from the engine's own numbers. If it does, applying the
 * same formula after the correction stays consistent with the engine
 * rather than becoming a second model.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { BANDS_BY_FREQ } from '../src/types.ts';
import {
  correctCells,
  factorsFor,
  phi,
  stormWidening,
  SWING_FACTOR,
} from '../src/voacap/correct.ts';
import { parseVoacapOutput } from '../src/voacap/parse.ts';
import { FIXTURE_PATH, FIXTURE_REQUEST } from './fixtureRequest.ts';

const fixture = readFileSync(FIXTURE_PATH, 'utf8');

/** What the fixture's SYSTEM card asked for, echoed in its header. */
const FIXTURE_REQUIRED_SNR = FIXTURE_REQUEST.requiredSnrDb;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

test('phi matches the two anchor points that matter', () => {
  // The median day, and the definition of a decile.
  assert.ok(Math.abs(phi(0) - 0.5) < 1e-9);
  assert.ok(Math.abs(phi(1.2816) - 0.9) < 1e-3);
  assert.ok(Math.abs(phi(-1.2816) - 0.1) < 1e-3);
});

test('with factor 1, recomputed reliability matches the engine', () => {
  const { cells } = parseVoacapOutput(fixture, BANDS_BY_FREQ);
  const withDeciles = cells.filter(
    (c) => c.snrLowDecile !== null && c.snrUpDecile !== null,
  );
  assert.ok(withDeciles.length > 100, 'fixture provides decile rows');

  const recomputed = correctCells(withDeciles, FIXTURE_REQUIRED_SNR, {
    swing: 1,
    spreadLow: 1,
    spreadUp: 1,
  });
  const differences = recomputed.map((cell, i) => {
    const engine = withDeciles[i]?.reliability ?? assert.fail('same length');
    return Math.abs(cell.reliability - engine);
  });

  // The listing rounds reliability to two decimals and the deciles to one,
  // so exact agreement is impossible; close agreement everywhere is the bar.
  assert.ok(
    median(differences) < 0.02,
    `median difference ${median(differences)}`,
  );
  const worst = Math.max(...differences);
  assert.ok(worst < 0.12, `worst difference ${worst}`);
});

test('the correction shrinks each band toward its own centre', () => {
  const { cells } = parseVoacapOutput(fixture, BANDS_BY_FREQ);
  const corrected = correctCells(cells, FIXTURE_REQUIRED_SNR);

  const bands = [...new Set(cells.map((c) => c.band))];
  for (const band of bands) {
    const raw = cells.filter((c) => c.band === band).map((c) => c.snr);
    const shrunk = corrected.filter((c) => c.band === band).map((c) => c.snr);
    const rawSwing = Math.max(...raw) - Math.min(...raw);
    const newSwing = Math.max(...shrunk) - Math.min(...shrunk);
    if (rawSwing === 0) continue;
    assert.ok(
      Math.abs(newSwing - SWING_FACTOR * rawSwing) < 1e-9,
      `${band}: swing ${rawSwing} became ${newSwing}`,
    );
  }
});

test('quiet hours become less dead, strong hours less inflated', () => {
  const { cells } = parseVoacapOutput(fixture, BANDS_BY_FREQ);
  // Spread factors held neutral so this test sees the swing alone.
  const corrected = correctCells(cells, FIXTURE_REQUIRED_SNR, {
    swing: SWING_FACTOR,
    spreadLow: 1,
    spreadUp: 1,
  });

  let raisedWeak = 0;
  let loweredStrong = 0;
  for (const [i, cell] of cells.entries()) {
    const after = corrected[i];
    if (after === undefined) continue;
    if (after.snr > cell.snr && after.reliability >= cell.reliability - 1e-9) {
      raisedWeak += 1;
    }
    if (after.snr < cell.snr) loweredStrong += 1;
  }
  // The exact split depends on the circuit; both directions must occur.
  assert.ok(raisedWeak > 50, `${raisedWeak} below-centre cells came up`);
  assert.ok(
    loweredStrong > 50,
    `${loweredStrong} above-centre cells came down`,
  );
});

test('narrower spread makes the answer more decisive', () => {
  // A single-cell band keeps its own SNR (it is its own centre), so only the
  // spread factors act. Days differ from each other less than the engine
  // claims, so a margin above the requirement should read as more certain,
  // and a shortfall below it as more certainly closed.
  const cell = (snr: number) => [
    {
      hour: 1,
      band: '20m' as const,
      reliability: 0.5,
      snr,
      snrLowDecile: 16,
      snrUpDecile: 16,
      takeoffAngleDeg: 12,
    },
  ];
  const neutral = { swing: 1, spreadLow: 1, spreadUp: 1 };
  const sharpened = { swing: 1, spreadLow: 0.4, spreadUp: 0.59 };

  const above = FIXTURE_REQUIRED_SNR + 6;
  const rawAbove = correctCells(cell(above), FIXTURE_REQUIRED_SNR, neutral);
  const scaledAbove = correctCells(
    cell(above),
    FIXTURE_REQUIRED_SNR,
    sharpened,
  );
  assert.ok(
    (scaledAbove[0]?.reliability ?? 0) > (rawAbove[0]?.reliability ?? 1),
    'a 6 dB margin should become more certain',
  );

  const below = FIXTURE_REQUIRED_SNR - 6;
  const rawBelow = correctCells(cell(below), FIXTURE_REQUIRED_SNR, neutral);
  const scaledBelow = correctCells(
    cell(below),
    FIXTURE_REQUIRED_SNR,
    sharpened,
  );
  assert.ok(
    (scaledBelow[0]?.reliability ?? 1) < (rawBelow[0]?.reliability ?? 0),
    'a 6 dB shortfall should become more certainly closed',
  );
});

test('storm widening follows the measured gradient', () => {
  // Quiet conditions leave the calibration alone.
  assert.equal(stormWidening(0), 1);
  assert.equal(stormWidening(4.75), 1);
  // The measured slope: about half a unit of widening per Kp step.
  assert.ok(Math.abs(stormWidening(5.5) - 1.375) < 1e-9);
  assert.ok(Math.abs(stormWidening(6.5) - 1.875) < 1e-9);
  // Capped where the measurements end.
  assert.equal(stormWidening(9), 2.5);
});

test('a recent storm makes an open band less certain, not more', () => {
  // A single-cell band is its own centre, so only spread factors act.
  const cell = [
    {
      hour: 1,
      band: '20m' as const,
      reliability: 0.5,
      snr: FIXTURE_REQUIRED_SNR + 6,
      snrLowDecile: 16,
      snrUpDecile: 16,
      takeoffAngleDeg: 12,
    },
  ];
  const quiet = correctCells(cell, FIXTURE_REQUIRED_SNR, factorsFor(2));
  const storm = correctCells(cell, FIXTURE_REQUIRED_SNR, factorsFor(7));
  assert.deepEqual(quiet, correctCells(cell, FIXTURE_REQUIRED_SNR));
  assert.ok(
    (storm[0]?.reliability ?? 1) < (quiet[0]?.reliability ?? 0),
    'the storm answer must be less confident',
  );

  // Below the requirement the upward decile decides, and storms do not
  // widen it: the "band closed" answer stays as certain as on a quiet day.
  const closed = cell.map((c) => ({ ...c, snr: FIXTURE_REQUIRED_SNR - 6 }));
  const quietClosed = correctCells(closed, FIXTURE_REQUIRED_SNR, factorsFor(2));
  const stormClosed = correctCells(closed, FIXTURE_REQUIRED_SNR, factorsFor(7));
  assert.equal(quietClosed[0]?.reliability, stormClosed[0]?.reliability);
});

test('the take-off angle passes through the correction untouched', () => {
  // The correction moves the signal median and rescales the deciles. The
  // angle is geometry and has nothing to do with either, so a client can
  // trust it to be the engine's own number rather than a corrected one.
  const cells = [
    {
      hour: 1,
      band: '20m' as const,
      reliability: 0.5,
      snr: 30,
      snrLowDecile: 16,
      snrUpDecile: 16,
      takeoffAngleDeg: 84.3,
    },
    {
      hour: 2,
      band: '20m' as const,
      reliability: 0.5,
      snr: 40,
      snrLowDecile: 16,
      snrUpDecile: 16,
      takeoffAngleDeg: null,
    },
  ];
  const corrected = correctCells(cells, FIXTURE_REQUIRED_SNR);
  assert.equal(corrected[0]?.takeoffAngleDeg, 84.3);
  assert.equal(corrected[1]?.takeoffAngleDeg, null);
  assert.notEqual(corrected[0]?.snr, cells[0]?.snr);
});

test('cells without deciles keep the engine reliability', () => {
  const bare = [
    {
      hour: 1,
      band: '20m' as const,
      reliability: 0.42,
      snr: 30,
      snrLowDecile: null,
      snrUpDecile: null,
      takeoffAngleDeg: null,
    },
  ];
  const corrected = correctCells(bare, FIXTURE_REQUIRED_SNR);
  assert.equal(corrected[0]?.reliability, 0.42);
});
