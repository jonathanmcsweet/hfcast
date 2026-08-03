import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parsePower,
  positionOf,
  POWER_STEPS,
  roundPower,
  wattsAt,
} from '../src/data/power.ts';
import { LIMITS } from '../src/store/useStationStore.ts';

/**
 * Power runs from a tenth of a watt to fifteen hundred, four decades, and
 * a slider has to cover all of it. What matters is that both ends are
 * reachable — a linear control cannot reach the QRP end at all — and that
 * a position never means a power the server would clamp.
 */

const range = LIMITS.watts;

describe('the power slider', () => {
  it('reaches both ends exactly', () => {
    assert.equal(wattsAt(0, range), range.min);
    assert.equal(wattsAt(POWER_STEPS, range), range.max);
  });

  it('never leaves the range, whatever position it is given', () => {
    const positions = [-500, 0, 1, 250, 500, 999, POWER_STEPS, 5000];
    const values = positions.map((p) => wattsAt(p, range));
    assert.ok(values.every((w) => w >= range.min && w <= range.max));
  });

  it('rises with the position and never falls', () => {
    const values = Array.from(
      { length: 51 },
      (_, i) => wattsAt(i * (POWER_STEPS / 50), range),
    );
    assert.ok(values.every((w, i) => i === 0 || w >= (values[i - 1] ?? 0)));
  });

  it('gives equal travel to equal decibels, which linear cannot', () => {
    // The reason for the log scale. Half the travel should land near the
    // geometric middle — about 12 W — not near 750 W, where a linear
    // control would put it and leave every QRP setting in the first
    // hundredth of the track.
    const middle = wattsAt(POWER_STEPS / 2, range);
    assert.ok(middle > 5 && middle < 30, `middle was ${middle} W`);
  });

  it('returns a power to its own position', () => {
    const powers = [0.1, 0.5, 1, 5, 10, 100, 400, 1500];
    const returned = powers.map((w) => wattsAt(positionOf(w, range), range));
    assert.deepEqual(returned, powers);
  });
});

describe('rounding to a power somebody would say', () => {
  it('keeps a tenth of a watt where a tenth of a watt matters', () => {
    assert.equal(roundPower(0.47), 0.5);
    assert.equal(roundPower(0.12), 0.1);
  });

  it('widens the steps as the numbers grow', () => {
    // A QRP rig has a half-watt setting; a hundred-watt radio does not
    // have a 101-watt one.
    assert.equal(roundPower(4.87), 5);
    assert.equal(roundPower(37.2), 37);
    assert.equal(roundPower(412), 410);
    assert.equal(roundPower(1487), 1475);
  });
});

describe('typing a power', () => {
  it('leaves a half-typed value alone rather than correcting it', () => {
    // Null means "not a number yet". Returning a fallback would rewrite
    // the field under the reader's fingers as they type "0.5".
    assert.equal(parsePower(''), null);
    assert.equal(parsePower('.'), null);
    assert.equal(parsePower('abc'), null);
    assert.equal(parsePower('-5'), null);
    assert.equal(parsePower('0'), null);
  });

  it('takes a comma as the decimal separator', () => {
    // Most of the world writes it that way, and the keypad offers it.
    assert.equal(parsePower('0,5'), 0.5);
    assert.equal(parsePower('0.5'), 0.5);
  });

  it('accepts the values a QRP operator would enter', () => {
    assert.equal(parsePower('0.5'), 0.5);
    assert.equal(parsePower('5'), 5);
    assert.equal(parsePower(' 100 '), 100);
  });
});
