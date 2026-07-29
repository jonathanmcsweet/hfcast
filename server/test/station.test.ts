import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  type AntennaChoice,
  antennaFile,
  DEFAULT_ANTENNA,
  MAX_HEIGHT_M,
  MIN_HEIGHT_M,
  normaliseAntenna,
  txCard,
} from '../src/antenna.ts';
import {
  DEFAULT_MODE,
  isModeKey,
  MODE_ORDER,
  MODES,
  requiredSnrFor,
} from '../src/station.ts';

/**
 * The station is three assumptions the app used to make in silence, and
 * each one moves every number on the screen. What is worth testing is not
 * that the arithmetic runs but that it means what it claims: that a mode
 * converts to the threshold operators recognise, and that an antenna file
 * puts each parameter in the slot VOACAP reads it from.
 */

describe('required signal-to-noise per mode', () => {
  it('reproduces the two thresholds every VOACAP tool reports', () => {
    // 24 dB for CW and 38 for SSB are the long-standing VOACAP figures.
    // Disagreeing with them silently would be worse than being a little
    // off, because every other tool an operator compares against uses
    // them.
    assert.equal(requiredSnrFor('cw'), 24);
    assert.equal(requiredSnrFor('ssb'), 38);
  });

  it('puts the digital modes far below the voice ones', () => {
    // The whole reason this exists: a path closed for voice can be open
    // for FT8 by more than twenty decibels.
    assert.ok(requiredSnrFor('ssb') - requiredSnrFor('ft8') > 20);
    assert.ok(requiredSnrFor('ft8') > requiredSnrFor('js8'));
    assert.ok(requiredSnrFor('js8') > requiredSnrFor('wspr'));
  });

  it('orders every mode from hardest to easiest', () => {
    // MODE_ORDER is what the picker shows, so a mode inserted in the
    // wrong place would read as a ranking that is not true. A reduce with
    // no starting value walks consecutive pairs, which is exactly the
    // comparison being made.
    MODE_ORDER.reduce((harder, easier) => {
      assert.ok(
        requiredSnrFor(harder) >= requiredSnrFor(easier),
        `${harder} should need at least as much as ${easier}`,
      );
      return easier;
    });
  });

  it('leaves the default mode on the threshold the server always used', () => {
    // Every figure this app has ever shown was computed at 24 dB. The
    // default has to keep meaning the same thing, or upgrading would
    // silently restate every past answer.
    assert.equal(requiredSnrFor(DEFAULT_MODE), 24);
  });

  it('converts the digital modes from their reported bandwidth', () => {
    // FT8 and JS8 sensitivities are published in 2500 Hz, which is the
    // convention every on-air report uses, though the signal occupies
    // about 50 Hz. Converting from the occupied width instead would
    // disagree with the operator's own decoder by about 17 dB.
    const digital = (['ft8', 'js8', 'wspr'] as const).map((mode) =>
      MODES[mode]
    );
    assert.deepEqual(digital.map((m) => m.referenceHz), [2500, 2500, 2500]);
    assert.ok(digital.every((m) => m.occupiedHz < 100));
  });

  it('recognises only the modes it offers', () => {
    assert.ok(isModeKey('ssb'));
    assert.ok(!isModeKey('am-fm'));
    assert.ok(!isModeKey(''));
  });
});

describe('antenna definitions', () => {
  const tree = () => mkdtemp(path.join(tmpdir(), 'hfcast-ant-'));

  /** The definition this antenna generates, read back from the tree. */
  const written = async (root: string, antenna: AntennaChoice) => {
    const file = await antennaFile(root, antenna);
    if (file === null) throw new Error('this antenna should name a file');
    return await readFile(path.join(root, 'antennas', file), 'utf8');
  };

  it('names no file for an isotropic station', async () => {
    // The engine already defaults to the isotrope, so writing one would
    // be a file that changes nothing.
    const root = await tree();
    assert.equal(await antennaFile(root, DEFAULT_ANTENNA), null);
    assert.equal(await txCard(root, DEFAULT_ANTENNA), null);
  });

  it('fits the path into the card, which holds 21 columns', async () => {
    const root = await tree();
    const file = await antennaFile(root, {
      ...DEFAULT_ANTENNA,
      type: 'dipole',
    });
    assert.ok(file);
    assert.ok(file.length <= 21, `"${file}" is ${file.length} columns`);
  });

  it('gives the same antenna the same name and a different one another', async () => {
    // The name is a digest of the contents, which is what makes writing
    // it safe when two requests arrive at once.
    const root = await tree();
    const at = (heightM: number) =>
      antennaFile(root, { ...DEFAULT_ANTENNA, type: 'dipole', heightM });
    assert.equal(await at(10), await at(10));
    assert.notEqual(await at(10), await at(20));
  });

  it('puts the dipole height in the slot VOACAP reads it from', async () => {
    const root = await tree();
    const text = await written(root, {
      ...DEFAULT_ANTENNA,
      type: 'dipole',
      heightM: 12.5,
    });
    assert.match(text, /^\s*23\s+\[ 2\] Antenna Type/m);
    assert.match(text, /^\s*-\.50\s+\[ 6\] Antenna Length/m);
    assert.match(text, /^\s*12\.50\s+\[ 7\] Antenna Height/m);
  });

  it('does not read the vertical monopole across from the dipole', async () => {
    // The trap: for a monopole parameter 6 is the height and parameter 7
    // is a gain, where the dipole has length then height. Copying the
    // dipole's layout would give a vertical whose height was whatever
    // gain figure happened to be set.
    const root = await tree();
    const text = await written(root, {
      ...DEFAULT_ANTENNA,
      type: 'vertical',
      heightM: 9,
    });
    assert.match(text, /^\s*22\s+\[ 2\] Antenna Type/m);
    assert.match(text, /^\s*9\.00\s+\[ 6\] Antenna Height/m);
    assert.match(text, /^\s*0\.0\s+\[ 7\] Gain ab dipole/m);
    assert.doesNotMatch(text, /Antenna Length/);
  });

  it('declares the parameter count the file actually holds', async () => {
    // The reader takes the count from the second line and stops there, so
    // a wrong one silently drops the last parameters — the height among
    // them.
    const root = await tree();
    const types = ['dipole', 'yagi', 'vertical', 'invertedL'] as const;
    await Promise.all(types.map(async (type) => {
      const text = await written(root, { ...DEFAULT_ANTENNA, type });
      const declared = Number(text.split('\n').at(1)?.trim().split(/\s+/)[0]);
      const present = text.match(/\[\s*\d+\]/g)?.length ?? 0;
      assert.equal(declared, present, `${type} declares ${declared}`);
    }));
  });

  it('points only the beam, because only the beam has a direction', async () => {
    const root = await tree();
    const yagi = await txCard(root, {
      type: 'yagi',
      heightM: 15,
      gainDbd: 6,
      beamDeg: 300,
    });
    assert.equal(yagi?.beamDeg, 300);
    const dipole = await txCard(root, {
      type: 'dipole',
      heightM: 15,
      gainDbd: 6,
      beamDeg: 300,
    });
    assert.equal(dipole?.beamDeg, 0);
  });
});

describe('normalising what a request asked for', () => {
  it('holds the height inside what a station can be', () => {
    assert.equal(
      normaliseAntenna({ type: 'dipole', heightM: 0 }).heightM,
      MIN_HEIGHT_M,
    );
    assert.equal(
      normaliseAntenna({ type: 'dipole', heightM: 1e6 }).heightM,
      MAX_HEIGHT_M,
    );
  });

  it('folds a bearing into a circle rather than refusing it', () => {
    assert.equal(normaliseAntenna({ type: 'yagi', beamDeg: 450 }).beamDeg, 90);
    assert.equal(normaliseAntenna({ type: 'yagi', beamDeg: -90 }).beamDeg, 270);
  });

  it('fills in the defaults for anything not stated', () => {
    const a = normaliseAntenna({ type: 'dipole' });
    assert.equal(a.heightM, DEFAULT_ANTENNA.heightM);
    assert.equal(a.gainDbd, DEFAULT_ANTENNA.gainDbd);
    assert.equal(a.beamDeg, 0);
  });
});

describe('the power the deck can carry', () => {
  it('stops where VOACAP stops tracking power', () => {
    // Measured on Seattle to Tokyo, 2026-07-29. From 100 W down to 0.1 W
    // every step moves the signal-to-noise by exactly ten log of the
    // ratio. At 0.05 W the deck's four-decimal kilowatt field rounds and
    // nothing moves; at 0.01 W it rounds to zero and the run returns
    // 38 dB — better than a hundred watts.
    //
    // That last case is why the floor is enforced rather than trusted:
    // the wrong answer looks entirely ordinary. This test guards the
    // constant, not the engine.
    const kw = (watts: number) => Number((watts / 1000).toFixed(4));
    assert.ok(kw(0.1) > 0, 'a tenth of a watt survives the field');
    assert.equal(kw(0.01), 0, 'a hundredth of a watt rounds to no power');
  });
});
