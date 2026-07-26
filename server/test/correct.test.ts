/**
 * Checks the empirical swing correction and its reliability recomputation.
 *
 * The important test is the first one: with no correction applied (factor 1),
 * the decile formula must reproduce the engine's own printed reliability from
 * the engine's own numbers. If it does, applying the same formula after the
 * correction is consistent with the engine rather than a second model. If it
 * did not, the whole recomputation approach would be unsound.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { BANDS_BY_FREQ } from '../src/types.ts';
import { correctCells, phi, SWING_FACTOR } from '../src/voacap/correct.ts';
import { parseVoacapOutput } from '../src/voacap/parse.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  path.join(here, 'fixtures/seattle-tokyo-jul2026-ssn68.out'),
  'utf8',
);

/** The fixture's SYSTEM card asked for this, echoed in its header. */
const FIXTURE_REQUIRED_SNR = 24;

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

  const recomputed = correctCells(withDeciles, FIXTURE_REQUIRED_SNR, 1);
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
  const corrected = correctCells(cells, FIXTURE_REQUIRED_SNR);

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

test('cells without deciles keep the engine reliability', () => {
  const bare = [
    {
      hour: 1,
      band: '20m' as const,
      reliability: 0.42,
      snr: 30,
      snrLowDecile: null,
      snrUpDecile: null,
    },
  ];
  const corrected = correctCells(bare, FIXTURE_REQUIRED_SNR);
  assert.equal(corrected[0]?.reliability, 0.42);
});
