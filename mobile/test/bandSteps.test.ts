import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BAND_ORDER } from '../../shared/bands.ts';
import {
  CHIP_WIDTH,
  COPY_WIDTH,
  LEN,
  MAX_STRIP_WIDTH,
  showsTwice,
  stepsTo,
  STRIDE,
} from '../src/data/bandStrip.ts';

/**
 * The band strip has no ends, so how far it moves is not how far apart
 * two bands sit in the list. Wrong is invisible in a screenshot and
 * obvious in the hand: nine bands go past to reach the neighbour.
 */

const at = (band: string) => BAND_ORDER.indexOf(band as never);

describe('how far the band strip moves', () => {
  it('goes one place between the two ends of the list', () => {
    // 160m is last and 10m is first, and the strip puts them side by
    // side. This is the case that sent it the long way round.
    assert.equal(stepsTo(at('160m'), at('10m')), 1);
    assert.equal(stepsTo(at('10m'), at('160m')), -1);
  });

  it('does not move for the band already shown', () => {
    assert.equal(stepsTo(at('20m'), at('20m')), 0);
  });

  it('goes the short way whichever side it is on', () => {
    assert.equal(stepsTo(at('10m'), at('12m')), 1);
    assert.equal(stepsTo(at('12m'), at('10m')), -1);
    // Four places forward beats six places back round the other side.
    assert.equal(stepsTo(at('10m'), at('20m')), 4);
    assert.equal(stepsTo(at('20m'), at('10m')), -4);
  });

  it('settles a tie the same way every time', () => {
    // An even-length list has an exact opposite, the same distance
    // either way. Either is correct; holding to one stops the strip
    // going left one time and right the next from the same pair.
    if (LEN % 2 === 1) return;
    const half = LEN / 2;
    for (const from of BAND_ORDER.keys()) {
      const opposite = (from + half) % LEN;
      assert.equal(stepsTo(from, opposite), -half);
    }
  });

  it('never moves further than half the list', () => {
    const half = Math.floor(BAND_ORDER.length / 2);
    for (const from of BAND_ORDER.keys()) {
      for (const to of BAND_ORDER.keys()) {
        const steps = stepsTo(from, to);
        assert.ok(
          Math.abs(steps) <= half,
          `${from} to ${to} moved ${steps}, more than ${half}`,
        );
      }
    }
  });

  it('lands on the band it was asked for', () => {
    // The move is applied by adding the steps and wrapping, so this is
    // the property the strip actually relies on.
    const len = BAND_ORDER.length;
    for (const from of BAND_ORDER.keys()) {
      for (const to of BAND_ORDER.keys()) {
        const landed = ((from + stepsTo(from, to)) % len + len) % len;
        assert.equal(landed, to);
      }
    }
  });

  it('is never drawn wide enough to show a band twice', () => {
    // What broke in a browser: two copies on screen at once reads as a
    // broken list, not an endless one.
    assert.equal(showsTwice(MAX_STRIP_WIDTH), false);
    assert.equal(showsTwice(COPY_WIDTH), true);
    // And the cap is not so tight that the strip stops being a list.
    assert.ok(MAX_STRIP_WIDTH >= 4 * STRIDE);
  });

  it('keeps the cap a whole number of chips', () => {
    // The snap counts in strides, so a cap that is not a multiple of
    // one leaves the resting position off centre.
    assert.equal(MAX_STRIP_WIDTH % STRIDE, 0);
    assert.equal(COPY_WIDTH, LEN * STRIDE);
    assert.ok(CHIP_WIDTH < STRIDE);
  });
});
