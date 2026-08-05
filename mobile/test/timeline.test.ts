import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hourAt, hoursFrom, offsetOf } from '../src/data/timeline.ts';

/**
 * The timeline is a rotation, and a rotation has invariants worth
 * pinning: every hour appears exactly once, the anchor is always at the
 * left edge, and the two direction functions undo each other. A mistake
 * in the modulo arithmetic would show as a duplicated or missing hour
 * in the heatmap — visible on a screen, which nothing here can look at.
 */
describe('the rolling timeline', () => {
  it('starts at the anchor and runs forward', () => {
    assert.deepEqual(
      hoursFrom(22),
      [
        22,
        23,
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
      ],
    );
  });

  it('holds every hour exactly once, for every anchor', () => {
    for (let anchor = 0; anchor < 24; anchor++) {
      assert.deepEqual(
        [...hoursFrom(anchor)].sort((a, b) => a - b),
        Array.from({ length: 24 }, (_, h) => h),
      );
    }
  });

  it('puts the anchor at the left edge', () => {
    for (let anchor = 0; anchor < 24; anchor++) {
      assert.equal(offsetOf(anchor, anchor), 0);
      assert.equal(hourAt(0, anchor), anchor);
    }
  });

  it('maps position to hour and back, over the whole track', () => {
    for (let anchor = 0; anchor < 24; anchor++) {
      for (let offset = 0; offset < 24; offset++) {
        assert.equal(offsetOf(hourAt(offset, anchor), anchor), offset);
      }
    }
  });

  it('wraps past midnight rather than running out', () => {
    assert.equal(hourAt(3, 23), 2);
    assert.equal(offsetOf(2, 23), 3);
  });
});
