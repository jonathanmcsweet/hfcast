import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  correctCells,
  factorsFor,
  type RawBandHour,
  SWING_FACTOR,
} from '../../shared/correct.ts';
import {
  centreAt,
  centreField,
  type CentrePoint,
  correctCoverage,
  correctPoint,
  DEAD_SIGNAL_FLOOR_DB,
  type RawCoveragePoint,
} from '../../shared/correctMap.ts';

/**
 * The map and the band table must not disagree.
 *
 * They answer different questions — who can hear you, against how one
 * path behaves through the day — but where they describe the same place
 * at the same hour on the same band, they have to give the same answer.
 * They did not: the table corrected VOACAP's overstated daily swing and
 * the map did not, so a place could be painted "patchy" on the map while
 * the table called the path to it closed.
 *
 * These hold the two to one arithmetic.
 */

const QUIET = factorsFor(null);
const REQUIRED = 24;

/** A day of hourly signal levels, as the engine reports them: whole dB. */
const DAY = [
  -12,
  -14,
  -15,
  -14,
  -11,
  -6,
  2,
  11,
  18,
  23,
  26,
  27,
  27,
  26,
  24,
  21,
  16,
  10,
  4,
  -1,
  -5,
  -8,
  -10,
  -11,
];

const bandHours = (): RawBandHour[] =>
  DAY.map((snr, hour) => ({
    hour,
    band: '20m' as const,
    reliability: 0.5,
    snr,
    snrLowDecile: 9.4,
    snrUpDecile: 7.1,
    takeoffAngleDeg: 12,
  }));

describe('one correction for both screens', () => {
  it('corrects a map point exactly as it corrects a table cell', () => {
    const table = correctCells(bandHours(), REQUIRED, QUIET);

    // The middle of the same day, which is what the map's lattice
    // carries. 24 values, so it is the average of the two middle ones.
    const sorted = [...DAY].sort((a, b) => a - b);
    const middle = ((sorted[11] as number) + (sorted[12] as number)) / 2;

    for (const [hour, snr] of DAY.entries()) {
      const point: RawCoveragePoint = {
        lat: 10,
        lon: 20,
        reliability: 0.5,
        snr,
        snrLowDecile: 9.4,
        snrUpDecile: 7.1,
        takeoffAngleDeg: 12,
      };
      const mapped = correctPoint(point, middle, REQUIRED, QUIET);
      const celled = table[hour] as { reliability: number; };
      assert.equal(
        mapped.reliability,
        celled.reliability,
        `hour ${hour}: the map says ${mapped.reliability} and the table says ${celled.reliability}`,
      );
    }
  });

  it("leaves a point without deciles on the engine's own answer", () => {
    // The same rule `correctCells` follows: moving the median without
    // knowing the spread would be a guess.
    for (const missing of ['snrLowDecile', 'snrUpDecile'] as const) {
      const point: RawCoveragePoint = {
        lat: 0,
        lon: 0,
        reliability: 0.42,
        snr: 30,
        snrLowDecile: 9,
        snrUpDecile: 7,
        takeoffAngleDeg: null,
        [missing]: null,
      };
      assert.equal(correctPoint(point, 5, REQUIRED, QUIET).reliability, 0.42);
    }
  });

  it('shrinks the swing toward the middle by the validated factor', () => {
    // Not a restatement of the formula: this is the one place that says
    // the map uses the same swing the table was fitted with.
    const point: RawCoveragePoint = {
      lat: 0,
      lon: 0,
      reliability: 0,
      snr: 40,
      // A spread of zero makes reliability a step at the requirement,
      // so the corrected level can be read off the answer.
      snrLowDecile: 0,
      snrUpDecile: 0,
      takeoffAngleDeg: null,
    };
    const middle = 0;
    const corrected = middle + SWING_FACTOR * (40 - middle);
    assert.equal(
      correctPoint(point, middle, corrected - 0.5, QUIET).reliability,
      1,
    );
    assert.equal(
      correctPoint(point, middle, corrected + 0.5, QUIET).reliability,
      0,
    );
  });
});

const lattice = (values: readonly (readonly number[])[]): CentrePoint[] =>
  values.flatMap((row, r) =>
    row.map((medianSnr, c) => ({
      lat: -90 + 45 * r,
      lon: -180 + 90 * c,
      medianSnr,
    }))
  );

describe('the lattice of daily middles', () => {
  it('reads a lattice point back exactly', () => {
    const field = centreField(
      lattice([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16],
        [17, 18, 19, 20],
      ]),
      45,
      90,
    );
    assert.ok(field);
    assert.equal(centreAt(field, -90, -180), 1);
    assert.equal(centreAt(field, -45, 0), 7);
    assert.equal(centreAt(field, 90, 90), 20);
  });

  it('reads halfway between two lattice points as halfway', () => {
    const field = centreField(
      lattice([
        [0, 10, 20, 30],
        [0, 10, 20, 30],
        [0, 10, 20, 30],
        [0, 10, 20, 30],
        [0, 10, 20, 30],
      ]),
      45,
      90,
    );
    assert.ok(field);
    assert.equal(centreAt(field, 0, -135), 5);
    assert.equal(centreAt(field, 0, -45), 15);
  });

  it('joins across the antimeridian instead of leaving a seam', () => {
    // The last column and the first are neighbours on a globe. Reading
    // the gap between them as an edge would put a line down the Pacific
    // that no reader could account for.
    const field = centreField(
      lattice([
        [0, 0, 0, 40],
        [0, 0, 0, 40],
        [0, 0, 0, 40],
        [0, 0, 0, 40],
        [0, 0, 0, 40],
      ]),
      45,
      90,
    );
    assert.ok(field);
    // Halfway from the last column (90 East, value 40) round to the
    // first (180 West, value 0).
    assert.equal(centreAt(field, 0, 135), 20);
    assert.equal(centreAt(field, 0, 179.999) < 1, true);
  });

  it('holds a value below the floor at the floor', () => {
    // A shut band reports numbers like -272 dB. Averaged against a
    // neighbour with real propagation it would describe neither place.
    const field = centreField(
      lattice([
        [-272, 20, 20, 20],
        [-272, 20, 20, 20],
        [-272, 20, 20, 20],
        [-272, 20, 20, 20],
        [-272, 20, 20, 20],
      ]),
      45,
      90,
    );
    assert.ok(field);
    assert.equal(centreAt(field, 0, -180), DEAD_SIGNAL_FLOOR_DB);
    // Halfway between the floor and a working neighbour, rather than
    // halfway between minus 272 and 20.
    assert.equal(centreAt(field, 0, -135), (DEAD_SIGNAL_FLOOR_DB + 20) / 2);
  });

  it('refuses a lattice too small or too ragged to read between', () => {
    assert.equal(centreField([], 45, 90), null);
    assert.equal(centreField(lattice([[1, 2, 3, 4]]), 45, 90), null);
    // Points that do not fill their own rectangle: one is missing, so
    // an unwritten zero would read as a real middle.
    const ragged = lattice([[1, 2], [3, 4]]).slice(0, 3);
    assert.equal(centreField(ragged, 45, 90), null);
  });
});

describe('correcting a whole map', () => {
  const points: RawCoveragePoint[] = [
    {
      lat: 0,
      lon: 0,
      reliability: 0.9,
      snr: 40,
      snrLowDecile: 9,
      snrUpDecile: 7,
      takeoffAngleDeg: 8,
    },
  ];

  it('leaves the map alone until the lattice arrives', () => {
    // The map is drawn before the whole day has been computed, and an
    // uncorrected map is what this application drew until now.
    const same = correctCoverage(points, null, REQUIRED, QUIET);
    assert.equal(same[0]?.reliability, 0.9);
    assert.equal(same[0]?.takeoffAngleDeg, 8);
  });

  it('pulls an optimistic cell down once it has', () => {
    const field = centreField(
      lattice([
        [-5, -5, -5, -5],
        [-5, -5, -5, -5],
        [-5, -5, -5, -5],
        [-5, -5, -5, -5],
        [-5, -5, -5, -5],
      ]),
      45,
      90,
    );
    assert.ok(field);
    const corrected = correctCoverage(points, field, REQUIRED, QUIET);
    // 40 dB shrunk a quarter of the way from a middle of -5 is 6.25,
    // which is well under the 24 dB asked for.
    assert.equal(
      (corrected[0] as { reliability: number; }).reliability < 0.05,
      true,
    );
    // Geometry is untouched.
    assert.equal(corrected[0]?.takeoffAngleDeg, 8);
  });
});
