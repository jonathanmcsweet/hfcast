import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  alignment,
  askedAsWire,
  beamFromWire,
  isBidirectional,
  lobes,
  nearestLobe,
  offAxis,
  usesOrientation,
  wireFromBeam,
} from '../src/data/orientation.ts';
import ar from '../src/i18n/locales/ar.json' with { type: 'json' };
import de from '../src/i18n/locales/de.json' with { type: 'json' };
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import es from '../src/i18n/locales/es.json' with { type: 'json' };
import ja from '../src/i18n/locales/ja.json' with { type: 'json' };
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
  it('asks the families the engine measured as directional', () => {
    // The inverted V is here because it is written as a dipole card, so
    // it has the dipole's own measured 12 dB swing over the compass. It
    // is the same pattern at a lower effective height.
    const directional = ANTENNA_ORDER.filter(usesOrientation);
    assert.deepEqual(directional, [
      'dipole',
      'invertedV',
      'invertedL',
      'yagi',
    ]);
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

  it('asks the two broadside wires about their run', () => {
    // The inverted L is a wire too, but its pattern is not a simple
    // broadside one, so adding a right angle to its run would be
    // inventing physics. It is asked the way a beam is. The inverted V
    // is asked as a wire because the model under it is the dipole's.
    assert.equal(askedAsWire('dipole'), true);
    assert.equal(askedAsWire('invertedV'), true);
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

describe('naming the direction the offset is measured from', () => {
  // "80 degrees off your best direction" was asked about directly: what
  // is my best direction? It was never stated. The sentence now names the
  // lobe it measured from, and the compass draws the same figure.
  it('names the lobe the offset was measured from', () => {
    assert.equal(nearestLobe(90, 'dipole', 100), 90);
    assert.equal(nearestLobe(90, 'dipole', 260), 270);
    assert.equal(nearestLobe(302, 'yagi', 10), 302);
  });

  it('names a lobe the antenna actually has', () => {
    const beam = 122;
    const paths = [0, 45, 90, 135, 180, 225, 270, 315];
    assert.deepEqual(
      paths.map((p) =>
        lobes(beam, 'dipole').includes(nearestLobe(beam, 'dipole', p))
      ),
      paths.map(() => true),
    );
  });

  it('agrees with the offset it is quoted beside', () => {
    // The two numbers appear in one sentence. If they came from different
    // lobes the sentence would contradict itself.
    const beam = 40;
    const paths = [0, 30, 95, 180, 200, 330];
    const separation = (a: number, b: number) => {
      const raw = Math.abs(a - b) % 360;
      return raw > 180 ? 360 - raw : raw;
    };
    assert.deepEqual(
      paths.map((p) => separation(nearestLobe(beam, 'dipole', p), p)),
      paths.map((p) => offAxis(beam, 'dipole', p)),
    );
  });
});

describe('the words the compass is drawn beside', () => {
  const locales = { en, de, es, ja, ar };
  const entries = Object.entries(locales);

  it('gives every language a letter for each compass point', () => {
    // Drawn in the rose itself, so they are translated rather than
    // assumed to be the English four.
    assert.deepEqual(
      entries.map(([, l]) => Object.keys(l.station.compass).sort()),
      entries.map(() => ['e', 'n', 's', 'w']),
    );
  });

  it('states the direction the offset is measured from, in every language', () => {
    // The placeholder is the fix. A translation that dropped it would put
    // the old unanswerable wording back for that language alone.
    const wanted = ['{{place}}', '{{degrees}}', '{{offset}}', '{{lobe}}'];
    const sentences = entries.flatMap(([, l]) => Object.values(l.station.aim));
    assert.deepEqual(
      sentences.map((s) => wanted.every((token) => s.includes(token))),
      sentences.map(() => true),
    );
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
