import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BAND_ORDER } from '../../shared/bands.ts';
import { stepsTo } from '../src/data/bandStrip.ts';

/**
 * The band strip has no ends, so how far it moves is not how far apart
 * two bands are in the list. Getting this wrong is invisible in a
 * screenshot and obvious in the hand: the strip takes the long way round
 * and the reader watches eight bands go past to reach the one that was
 * already next to them.
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
    // Five places right through the list is four places left round it.
    assert.equal(stepsTo(at('10m'), at('30m')), -4);
    assert.equal(stepsTo(at('30m'), at('10m')), 4);
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
});
