import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isTablet,
  isWideLayout,
  TABLET_WIDTH,
  WIDE_WIDTH,
} from '../src/data/rotation.ts';

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

/**
 * Whether the band grid sits beside the map card or below it.
 *
 * This one reads the current width and not the smallest side, because it
 * is about how the device is being held: the same tablet stacks upright
 * and splits on its side.
 */

describe('deciding whether the band grid sits beside the map', () => {
  it('stacks on a telephone and on a tablet held upright', () => {
    // A telephone, which the manifest holds upright anyway.
    assert.equal(isWideLayout(412), false);
    // A ten inch tablet upright: 800 points across, and tall enough that
    // stacking reads better than splitting.
    assert.equal(isWideLayout(800), false);
  });

  it('splits once a tablet is turned on its side', () => {
    // 1280x800, a ten inch tablet on its side.
    assert.equal(isWideLayout(1280), true);
    // Galaxy Tab S4 landscape, which is what the e2e tablet project runs,
    // so the split is exercised by the existing suite.
    assert.equal(isWideLayout(1138), true);
  });

  it('takes the line itself as wide enough', () => {
    assert.equal(isWideLayout(WIDE_WIDTH), true);
    assert.equal(isWideLayout(WIDE_WIDTH - 1), false);
  });

  it('sits above the tablet line, so an upright tablet still stacks', () => {
    // A tablet is 600 points on its smallest side and about 800 across
    // when upright. The split has to want more than that or it would
    // fire on a tablet held the tall way.
    assert.ok(WIDE_WIDTH > TABLET_WIDTH);
    assert.ok(WIDE_WIDTH > 800);
  });
});
