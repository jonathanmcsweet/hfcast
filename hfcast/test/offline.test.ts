import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { antennaFileName, antennaOnDisk } from '../src/data/antennaFile.ts';
import {
  SSN_TABLE_DATE,
  SSN_TABLE_RANGE,
  ssnForMonth,
} from '../src/data/ssn.ts';
import type { Antenna } from '../src/store/useStationStore.ts';

/**
 * The two things a forecast needs that the server used to supply: a sunspot
 * number, and an antenna the engine can read.
 *
 * Neither is a refinement. VOACAP takes the smoothed SSN as an input, so
 * without one there is no prediction at all; and the engine names an antenna by
 * filename, so a name that does not fit the card's 21 columns fails the run.
 */

const antenna = (over: Partial<Antenna> = {}): Antenna => ({
  type: 'dipole',
  heightM: 10,
  gainDbd: 6,
  beamDeg: 90,
  ...over,
});

describe('the sunspot number without a network', () => {
  it('gives an observed figure for a month that has one', () => {
    const early = ssnForMonth(2024, 1);
    assert.equal(early.basis, 'climatology');
    assert.equal(early.extrapolated, false);
    assert.ok(early.ssn > 0, `${early.ssn}`);
  });

  it('gives a prediction for a month not yet smoothed', () => {
    // NOAA cannot compute a twelve-month smoothed value for a recent month,
    // so those come from its forecast instead.
    const soon = ssnForMonth(2027, 6);
    assert.equal(soon.basis, 'forecast');
    assert.equal(soon.extrapolated, false);
  });

  it('covers every month in between, with no gaps', () => {
    // A gap would be a month of the year in which the app could not predict
    // at all, which is not a failure a smoke test would find.
    const [firstYear] = SSN_TABLE_RANGE.first.split('-').map(Number);
    const [lastYear] = SSN_TABLE_RANGE.last.split('-').map(Number);
    const months = Array.from(
      { length: (lastYear - firstYear + 1) * 12 },
      (_, i) => [firstYear + Math.floor(i / 12), (i % 12) + 1] as const,
    );
    const gaps = months.filter(([y, m]) => ssnForMonth(y, m).extrapolated);
    assert.deepEqual(gaps, []);
  });

  it('says so rather than pretending, outside the table', () => {
    // A solar minimum figure applied to a year nobody predicted is a guess,
    // and the difference between a stale forecast and a wrong one is whether
    // it admits which it is.
    const far = ssnForMonth(2099, 1);
    assert.equal(far.extrapolated, true);
    const long_ago = ssnForMonth(1990, 1);
    assert.equal(long_ago.extrapolated, true);
  });

  it('records when the figures were taken', () => {
    assert.match(SSN_TABLE_DATE, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the antenna file the engine reads', () => {
  it('fits the card, which holds 21 columns', () => {
    // The engine refuses a longer path rather than truncating it, so this is
    // the difference between an antenna and a failed run.
    const names = (['dipole', 'vertical', 'invertedL', 'yagi'] as const).map(
      (type) => antennaFileName(antenna({ type, heightM: 100, gainDbd: 20 })),
    );
    assert.deepEqual(
      names.map((name) => name.length <= 21),
      names.map(() => true),
      `${names}`,
    );
  });

  it('names one file per distinct antenna', () => {
    // Two stations with the same antenna should share a file; changing the
    // height must not keep reading the old one.
    assert.equal(
      antennaFileName(antenna({ heightM: 10 })),
      antennaFileName(antenna({ heightM: 10.4 })),
    );
    assert.notEqual(
      antennaFileName(antenna({ heightM: 10 })),
      antennaFileName(antenna({ heightM: 20 })),
    );
    assert.notEqual(
      antennaFileName(antenna({ type: 'yagi', gainDbd: 6 })),
      antennaFileName(antenna({ type: 'yagi', gainDbd: 12 })),
    );
  });

  it('writes no file for an unspecified antenna', () => {
    // The isotrope is what the engine defaults to when no antenna is named,
    // so writing one would describe an assumption as a measurement.
    assert.equal(antennaOnDisk(antenna({ type: 'isotropic' })), null);
  });

  it('puts the file where the engine will look for it', () => {
    // The engine joins `antennas/` in front of the name on the card, so the
    // two have to agree about the prefix.
    const disk = antennaOnDisk(antenna());
    assert.ok(disk);
    assert.equal(disk.path, `antennas/${disk.file}`);
  });

  it('writes the parameters the reference reads by position', () => {
    // Read carefully rather than copied between families: for the monopole
    // parameter 6 is its height, where the dipole has length then height.
    const dipole = antennaOnDisk(antenna({ type: 'dipole', heightM: 12 }));
    const vertical = antennaOnDisk(antenna({ type: 'vertical', heightM: 12 }));
    assert.ok(dipole && vertical);
    assert.match(dipole.text, /\[ 7\] Antenna Height:/);
    assert.match(vertical.text, /\[ 6\] Antenna Height:/);
    // The count on the second line is where the reader stops.
    const lines = dipole.text.split('\n');
    assert.equal(Number(lines[1]?.trim().split(/\s+/)[0]), 8);
  });
});
