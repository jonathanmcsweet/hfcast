import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { REACHABLE } from '../src/data/coverageGrid.ts';
import {
  combineSurvey,
  pointFrom,
  SAMPLE_COUNT,
  samplePoints,
  surveyPrediction,
} from '../src/data/survey.ts';
import type { BandKey, Endpoint, PathPrediction } from '../src/data/types.ts';

/**
 * The forecast with no destination. Its numbers mean something different from
 * a path forecast's — a share of directions rather than a chance of contact —
 * and the risk is that they look identical on screen while being computed
 * wrongly, so this checks the arithmetic that produces them.
 */

const HOME: Endpoint = {
  grid: 'IO91',
  label: 'Greenwich',
  lat: 51.4779,
  lon: -0.0014,
};

const run = (
  cells: readonly { band: BandKey; hour: number; reliability: number; }[],
): PathPrediction => ({
  from: HOME,
  to: { grid: 'AA00', label: 'sample', lat: 0, lon: 0 },
  distanceKm: 1000,
  bearingDeg: 90,
  ssn: 100,
  requiredSnrDb: 24,
  basis: 'climatology',
  month: 7,
  year: 2026,
  date: '2026-07-30',
  mufByHour: Array.from({ length: 24 }, () => 14),
  window: null,
  cells: cells.map((cell) => ({ ...cell, snr: 10, takeoffAngleDeg: 12 })),
});

describe('where the samples are', () => {
  it('runs sixteen bearings at three ranges', () => {
    assert.equal(SAMPLE_COUNT, 48);
    assert.equal(samplePoints(HOME).length, 48);
  });

  it('puts a point the asked-for distance away', () => {
    // Due north from Greenwich by 1,500 km is about 13.5 degrees of latitude,
    // since a degree is about 111 km.
    const north = pointFrom(HOME, 0, 1500);
    assert.ok(Math.abs(north.lat - (HOME.lat + 13.49)) < 0.1, `${north.lat}`);
    assert.ok(Math.abs(north.lon - HOME.lon) < 0.01, `${north.lon}`);
  });

  it('keeps longitude inside -180..180 across the date line', () => {
    // From the Pacific, 8,000 km west crosses it. A longitude of 190 would be
    // accepted by nothing downstream and drawn on the wrong side of the map.
    const across = pointFrom({ lat: 0, lon: 170 }, 270, 8000);
    assert.ok(across.lon >= -180 && across.lon <= 180, `${across.lon}`);
  });

  it('stays on the sphere at every bearing', () => {
    const points = samplePoints({ lat: 64, lon: -21 });
    for (const point of points) {
      assert.ok(Math.abs(point.lat) <= 90, `latitude ${point.lat}`);
      assert.ok(Math.abs(point.lon) <= 180, `longitude ${point.lon}`);
    }
  });
});

describe('combining the samples into one grid', () => {
  it('reports the share of directions that reach, not an average', () => {
    // Three samples, one of which reaches. An average of the reliabilities
    // would be 0.31; the share is 0.33, and they are different questions.
    const runs = [
      run([{ band: '20m', hour: 12, reliability: 0.9 }]),
      run([{ band: '20m', hour: 12, reliability: 0.03 }]),
      run([{ band: '20m', hour: 12, reliability: 0.0 }]),
    ];
    const cells = combineSurvey(runs);
    assert.equal(cells.length, 1);
    assert.ok(Math.abs((cells[0]?.reliability ?? 0) - 1 / 3) < 1e-9);
  });

  it('uses the same threshold as the map under it', () => {
    // A cell just under counts for nothing and just over counts in full, so
    // the grid and the reach figure below the globe agree on what "reaches"
    // means. Anything else and two numbers on one screen disagree.
    const under = combineSurvey([run([
      { band: '40m', hour: 0, reliability: REACHABLE - 0.001 },
    ])]);
    const over = combineSurvey([run([
      { band: '40m', hour: 0, reliability: REACHABLE },
    ])]);
    assert.equal(under[0]?.reliability, 0);
    assert.equal(over[0]?.reliability, 1);
  });

  it('keeps every band and hour it was given', () => {
    const cells = combineSurvey([
      run([
        { band: '20m', hour: 12, reliability: 0.9 },
        { band: '40m', hour: 12, reliability: 0.9 },
        { band: '20m', hour: 13, reliability: 0.1 },
      ]),
    ]);
    assert.equal(cells.length, 3);
  });

  it('says nothing rather than dividing by zero with no runs', () => {
    assert.deepEqual(combineSurvey([]), []);
  });
});

describe('the survey as the screen reads it', () => {
  it('has no destination, distance or bearing', () => {
    // This is what every component checks to know it is not looking at one
    // path. All three are null together; one of them set would be a lie.
    const survey = surveyPrediction(HOME, [
      run([{ band: '20m', hour: 12, reliability: 0.9 }]),
    ]);
    assert.equal(survey.to, null);
    assert.equal(survey.distanceKm, null);
    assert.equal(survey.bearingDeg, null);
  });

  it('draws no usable-window rail', () => {
    // The rail is one path's dial setting. There is no one path here, and an
    // invented window would be read as a frequency to tune to.
    const survey = surveyPrediction(HOME, [
      run([{ band: '20m', hour: 12, reliability: 0.9 }]),
    ]);
    assert.equal(survey.window, null);
  });

  it('refuses to describe a survey with no runs at all', () => {
    assert.throws(() => surveyPrediction(HOME, []));
  });
});
