import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  antennaFileName,
  antennaOnDisk,
  effectiveHeightM,
  INVERTED_V_HEIGHT_FRACTION,
} from '../src/data/antennaFile.ts';
import type { Antenna } from '../src/store/useStationStore.ts';
import { ANTENNA_ORDER } from '../src/store/useStationStore.ts';

/**
 * The definition file the engine reads.
 *
 * It is fixed-width text with a parameter count the reader trusts, so a
 * wrong count silently drops the parameters after it — the height among
 * them — and the run answers for an antenna nobody described.
 *
 * The inverted V is the case worth the most care here. VOACAP has no
 * pattern for it, so it is written as a dipole at a reduced height, and
 * the whole of that decision lives in one number. A test is the only
 * thing that stops the number moving quietly.
 */

const antenna = (over: Partial<Antenna> = {}): Antenna => ({
  type: 'dipole',
  heightM: 10,
  gainDbd: 6,
  beamDeg: 0,
  ...over,
});

/**
 * The value of parameter `index` in a generated file.
 *
 * The index is right-aligned in two columns, so a single digit is written
 * `[ 7]`, not `[7]`.
 */
function parameterOf(text: string, index: number): string {
  const marker = new RegExp(`\\[\\s*${index}\\]`);
  const line = text.split('\n').find((row) => marker.test(row));
  assert.ok(line, `no parameter ${index} in\n${text}`);
  return line.slice(0, line.indexOf('[')).trim();
}

describe('the inverted V, which VOACAP has no pattern for', () => {
  it('is written as a dipole', () => {
    // Type 23. There is nothing else to select: IONCAP's ten patterns
    // hold the rhombics, the monopole, the dipole, the Yagi, the log
    // periodic, the curtain, the sloping vee and the inverted L.
    const file = antennaOnDisk(antenna({ type: 'invertedV' }));
    assert.ok(file);
    assert.equal(parameterOf(file.text, 2), '23');
  });

  it('is written at four fifths of the apex height', () => {
    const file = antennaOnDisk(antenna({ type: 'invertedV', heightM: 10 }));
    assert.ok(file);
    assert.equal(INVERTED_V_HEIGHT_FRACTION, 0.8);
    assert.equal(parameterOf(file.text, 7), '8.00');
  });

  it('leaves every other family at the height it was given', () => {
    for (const type of ANTENNA_ORDER) {
      const built = antenna({ type, heightM: 12 });
      assert.equal(
        effectiveHeightM(built),
        type === 'invertedV' ? 12 * INVERTED_V_HEIGHT_FRACTION : 12,
        type,
      );
    }
  });

  it('names the apex in its title, not the height the model reads', () => {
    // The title is what a person opening the file sees, and the apex is
    // the number they typed. The approximation is in the parameter.
    const file = antennaOnDisk(antenna({ type: 'invertedV', heightM: 10 }));
    assert.ok(file);
    assert.match(file.text.split('\n')[0] ?? '', /inverted V 10 m/);
  });

  it('keeps its own file from the dipole whose card it shares', () => {
    // A 10 m inverted V and an 8 m dipole write the same parameters. If
    // they shared a filename, one would overwrite the other and the file
    // on disk would name the wrong antenna.
    const v = antennaFileName(antenna({ type: 'invertedV', heightM: 10 }));
    const d = antennaFileName(antenna({ type: 'dipole', heightM: 8 }));
    assert.notEqual(v, d);
  });
});

describe('every generated file the engine has to be able to read', () => {
  it('fits the 21 columns the card holds', () => {
    for (const type of ANTENNA_ORDER) {
      const file = antennaOnDisk(antenna({ type, heightM: 100 }));
      if (file === null) continue;
      assert.ok(
        file.file.length <= 21,
        `${file.file} is ${file.file.length} characters`,
      );
    }
  });

  it('states a parameter count that matches what it wrote', () => {
    // The reader stops at the count, so a wrong one drops the height and
    // predicts a different antenna without failing.
    for (const type of ANTENNA_ORDER) {
      const file = antennaOnDisk(antenna({ type }));
      if (file === null) continue;
      const lines = file.text.split('\n');
      const stated = Number((lines[1] ?? '').trim().split(/\s+/)[0]);
      const written = lines.filter((line) => /\[\s*\d+\]/.test(line)).length;
      assert.equal(stated, written, type);
    }
  });

  it('writes nothing at all for an unspecified antenna', () => {
    // An isotrope names no file, which is what the engine defaults to.
    // A file of zeroes would be describing an assumption as a setting.
    assert.equal(antennaOnDisk(antenna({ type: 'isotropic' })), null);
  });
});
