import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  keyFor as predictionKey,
  type PredictRequest,
} from '../src/predict.ts';
import { keyFor as surveyKey } from '../src/survey.ts';
import type { Endpoint } from '../src/types.ts';

/**
 * What separates one cached run from another.
 *
 * A cache key is a claim: everything it leaves out is the same for every
 * caller that lands on the entry. Where that claim was wrong, one caller
 * was served another caller's answer, and nothing about the answer looked
 * unusual. These pin the parts that were wrong.
 */

const SEATTLE: Endpoint = {
  grid: 'CN87uq',
  label: 'Seattle',
  lat: 47.61,
  lon: -122.33,
};

const TOKYO: Endpoint = {
  grid: 'PM95uq',
  label: 'Tokyo',
  lat: 35.68,
  lon: 139.77,
};

const REQUEST: PredictRequest = {
  from: SEATTLE,
  to: TOKYO,
  date: new Date('2026-08-09T00:00:00Z'),
  watts: 100,
  requiredSnrDb: 24,
  noiseDbw: -145,
};

describe('the prediction cache key', () => {
  it('separates a stormy now-cast from a quiet one', () => {
    const quiet = predictionKey({ ...REQUEST, kpMax24h: 2 }, 68);
    const storm = predictionKey({ ...REQUEST, kpMax24h: 7 }, 68);
    assert.notEqual(quiet, storm);
  });

  it('holds no label and no exact position', () => {
    // This is why `predict` puts the two ends back on the answer after
    // it reads the entry. The key holds each end as a 6-character
    // locator, which is a square about 4.6 km by 9.3 km, so a second
    // caller in the same square shares the entry. Renaming a station
    // does not even change the square.
    const renamed = predictionKey({
      ...REQUEST,
      from: { ...SEATTLE, label: 'Home' },
    }, 68);
    assert.equal(renamed, predictionKey(REQUEST, 68));

    const shifted = predictionKey({
      ...REQUEST,
      from: { ...SEATTLE, lat: SEATTLE.lat + 0.01 },
    }, 68);
    assert.equal(shifted, predictionKey(REQUEST, 68));
  });
});

describe('the survey cache key', () => {
  it('separates a stormy now-cast from a quiet one', () => {
    // Every one of a survey's forty-eight runs is corrected with
    // `factorsFor(kpMax24h)`, so the key has to carry it. Without it a
    // request made after a storm and a quiet one landed on one entry.
    const { to, ...survey } = REQUEST;
    void to;
    assert.notEqual(
      surveyKey({ ...survey, kpMax24h: 2 }),
      surveyKey({ ...survey, kpMax24h: 7 }),
    );
  });

  it('carries the same storm term the prediction key does', () => {
    // Both keys round the widening the same way, so the two caches
    // change entry at the same Kp rather than at two different ones.
    const { to, ...survey } = REQUEST;
    void to;
    const differs = (a: number, b: number) => ({
      prediction: predictionKey({ ...REQUEST, kpMax24h: a }, 68)
        !== predictionKey({ ...REQUEST, kpMax24h: b }, 68),
      survey: surveyKey({ ...survey, kpMax24h: a })
        !== surveyKey({ ...survey, kpMax24h: b }),
    });
    for (const [a, b] of [[0, 4], [4, 5], [4, 9], [5, 6]] as const) {
      const result = differs(a, b);
      assert.equal(
        result.prediction,
        result.survey,
        `Kp ${a} against ${b} splits one cache and not the other`,
      );
    }
  });
});
