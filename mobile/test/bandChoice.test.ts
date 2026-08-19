import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BAND_ORDER, type BandKey } from '../../shared/bands.ts';
import { BANDS_BEFORE_60M, withNewBands } from '../src/data/bandChoice.ts';

/**
 * 60m arrived after people had already chosen which bands to compute
 * maps for (2026-08-18). What their choice means is the whole question:
 * somebody who had all of them meant all of them, and somebody who had
 * three meant those three.
 */

const withoutSixty = BANDS_BEFORE_60M;

describe('a saved band choice meeting a new band', () => {
  it('grows when every band was chosen', () => {
    assert.deepEqual(withNewBands(withoutSixty), BAND_ORDER);
  });

  it('is left alone when only some were chosen', () => {
    const few: readonly BandKey[] = ['20m', '40m'];
    assert.deepEqual(withNewBands(few), few);
  });

  it('is left alone when it already holds the new band', () => {
    assert.deepEqual(withNewBands(BAND_ORDER), BAND_ORDER);
  });

  it('falls back to every band when nothing was saved', () => {
    assert.deepEqual(withNewBands(undefined), BAND_ORDER);
  });

  it('does not treat a same-sized different choice as everything', () => {
    // As many bands as the old list held, but not the old list. A first
    // attempt compared lengths and got this wrong — and got every
    // narrower selection wrong with it.
    const odd: readonly BandKey[] = [
      ...withoutSixty.slice(0, -1),
      '60m' as BandKey,
    ];
    assert.deepEqual(withNewBands(odd), odd);
  });

  it('grows a choice that already took everything, new band included', () => {
    assert.deepEqual(withNewBands(BAND_ORDER), BAND_ORDER);
  });
});
