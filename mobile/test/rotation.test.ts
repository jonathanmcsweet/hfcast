import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isTablet, TABLET_WIDTH } from '../src/data/rotation.ts';

/**
 * Which devices may be turned on their side.
 *
 * The rule is about the hardware and not about how the device is being
 * held, so both orientations of one device have to answer alike. Getting
 * that wrong frees a telephone the moment somebody tilts it.
 */

describe('deciding whether a device may rotate', () => {
  it('gives one device the same answer whichever way up it is', () => {
    // A tablet at 601 by 962, the Fire this was found on.
    assert.equal(isTablet(601, 962), true);
    assert.equal(isTablet(962, 601), true);
    // A telephone at 412 by 915. Landscape is wider than the line and
    // must still be a telephone.
    assert.equal(isTablet(412, 915), false);
    assert.equal(isTablet(915, 412), false);
  });

  it('takes the line itself as wide enough', () => {
    assert.equal(isTablet(TABLET_WIDTH, 900), true);
    assert.equal(isTablet(TABLET_WIDTH - 1, 900), false);
  });

  it('is the line the dialogs use as well', () => {
    // `ModalFrame` reads `TABLET_WIDTH` for the same decision, so this
    // holds the number itself: 600 is Android's `sw600dp` and Material's
    // compact breakpoint, and moving it would move both.
    assert.equal(TABLET_WIDTH, 600);
  });
});
