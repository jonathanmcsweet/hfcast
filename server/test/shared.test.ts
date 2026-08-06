import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as sharedAntenna from '../../shared/antenna.ts';
import * as sharedCorrect from '../../shared/correct.ts';
import * as sharedGrid from '../../shared/coverageGrid.ts';
import * as sharedModes from '../../shared/modes.ts';
import { ANTENNA_ORDER, INVERTED_V_HEIGHT_FRACTION } from '../src/antenna.ts';
import { LAT_STEP, LON_STEP, REACHABLE } from '../src/coverage.ts';
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
 * The physics the app and this server both apply.
 *
 * Both compute forecasts — the app with the engine compiled in, this one
 * for the web build — so the correction factors, the mode thresholds, the
 * antenna rules and the coverage lattice have to be the same numbers. Two
 * sets give one station two forecasts depending on which path answered,
 * and nothing on screen says which it was.
 *
 * This file used to check that by reading the app's TypeScript as text:
 * constants pulled out with regular expressions, the mode table parsed
 * with a pattern that depended on the formatter, and two files compared
 * character for character from a marker to the end. It caught a changed
 * number in the five files it named. It did not catch `ANTENNA_ORDER`,
 * which it did not name and which had drifted, and it did not catch the
 * power ceiling, which the app documented as this server's and was not.
 *
 * There is one copy now, in `shared/`, and the compiler is the check. What
 * is left here is the part a shared module cannot do for itself: hold the
 * fitted numbers to the evidence that produced them, so a change to one of
 * them is deliberate and arrives with a reason.
 */

describe('what this server exports is what shared holds', () => {
  it('reaches the one copy, not a second one that agrees today', () => {
    // Identity, not equality. Two modules with the same numbers pass an
    // equality check and are exactly the arrangement this replaced.
    assert.equal(SWING_FACTOR, sharedCorrect.SWING_FACTOR);
    assert.equal(MODES, sharedModes.MODES);
    assert.equal(ANTENNA_ORDER, sharedAntenna.ANTENNA_ORDER);
    assert.equal(LAT_STEP, sharedGrid.LAT_STEP);
    assert.equal(LON_STEP, sharedGrid.LON_STEP);
    assert.equal(REACHABLE, sharedGrid.REACHABLE);
    assert.equal(
      INVERTED_V_HEIGHT_FRACTION,
      sharedAntenna.INVERTED_V_HEIGHT_FRACTION,
    );
  });
});

describe('the fitted correction factors', () => {
  it('are the values the WSPR calibration produced', () => {
    // Fitted on 2025-06 and validated out of sample on seven other months
    // — hfcast-engine/docs/accuracy.md and docs/reliability.md. Changing
    // one of these changes every forecast the product gives, so it should
    // fail here and arrive with the evidence that moved it.
    assert.equal(SWING_FACTOR, 0.25);
    assert.equal(SPREAD_FACTOR_LOW, 0.4);
    assert.equal(SPREAD_FACTOR_UP, 0.59);
  });

  it('widen the downward spread after a storm, and only downward', () => {
    // hfcast-engine/docs/storm.md: quiet below Kp 5, about 1.4 times wider
    // after Kp 5-6, about 2 after 6-7, about 2.5 after 7 and up.
    assert.equal(STORM_WIDENING_START_KP, 4.75);
    assert.equal(STORM_WIDENING_PER_KP, 0.5);
    assert.equal(STORM_WIDENING_CAP, 2.5);

    const quiet = sharedCorrect.factorsFor(null);
    const stormy = sharedCorrect.factorsFor(7);
    assert.ok(stormy.spreadLow > quiet.spreadLow);
    assert.equal(stormy.spreadUp, quiet.spreadUp);
    assert.equal(stormy.swing, quiet.swing);
  });
});

describe('the mode table', () => {
  it('reproduces VOACAP for CW and SSB', () => {
    // Every other VOACAP tool reports 24 dB and 38 dB in 1 Hz. Disagreeing
    // with them silently would be worse than being slightly off.
    assert.equal(sharedModes.requiredSnrFor('cw'), 24);
    assert.equal(sharedModes.requiredSnrFor('ssb'), 38);
  });

  it('quotes the weak-signal modes in their published reference', () => {
    // FT8, JS8 and WSPR sensitivities are published in 2500 Hz, which is
    // what an operator reads in their own decoder. Converting from the
    // 50 Hz they occupy would disagree with that by about 17 dB.
    for (const mode of ['ft8', 'js8', 'wspr'] as const) {
      assert.equal(sharedModes.MODES[mode].referenceHz, 2500);
    }
  });

  it('lists every mode it has a threshold for', () => {
    assert.deepEqual(
      [...sharedModes.MODE_ORDER].sort(),
      Object.keys(sharedModes.MODES).sort(),
    );
  });
});

describe('the antenna families', () => {
  it('lists every family it can name and place', () => {
    // The order is what the picker shows and what the rejection message
    // prints. It had drifted between the two projects while both comments
    // claimed it was the picker's.
    assert.deepEqual([...ANTENNA_ORDER], [
      'isotropic',
      'dipole',
      'invertedV',
      'vertical',
      'invertedL',
      'yagi',
    ]);
  });

  it('reduces an inverted V to four fifths of its apex', () => {
    // The help text names the percentage, so a second value would have one
    // side explaining the other side's arithmetic.
    assert.equal(INVERTED_V_HEIGHT_FRACTION, 0.8);
    assert.equal(
      sharedAntenna.effectiveHeightM({
        type: 'invertedV',
        heightM: 10,
        gainDbd: 0,
        beamDeg: 0,
      }),
      8,
    );
  });

  it('gives a bearing only to the families that have one', () => {
    // Measured against the engine: a dipole swings 12 dB over the compass
    // and a vertical monopole swings none, so sending a bearing for the
    // vertical would key a cache on a number nothing reads.
    assert.equal(sharedAntenna.usesBeam('vertical'), false);
    assert.equal(sharedAntenna.usesBeam('dipole'), true);
    assert.equal(sharedAntenna.usesGain('yagi'), true);
    assert.equal(sharedAntenna.usesGain('dipole'), false);
    assert.equal(sharedAntenna.usesHeight('isotropic'), false);
  });

  it('offers the power range the control in the app offers', () => {
    assert.equal(sharedAntenna.MIN_WATTS, 0.1);
    assert.equal(sharedAntenna.MAX_WATTS, 1500);
  });
});

describe('the grids', () => {
  it('runs the coarse map on 192 points', () => {
    assert.equal(LAT_STEP, 15);
    assert.equal(LON_STEP, 22.5);
    assert.equal((180 / LAT_STEP) * (360 / LON_STEP), 192);
  });

  it('splits a grid only when splitting pays', () => {
    // Each strip re-reads the coefficient tables, about 16 ms, so below
    // this the fixed cost is most of the run.
    assert.equal(MIN_SHARD_POINTS, 2000);
  });
});
