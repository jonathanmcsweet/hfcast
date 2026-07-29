import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  feetToMetres,
  heightRange,
  KM_PER_MILE,
  kmToMiles,
  METRES_PER_FOOT,
  metresToFeet,
  regionOf,
  resolveUnits,
} from '../src/data/units.ts';

/**
 * Units are display only — everything is stored and sent in metric — so
 * what matters is that the rule picks the right system, that a control
 * calibrated in feet can never ask for a height the server would clamp,
 * and that a value survives the round trip a slider puts it through.
 */

describe('which system a locale means', () => {
  it('gives feet to the three countries that use them', () => {
    assert.equal(resolveUnits('auto', 'en-US'), 'imperial');
    assert.equal(resolveUnits('auto', 'en-LR'), 'imperial');
    assert.equal(resolveUnits('auto', 'my-MM'), 'imperial');
  });

  it('gives metres to everywhere else, including the rest of English', () => {
    const tags = [
      'en-CA',
      'en-GB',
      'en-AU',
      'de-DE',
      'es-MX',
      'ja-JP',
      'ar-EG',
    ];
    assert.deepEqual(
      tags.map((tag) => resolveUnits('auto', tag)),
      tags.map(() => 'metric'),
    );
  });

  it('falls to metric when the tag names no country', () => {
    // A language chosen inside the app carries no region. Guessing at the
    // United States from "en" would put feet in front of most of the
    // people who read English.
    assert.equal(resolveUnits('auto', 'en'), 'metric');
    assert.equal(resolveUnits('auto', ''), 'metric');
  });

  it('lets a stated preference override the region', () => {
    assert.equal(resolveUnits('metric', 'en-US'), 'metric');
    assert.equal(resolveUnits('imperial', 'ja-JP'), 'imperial');
  });

  it('reads the region out of the shapes a locale tag comes in', () => {
    assert.equal(regionOf('en-US'), 'US');
    assert.equal(regionOf('en_US'), 'US');
    assert.equal(regionOf('en-us'), 'US');
    // A script subtag sits between the language and the region.
    assert.equal(regionOf('zh-Hans-CN'), 'CN');
    // UN M.49 numeric regions are valid and name no single country.
    assert.equal(regionOf('es-419'), '419');
    assert.equal(regionOf('en'), null);
  });
});

describe('converting', () => {
  it('uses the defined conversions, not rounded ones', () => {
    assert.equal(METRES_PER_FOOT, 0.3048);
    assert.equal(KM_PER_MILE, 1.609344);
  });

  it('returns a length to itself', () => {
    const lengths = [1, 10, 12.5, 100];
    assert.ok(
      lengths.every((metres) =>
        Math.abs(feetToMetres(metresToFeet(metres)) - metres) < 1e-9
      ),
    );
  });

  it('converts the figures an operator would recognise', () => {
    assert.equal(Math.round(metresToFeet(10)), 33);
    assert.equal(Math.round(metresToFeet(20)), 66);
    assert.equal(Math.round(kmToMiles(1000)), 621);
  });
});

describe('a slider calibrated in feet', () => {
  const metric = { min: 1, max: 100 };

  it('leaves the metric range alone', () => {
    assert.deepEqual(heightRange('metric', metric), {
      min: 1,
      max: 100,
      step: 1,
    });
  });

  it('stays inside what the server accepts', () => {
    // The whole point of rounding inwards. 100 m is 328.08 ft, so a
    // slider reaching 329 would send 100.3 m and be silently clamped —
    // the reader would move the control and watch nothing change.
    const range = heightRange('imperial', metric);
    assert.ok(feetToMetres(range.max) <= metric.max);
    assert.ok(feetToMetres(range.min) >= metric.min);
  });

  it('covers nearly all of the metric range rather than a safe sliver', () => {
    const range = heightRange('imperial', metric);
    assert.equal(range.max, 328);
    assert.ok(feetToMetres(range.max) > metric.max - 1);
  });

  it('steps in whole units, so no position is a converted fraction', () => {
    assert.equal(heightRange('imperial', metric).step, 1);
    assert.equal(heightRange('metric', metric).step, 1);
  });
});
