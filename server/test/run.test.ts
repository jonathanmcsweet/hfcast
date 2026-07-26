/**
 * Checks that concurrent runs do not interfere.
 *
 * voacapl names its antenna scratch files from the antenna index alone, so runs
 * sharing an itshfbc tree overwrite each other. This test fails against an
 * implementation that gives each run only a unique deck filename.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { BANDS_BY_FREQ } from '../src/types.ts';
import { buildDeck } from '../src/voacap/deck.ts';
import { parseVoacapOutput } from '../src/voacap/parse.ts';
import { ITSHFBC_DIR, runVoacap, VOACAPL_BIN } from '../src/voacap/run.ts';

/** The engine is a separate build step, so these are skipped without it. */
const engineMissing = !existsSync(VOACAPL_BIN) || !existsSync(ITSHFBC_DIR);
const skip = engineMissing
  ? `needs voacapl at ${VOACAPL_BIN} and a tree at ${ITSHFBC_DIR}`
  : false;

function deckFor(ssn: number): string {
  return buildDeck({
    fromLat: 47.61,
    fromLon: -122.33,
    toLat: 35.68,
    toLon: 139.77,
    fromLabel: 'Seattle',
    toLabel: 'Tokyo',
    month: 7,
    year: 2026,
    ssn,
    watts: 100,
    requiredSnrDb: 24,
    noiseDbw: 145,
  });
}

test('concurrent runs all succeed', { skip }, async () => {
  const decks = [10, 40, 70, 100, 130, 160, 20, 50].map(deckFor);
  const listings = await Promise.all(decks.map((d) => runVoacap(d)));

  for (const [index, listing] of listings.entries()) {
    const parsed = parseVoacapOutput(listing, BANDS_BY_FREQ);
    assert.equal(
      parsed.cells.length > 0,
      true,
      `run ${index} produced no prediction cells`,
    );
  }
});

test('a run gives the same answer alone as in a crowd', { skip }, async () => {
  const deck = deckFor(70);
  const alone = parseVoacapOutput(await runVoacap(deck), BANDS_BY_FREQ);

  // Identical decks running together must not contaminate each other through
  // the shared scratch files.
  const together = await Promise.all(
    Array.from({ length: 6 }, () => runVoacap(deck)),
  );

  for (const [index, listing] of together.entries()) {
    const parsed = parseVoacapOutput(listing, BANDS_BY_FREQ);
    assert.deepEqual(
      parsed.cells,
      alone.cells,
      `run ${index} disagreed with the same deck run on its own`,
    );
  }
});
