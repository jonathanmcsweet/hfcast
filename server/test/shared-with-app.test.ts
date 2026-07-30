import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { MODES } from '../src/station.ts';
import {
  SPREAD_FACTOR_LOW,
  SPREAD_FACTOR_UP,
  STORM_WIDENING_CAP,
  STORM_WIDENING_PER_KP,
  STORM_WIDENING_START_KP,
  SWING_FACTOR,
} from '../src/voacap/correct.ts';

/**
 * The app computes predictions itself now, with the engine compiled into the
 * APK, so the same two tables exist on both sides: the correction factors
 * fitted against WSPR reports, and the signal-to-noise each mode needs.
 *
 * They are copies rather than one shared module, and that is a decision with a
 * reason. Metro refuses to resolve anything outside the app's own directory,
 * so shared code has to live inside the app; and TypeScript then reads it as
 * CommonJS while the server is ESM, which it rejects. Making the app a module
 * would mean renaming `metro.config.js` and `babel.config.js`, which is a
 * bundler change to fix a bookkeeping problem.
 *
 * So the copies are pinned here instead. What matters is not that the files
 * look alike — the app's has no listing parser and declares its own row type —
 * but that every fitted number agrees. Two sets of correction factors would
 * give one station two different forecasts depending on which path answered,
 * and nothing on screen would say which it was.
 *
 * If this fails: the numbers were changed on one side. Change them on the
 * other, and say in the commit which evidence moved them.
 */

const appFile = (name: string) =>
  readFileSync(
    path.join(import.meta.dirname, '..', '..', 'hfcast', 'src', 'data', name),
    'utf8',
  );

/** Reads `export const NAME = 1.23;` out of the app's source. */
function constantIn(source: string, name: string): number {
  const match = new RegExp(`export const ${name} = (-?[0-9.]+)`).exec(source);
  assert.ok(match, `the app no longer exports ${name}`);
  return Number(match[1]);
}

describe('the correction factors the app and the server both apply', () => {
  const source = appFile('correct.ts');

  it('agrees on every fitted factor', () => {
    const pairs: readonly [string, number][] = [
      ['SWING_FACTOR', SWING_FACTOR],
      ['SPREAD_FACTOR_LOW', SPREAD_FACTOR_LOW],
      ['SPREAD_FACTOR_UP', SPREAD_FACTOR_UP],
      ['STORM_WIDENING_START_KP', STORM_WIDENING_START_KP],
      ['STORM_WIDENING_PER_KP', STORM_WIDENING_PER_KP],
      ['STORM_WIDENING_CAP', STORM_WIDENING_CAP],
    ];
    assert.deepEqual(
      pairs.map(([name]) => constantIn(source, name)),
      pairs.map(([, value]) => value),
    );
  });
});

describe('the mode table the app and the server both read', () => {
  const source = appFile('modes.ts');

  it('agrees on every mode and every threshold', () => {
    // Parsed out of the app's table rather than imported, for the module
    // reason in the comment above. The shape is fixed by dprint, so a
    // regex over it is stable.
    const found = new Map<string, number>();
    const pattern =
      /(\w+): \{ occupiedHz: [\d_.]+, referenceHz: ([\d_.]+), snrDb: (-?[\d.]+) \}/g;
    for (const match of source.matchAll(pattern)) {
      const [, mode, referenceHz, snrDb] = match;
      if (mode === undefined || referenceHz === undefined) continue;
      // `16_000` is a number to TypeScript and NaN to Number().
      const reference = Number(referenceHz.replace(/_/g, ''));
      found.set(mode, Math.round(Number(snrDb) + 10 * Math.log10(reference)));
    }
    assert.ok(found.size > 0, 'the app table could not be read');

    const mine = new Map(
      Object.entries(MODES).map(([mode, spec]) => [
        mode,
        Math.round(spec.snrDb + 10 * Math.log10(spec.referenceHz)),
      ]),
    );
    assert.deepEqual([...found].sort(), [...mine].sort());
  });
});
