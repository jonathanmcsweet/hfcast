import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isTablet,
  isWideLayout,
  TABLET_WIDTH,
  WIDE_WIDTH,
  wideMapSize,
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
 * Whether the answer sits beside the map or above it.
 *
 * This one reads the current width and not the smallest side, because it
 * is about how the device is being held: the same tablet stacks upright
 * and splits on its side.
 */

describe('deciding whether the answer sits beside the map', () => {
  it('stacks on a telephone and on a tablet held upright', () => {
    // A telephone, which the manifest holds upright anyway.
    assert.equal(isWideLayout(412), false);
    // A ten inch tablet upright: 800 points across, and tall enough that
    // stacking reads better than splitting.
    assert.equal(isWideLayout(800), false);
  });

  it('splits once a tablet is turned on its side', () => {
    // 1280x800, the arrangement `MapSlot`'s cap was written for.
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

/**
 * How big the map may be once it has a column of its own.
 *
 * Height is the binding constraint here, not width. The whole point of
 * the split is that a tablet on its side is short, so a map sized only
 * from the width would push the clock off the bottom.
 */

describe('sizing the map beside the answer', () => {
  it('is bounded by the height, not the width', () => {
    // 1138x712, Galaxy Tab S4 landscape. Width alone would allow 478.
    assert.equal(wideMapSize(1138, 712), 412);
  });

  it('grows with the room a taller screen gives', () => {
    assert.ok(wideMapSize(1280, 800) > wideMapSize(1138, 712));
  });

  it('keeps a floor on a short screen rather than vanishing', () => {
    // An old seven inch tablet on its side: 600 points of height leaves
    // almost nothing after the header and the legend.
    assert.equal(wideMapSize(1024, 600), 320);
  });

  it('never returns something a card cannot hold', () => {
    const screens: Array<[number, number]> = [
      [900, 500],
      [1138, 712],
      [1280, 800],
      [2000, 1200],
    ];
    for (const [w, h] of screens) {
      const size = wideMapSize(w, h);
      assert.ok(size > 0, `${w}x${h} gave ${size}`);
      assert.ok(size <= w, `${w}x${h} gave ${size}, wider than the screen`);
    }
  });
});
