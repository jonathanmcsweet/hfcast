import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiError } from '../src/api/error.ts';
import {
  checkCoverage,
  checkCoveragePatch,
  checkPredictionResponse,
  checkSpaceWeather,
} from '../src/api/shape.ts';

/**
 * What the web build accepts from its server.
 *
 * The client used to end `return (await response.json()) as T`, which is a
 * claim about a value nobody looked at. The failures that matters are the
 * quiet ones: an older server, a proxy answering with its own page as 200,
 * a field renamed on one side. Those reached the screen as `undefined`
 * fields and drew a forecast with holes in it, which is worse than the
 * error screen — the error screen says what happened and offers to try
 * again.
 */

const READINGS = {
  f107: 150,
  observedSsn: 90,
  kp: 2,
  kpMax24h: 3,
  effectiveSsn: 88,
  observedAt: '2026-08-06T12:00:00Z',
};

const FORECAST = {
  prediction: {
    from: { grid: 'IO91', label: 'London', lat: 51.5, lon: -0.1 },
    to: { grid: 'FN31', label: 'New York', lat: 40.7, lon: -74 },
    distanceKm: 5570,
    bearingDeg: 288,
    ssn: 88,
    requiredSnrDb: 24,
    basis: 'nowcast',
    month: 8,
    year: 2026,
    date: '2026-08-06',
    mufByHour: Array.from({ length: 24 }, () => 14),
    window: null,
    cells: [{
      hour: 0,
      band: '20m',
      reliability: 0.7,
      snr: 30,
      takeoffAngleDeg: 12,
    }],
  },
  spaceWeather: READINGS,
};

const MAP = {
  band: '20m',
  hour: 12,
  latStep: 15,
  lonStep: 22.5,
  reach: 0.4,
  basis: 'nowcast',
  points: [{ lat: 0, lon: 0, reliability: 0.5, takeoffAngleDeg: null }],
};

/** The message a reader would be shown, for a body that is not a forecast. */
const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof ApiError, 'refused as an ApiError');
    // Status 0 is "nothing usable reached the caller", which is what a
    // wrong shape is — the same class as a connection that never opened.
    assert.equal(error.status, 0);
    return error.message;
  }
  return assert.fail('accepted a body it should have refused');
};

describe('what the app accepts as a forecast', () => {
  it('takes a whole answer', () => {
    assert.equal(checkPredictionResponse(FORECAST), FORECAST);
  });

  it('takes a survey, which has no far end', () => {
    const survey = {
      ...FORECAST,
      prediction: {
        ...FORECAST.prediction,
        to: null,
        distanceKm: null,
        bearingDeg: null,
      },
    };
    assert.equal(checkPredictionResponse(survey), survey);
  });

  it('takes an answer with no readings, which is offline', () => {
    const noReadings = { ...FORECAST, spaceWeather: null };
    assert.equal(checkPredictionResponse(noReadings), noReadings);
  });

  it('refuses a body that is not an object at all', () => {
    // A proxy or a captive portal answering with a page, at status 200.
    assert.match(refusal(() => checkPredictionResponse('<html>')), /string/);
    assert.match(refusal(() => checkPredictionResponse(null)), /null/);
  });

  it('refuses a forecast with no bands in it', () => {
    // The case that matters most. Every band reads as closed, which is a
    // true answer for a very long path, so an empty grid is
    // indistinguishable from a real one on the screen.
    const empty = {
      ...FORECAST,
      prediction: { ...FORECAST.prediction, cells: [] },
    };
    assert.match(refusal(() => checkPredictionResponse(empty)), /no bands/);
  });

  it('names the field that was wrong', () => {
    const noGrid = {
      ...FORECAST,
      prediction: {
        ...FORECAST.prediction,
        from: { label: 'London', lat: 51.5, lon: -0.1 },
      },
    };
    assert.match(
      refusal(() => checkPredictionResponse(noGrid)),
      /the forecast\.from\.grid/,
    );
  });

  it('refuses a reliability that is not a number', () => {
    const wrong = {
      ...FORECAST,
      prediction: {
        ...FORECAST.prediction,
        cells: [{ ...FORECAST.prediction.cells[0], reliability: 'high' }],
      },
    };
    assert.match(refusal(() => checkPredictionResponse(wrong)), /reliability/);
  });
});

describe('what the app accepts as a map', () => {
  it('takes a grid', () => {
    assert.equal(checkCoverage(MAP), MAP);
  });

  it('refuses a grid with no step', () => {
    // The steps place every cell. Without one the map draws a correct
    // answer in the wrong place, which reads as the model being wrong
    // about the world rather than as a fault.
    const { latStep: _dropped, ...noStep } = MAP;
    assert.match(refusal(() => checkCoverage(noStep)), /latitude step/);
  });

  it('refuses a grid with no points', () => {
    assert.match(
      refusal(() => checkCoverage({ ...MAP, points: [] })),
      /no points/,
    );
  });

  it('takes a null patch, which is a station near the dateline', () => {
    // An ordinary answer about where the station is, not a failure.
    assert.equal(checkCoveragePatch(null), null);
  });
});

describe('what the app accepts as readings', () => {
  it('takes a reading', () => {
    assert.equal(checkSpaceWeather(READINGS), READINGS);
  });

  it('refuses one missing the number the now-cast is driven by', () => {
    const { effectiveSsn: _dropped, ...noSsn } = READINGS;
    assert.match(refusal(() => checkSpaceWeather(noSsn)), /effectiveSsn/);
  });
});
