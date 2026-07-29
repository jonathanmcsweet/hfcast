import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  alignment,
  askedAsWire,
  beamFromWire,
  isBidirectional,
  lobes,
  offAxis,
  usesOrientation,
  wireFromBeam,
} from '../src/data/orientation.ts';
import { ANTENNA_ORDER, usesBeam } from '../src/store/useStationStore.ts';

/**
 * Orientation is not a refinement. Measured against the engine on
 * 2026-07-29, Seattle to Tokyo at 14 MHz, turning a dipole through the
 * compass moves the signal 12 dB and the reliability from 7% to 71%, and
 * moves a vertical by nothing.
 *
 * An earlier version pinned every non-beam antenna at zero degrees, which
 * reported the null off the ends of the wire as though it were the
 * answer. These tests are mostly about that: the right families ask, and
 * the conversion between what an operator knows and what VOACAP takes is
 * exact and reversible.
 */

describe('which antennas have a direction', () => {
  it('asks the three families the engine measured as directional', () => {
    const directional = ANTENNA_ORDER.filter(usesOrientation);
    assert.deepEqual(directional, ['dipole', 'invertedL', 'yagi']);
  });

  it('does not ask the vertical, which measured 0 dB over the compass', () => {
    assert.equal(usesOrientation('vertical'), false);
    assert.equal(usesOrientation('isotropic'), false);
  });

  it('agrees with the store about which antennas send a bearing', () => {
    // The store gates what is sent and cached; this gates what is asked.
    // If they disagreed, a control would be shown for a value that never
    // left the app, or a value would be sent that nothing set.
    assert.deepEqual(
      ANTENNA_ORDER.map(usesOrientation),
      ANTENNA_ORDER.map(usesBeam),
    );
  });

  it('asks only the dipole about its wire', () => {
    // The inverted L is a wire too, but its pattern is not a simple
    // broadside one, so adding a right angle to its run would be
    // inventing physics. It is asked the way a beam is.
    assert.equal(askedAsWire('dipole'), true);
    assert.equal(askedAsWire('invertedL'), false);
    assert.equal(askedAsWire('yagi'), false);
  });
});

describe('a wire and the direction it favours', () => {
  it('radiates at right angles to its run', () => {
    assert.equal(beamFromWire(0), 90);
    assert.equal(beamFromWire(45), 135);
    assert.equal(beamFromWire(280), 10);
  });

  it('converts back exactly, so the control never drifts', () => {
    // The store holds the beam, the control holds the wire, and the
    // reader moves the control. A lossy round trip would walk the value
    // a degree at a time.
    const headings = [0, 1, 45, 90, 179, 180, 271, 359];
    assert.deepEqual(
      headings.map((w) => wireFromBeam(beamFromWire(w))),
      headings,
    );
  });

  it('stays inside the compass whatever it is given', () => {
    assert.equal(beamFromWire(-90), 0);
    assert.equal(wireFromBeam(0), 270);
    assert.equal(beamFromWire(720 + 45), 135);
  });
});

describe('the lobes an antenna favours', () => {
  it('gives a dipole two, opposite and equal', () => {
    // The thing newcomers are most often surprised by, and the engine
    // confirms it: swept through 360 degrees a dipole repeats exactly
    // every 180.
    assert.deepEqual(lobes(90, 'dipole'), [90, 270]);
    assert.deepEqual(lobes(270, 'dipole'), [90, 270]);
    assert.equal(isBidirectional('dipole'), true);
    assert.equal(isBidirectional('invertedL'), true);
  });

  it('gives a beam one', () => {
    assert.deepEqual(lobes(302, 'yagi'), [302]);
    assert.equal(isBidirectional('yagi'), false);
  });
});

describe('how far off the path falls', () => {
  it('measures to the nearer lobe, so a dipole is never called backwards', () => {
    // A wire running north-south favours east and west. A path due west
    // is on its best direction, not 180 degrees from it.
    const beam = 90;
    assert.equal(offAxis(beam, 'dipole', 90), 0);
    assert.equal(offAxis(beam, 'dipole', 270), 0);
    assert.equal(offAxis(beam, 'dipole', 0), 90);
  });

  it('measures to the one lobe a beam has', () => {
    assert.equal(offAxis(90, 'yagi', 270), 180);
  });

  it('takes the shorter way round the compass', () => {
    assert.equal(offAxis(350, 'yagi', 10), 20);
    assert.equal(offAxis(10, 'yagi', 350), 20);
  });
});

describe('putting the offset into words', () => {
  it('reads a path near a lobe as close to best', () => {
    assert.equal(alignment(0), 'best');
    assert.equal(alignment(30), 'best');
  });

  it('warns only where the antenna is genuinely weak', () => {
    assert.equal(alignment(31), 'offToOneSide');
    assert.equal(alignment(60), 'offToOneSide');
    assert.equal(alignment(61), 'nearNull');
    assert.equal(alignment(90), 'nearNull');
  });
});
