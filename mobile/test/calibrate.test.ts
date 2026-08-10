import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  candidatesFor,
  chooseThreads,
  freshEnough,
  PROBE_BUDGET_MS,
  PROBE_LATTICES,
  probeLattice,
  REMEASURE_AFTER_MS,
} from '../src/data/calibrateMath.ts';

/**
 * The calibration exists because the devices this app is for are
 * nothing alike — see "Who the users are" in AGENTS.md. A modern
 * nine-core phone measured fastest at four threads with eight slower
 * than two; an old four-core tablet may peak at two; a desktop scales
 * to eight. These tests hold the decisions that turn one device's
 * readings into that device's own number.
 */

describe('which thread counts a device tries', () => {
  it('gives a big phone two, four and eight', () => {
    assert.deepEqual(candidatesFor(9), [2, 4, 8]);
    assert.deepEqual(candidatesFor(16), [2, 4, 8]);
  });

  it('gives an old four-core tablet two and four', () => {
    // The Fire HD 7 shape: four slow, equal cores. Whether four
    // threads help there at all is exactly what the probe answers.
    assert.deepEqual(candidatesFor(4), [2, 4]);
  });

  it('gives middling devices their own core count as the top', () => {
    assert.deepEqual(candidatesFor(6), [2, 4, 6]);
    assert.deepEqual(candidatesFor(3), [2, 3]);
  });

  it('offers a two-core device nothing to compare', () => {
    // One candidate is no comparison, and `calibrate` skips the device
    // rather than spending its battery to learn nothing.
    assert.deepEqual(candidatesFor(2), [2]);
    assert.deepEqual(candidatesFor(1), []);
    assert.deepEqual(candidatesFor(Number.NaN), []);
  });
});

describe('how much work a device is probed with', () => {
  it('gives a fast device the full grid', () => {
    // A modern phone measured about 0.0075 ms a point.
    const picked = probeLattice(0.0075);
    assert.equal(picked.points, 34560);
  });

  it('gives a slow tablet the small lattice', () => {
    // An old tablet can be a hundred times slower than a desktop core.
    // It still calibrates — on 1,728 points, not 34,560.
    const picked = probeLattice(1.0);
    assert.equal(picked.points, 1728);
  });

  it('never exceeds the budget where a smaller lattice fits it', () => {
    for (const pointMs of [0.001, 0.02, 0.1, 0.5]) {
      const picked = probeLattice(pointMs);
      const larger = PROBE_LATTICES.filter((each) =>
        each.points > picked.points
      );
      for (const grid of larger) {
        assert.ok(
          grid.points * pointMs > PROBE_BUDGET_MS,
          `${pointMs} ms/point should not fit ${grid.points} points`,
        );
      }
    }
  });
});

describe('which reading is believed', () => {
  it('moves to a count that is clearly faster', () => {
    const threads = chooseThreads([
      { threads: 2, nativeMs: 2000 },
      { threads: 4, nativeMs: 1700 },
      { threads: 8, nativeMs: 2200 },
    ], 8);
    assert.equal(threads, 4);
  });

  it('keeps the current count against a narrow win', () => {
    // Readings wobble with heat and background work. A number that
    // flapped between four and eight on noise would be worse than
    // either, so a challenger has to win by more than a tenth.
    const threads = chooseThreads([
      { threads: 4, nativeMs: 1950 },
      { threads: 8, nativeMs: 2000 },
    ], 8);
    assert.equal(threads, 8);
  });

  it('takes the fastest when the current count was not measured', () => {
    const threads = chooseThreads([
      { threads: 2, nativeMs: 900 },
      { threads: 4, nativeMs: 1100 },
    ], 6);
    assert.equal(threads, 2);
  });

  it('keeps the current count when nothing was measured', () => {
    assert.equal(chooseThreads([], 4), 4);
  });
});

describe('when a measurement is taken again', () => {
  const measured = { cores: 9, version: '0.61.0', at: 1_000_000 };

  it('stands on the same device and build', () => {
    assert.ok(freshEnough(measured, 9, '0.61.0', 1_000_001));
  });

  it('is retaken when the app version changes', () => {
    // A new version may carry a different engine.
    assert.ok(!freshEnough(measured, 9, '0.61.1', 1_000_001));
  });

  it('is retaken when the core count changes', () => {
    // A different count means a different device reading the same
    // storage — a restored backup, for one.
    assert.ok(!freshEnough(measured, 8, '0.61.0', 1_000_001));
  });

  it('is retaken after it goes stale', () => {
    assert.ok(
      !freshEnough(measured, 9, '0.61.0', 1_000_000 + REMEASURE_AFTER_MS + 1),
    );
  });
});
