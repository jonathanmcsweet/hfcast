import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CARDINALS,
  CENTRE,
  LOBE_HALF_WIDTH,
  point,
  RING,
  TICKS,
  wedge,
} from '../src/data/compass.ts';
import { alignment } from '../src/data/orientation.ts';

/**
 * The compass exists because the words were not enough: "80 degrees off
 * your best direction" never said what that direction was. A drawing that
 * put east on the left would answer the question wrongly, and nothing in
 * this project can look at a screen — no browser, no emulator. So the
 * placement is asserted here instead.
 */

/** Within a hundredth of a unit in a hundred-unit frame. */
const near = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${actual} is not ${expected}`,
  );

describe('where a bearing lands', () => {
  it('puts north up the screen, where a compass has it', () => {
    // Screen coordinates count downwards, so north is the smaller y.
    const north = point(0, RING);
    near(north.x, CENTRE);
    near(north.y, CENTRE - RING);
  });

  it('turns clockwise, so east is to the right', () => {
    const east = point(90, RING);
    near(east.x, CENTRE + RING);
    near(east.y, CENTRE);
  });

  it('puts south and west opposite them', () => {
    near(point(180, RING).y, CENTRE + RING);
    near(point(270, RING).x, CENTRE - RING);
  });

  it('stays on its circle whatever bearing it is given', () => {
    const bearings = [0, 37, 90, 174, 233, 359, 400, -45];
    const radii = bearings.map((deg) => {
      const at = point(deg, 20);
      return Math.round(Math.hypot(at.x - CENTRE, at.y - CENTRE));
    });
    assert.deepEqual(radii, bearings.map(() => 20));
  });

  it('leaves the drawing inside the box it is scaled by', () => {
    // The cardinal letters sit outside the ring; past 100 they would be
    // clipped away on every screen.
    const letters = CARDINALS.map(({ deg }) => point(deg, RING + 7));
    assert.ok(letters.every((at) => at.x >= 0 && at.x <= 100));
    assert.ok(letters.every((at) => at.y >= 0 && at.y <= 100));
  });
});

describe('the shaded lobes', () => {
  it('centres the wedge on the direction it is for', () => {
    // Read out of the path: the two arc ends should straddle the bearing
    // evenly. If they did not, the shading would say the antenna is
    // strongest somewhere it is not.
    // M 50 50 L x y A r r 0 0 1 x y Z — the arc's six parameters put its
    // end point at the thirteenth and fourteenth tokens.
    const parts = wedge(90, 30).split(' ');
    const from = { x: Number(parts[4]), y: Number(parts[5]) };
    const to = { x: Number(parts[12]), y: Number(parts[13]) };
    assert.ok(Number.isFinite(from.x) && Number.isFinite(to.x));
    near(from.y, point(90 - LOBE_HALF_WIDTH, 30).y);
    near(to.y, point(90 + LOBE_HALF_WIDTH, 30).y);
    near((from.y + to.y) / 2, CENTRE);
  });

  it('starts every wedge at the centre and closes it', () => {
    const paths = [0, 122, 302].map((deg) => wedge(deg, 30));
    assert.ok(paths.every((d) => d.startsWith(`M ${CENTRE} ${CENTRE}`)));
    assert.ok(paths.every((d) => d.endsWith('Z')));
  });

  it('shades exactly as far as the wording calls close to best', () => {
    // The picture and the sentence have to agree. A wedge wider than the
    // "best" band would shade a direction the text calls off to one side.
    assert.equal(alignment(LOBE_HALF_WIDTH), 'best');
    assert.equal(alignment(LOBE_HALF_WIDTH + 1), 'offToOneSide');
  });

  it('draws the short way round, which the arc flags assume', () => {
    // The sweep is written as a small arc. Two lobes 64 degrees wide are
    // well under the half circle where that stops being true.
    assert.ok(LOBE_HALF_WIDTH * 2 < 180);
    assert.ok(wedge(45, 30).includes('0 0 1'));
  });
});

describe('the marks round the edge', () => {
  it('divides the circle evenly', () => {
    assert.equal(TICKS.length, 12);
    assert.deepEqual(
      TICKS,
      TICKS.map((_, index) => index * 30),
    );
  });

  it('has a long mark at each of the four letters', () => {
    const longs = TICKS.filter((deg) => deg % 90 === 0);
    assert.deepEqual(longs, CARDINALS.map(({ deg }) => deg));
  });
});
