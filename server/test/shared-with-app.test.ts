import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { INVERTED_V_HEIGHT_FRACTION } from '../src/antenna.ts';
import { LAT_STEP, LON_STEP, REACHABLE } from '../src/coverage.ts';
import {
  PATCH_HALF_LAT_DEG,
  PATCH_LAT_STEP,
  PATCH_LON_STEP,
  PATCH_MAX_HALF_LON_DEG,
} from '../src/coveragePatch.ts';
import { MODES } from '../src/station.ts';
import {
  SPREAD_FACTOR_LOW,
  SPREAD_FACTOR_UP,
  STORM_WIDENING_CAP,
  STORM_WIDENING_PER_KP,
  STORM_WIDENING_START_KP,
  SWING_FACTOR,
} from '../src/voacap/correct.ts';
import { MIN_SHARD_POINTS } from '../src/voacap/shard.ts';

/**
 * The app computes predictions and coverage maps itself now, with the engine
 * compiled into the APK, so the same three tables exist on both sides: the
 * correction factors fitted against WSPR reports, the signal-to-noise each
 * mode needs, and the grid a coverage map is run on.
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

describe('the coverage grid the app and the server both run', () => {
  const source = appFile('coverageGrid.ts');

  it('agrees on the cell size and the reach threshold', () => {
    // The response carries the steps it was run on, so a mismatch would not
    // misplace a cell. What it would do is make one path's map coarser than
    // the other's, and make the reach percentages beside them not comparable.
    const pairs: readonly [string, number][] = [
      ['LAT_STEP', LAT_STEP],
      ['LON_STEP', LON_STEP],
      ['REACHABLE', REACHABLE],
    ];
    assert.deepEqual(
      pairs.map(([name]) => constantIn(source, name)),
      pairs.map(([, value]) => value),
    );
  });
});

describe('the fine grid the app and the server both run', () => {
  const source = appFile('coveragePatch.ts');

  it('agrees on the cell size and how far the rectangle reaches', () => {
    // A patch is a window on the coarse lattice, and it is only that if
    // both sides use the same step: a different one on either side would
    // put the fine cells across the coarse cells rather than inside them,
    // and the two paths would draw visibly different maps.
    const pairs: readonly [string, number][] = [
      ['PATCH_LAT_STEP', PATCH_LAT_STEP],
      ['PATCH_LON_STEP', PATCH_LON_STEP],
      ['PATCH_HALF_LAT_DEG', PATCH_HALF_LAT_DEG],
      ['PATCH_MAX_HALF_LON_DEG', PATCH_MAX_HALF_LON_DEG],
    ];
    assert.deepEqual(
      pairs.map(([name]) => constantIn(source, name)),
      pairs.map(([, value]) => value),
    );
  });

  it('holds the whole geometry identical, not only the constants', () => {
    // Stronger than the pins above and the reason they are not enough.
    // Naming each constant catches a changed number; it does not catch
    // a changed rule — which cell the rectangle snaps to, which edge is
    // sent to the engine, how a grid is named for the cache. Those are
    // arithmetic rather than values, and either side drifting would put
    // the two paths on different grids while every pinned number still
    // agreed.
    //
    // Everything from the marker down is copied character for
    // character. Above it the two differ, and have to: the app imports
    // without file extensions and the server with them.
    const marker = 'export const PATCH_LAT_STEP';
    const mine = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'coveragePatch.ts'),
      'utf8',
    );
    assert.ok(source.includes(marker) && mine.includes(marker));
    assert.equal(
      mine.slice(mine.indexOf(marker)),
      source.slice(source.indexOf(marker)),
    );
  });
});

describe('the strips both sides cut a big grid into', () => {
  const source = appFile('shard.ts');

  it('agrees on when a grid is worth splitting', () => {
    assert.equal(constantIn(source, 'MIN_SHARD_POINTS'), MIN_SHARD_POINTS);
  });

  it('holds the whole cut identical, not only the threshold', () => {
    // The threshold is the least of it. What matters is where the cut
    // lands: the engine snaps a rectangle to its own lattice, and a
    // strip edge sitting a hair off a cell centre either runs a row
    // twice or drops it. The server splits across processes and the app
    // across threads, but both must reproduce the grid one run would
    // have produced — so the arithmetic is copied, not reimplemented.
    const marker = 'export const MIN_SHARD_POINTS';
    const mine = readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'voacap', 'shard.ts'),
      'utf8',
    );
    assert.ok(source.includes(marker) && mine.includes(marker));
    assert.equal(
      mine.slice(mine.indexOf(marker)),
      source.slice(source.indexOf(marker)),
    );
  });
});

describe('the inverted V approximation both sides apply', () => {
  const source = appFile('antennaFile.ts');

  it('reduces the apex height by the same fraction', () => {
    // VOACAP has no inverted V, so this number is the whole of the
    // decision. Two of them would give one station two forecasts
    // depending on which path answered, with nothing on screen saying
    // which — and the help text names the percentage, so one side would
    // also be explaining the other side's arithmetic.
    assert.equal(
      constantIn(source, 'INVERTED_V_HEIGHT_FRACTION'),
      INVERTED_V_HEIGHT_FRACTION,
    );
  });
});
