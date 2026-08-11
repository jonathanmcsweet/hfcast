import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { globeFileBytes } from '../src/data/globeCodec.ts';
import {
  costOf,
  filesWithin,
  monthsAhead,
  runsFor,
} from '../src/data/precomputePlan.ts';

/**
 * Computing ahead is a promise that nothing has to be computed in the
 * field. These tests hold the arithmetic that promise rests on: what it
 * costs, how far the room goes, and that stopping part way leaves the
 * useful part done.
 */

const FINE_POINTS = 34560;

describe('the months a scope covers', () => {
  it('starts with the month asked from', () => {
    assert.deepEqual(monthsAhead({ year: 2026, month: 8 }, 1), [
      { year: 2026, month: 8 },
    ]);
  });

  it('rolls into the next year', () => {
    assert.deepEqual(monthsAhead({ year: 2026, month: 11 }, 3), [
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it('gives a whole year from any month', () => {
    const year = monthsAhead({ year: 2026, month: 8 }, 12);
    assert.equal(year.length, 12);
    assert.deepEqual(year[0], { year: 2026, month: 8 });
    assert.deepEqual(year[11], { year: 2027, month: 7 });
    // Twelve months from anywhere is every month once.
    assert.equal(new Set(year.map((each) => each.month)).size, 12);
  });

  it('asks for nothing when nothing is wanted', () => {
    assert.deepEqual(monthsAhead({ year: 2026, month: 8 }, 0), []);
  });
});

describe('the order the hours are done in', () => {
  it('starts at the hour it is now and comes back round', () => {
    // So a person who stops the work half way is left with the hours
    // they are most likely to open.
    const runs = runsFor({ year: 2026, month: 8, hour: 22 }, 1);
    assert.deepEqual(runs.slice(0, 4).map((run) => run.hour), [22, 23, 0, 1]);
  });

  it('covers every hour of a month exactly once', () => {
    for (const hour of [0, 5, 18, 23]) {
      const runs = runsFor({ year: 2026, month: 8, hour }, 1);
      assert.equal(runs.length, 24);
      assert.equal(new Set(runs.map((run) => run.hour)).size, 24);
    }
  });
});

describe('the runs a scope asks for', () => {
  const now = { year: 2026, month: 8, hour: 18 };

  it('is one an hour a month, before the bands multiply it', () => {
    // A run here is an hour, and each band of it is its own engine run:
    // the fine grid has no multi-band pass. `costOf` is where the bands
    // are counted.
    assert.equal(runsFor(now, 1).length, 24);
    assert.equal(runsFor(now, 12).length, 288);
  });

  it('does this month before the next', () => {
    const runs = runsFor(now, 2);
    assert.deepEqual(runs[0], { year: 2026, month: 8, hour: 18 });
    assert.equal(runs[23]?.month, 8);
    assert.equal(runs[24]?.month, 9);
  });

  it('asks for no hour of no month twice', () => {
    // What stops a year of work computing the same grid more than once.
    const runs = runsFor(now, 12);
    const seen = runs.map((run) => `${run.year}-${run.month}-${run.hour}`);
    assert.equal(new Set(seen).size, runs.length);
  });
});

describe('what a plan costs', () => {
  it('says a whole year of nine bands in the numbers it was measured against', () => {
    // 0.0506 ms a point is the phone that measured 1,748 ms for the
    // 34,560-point grid at four threads.
    const hours = runsFor({ year: 2026, month: 8, hour: 18 }, 12).length;
    const cost = costOf(hours, 9, FINE_POINTS, 0.0506);
    assert.equal(cost.hours, 288);
    assert.equal(cost.files, 2592);
    // About 171 MB. The same year held as Float32 in memory would be
    // four times that, which is what one byte a value bought.
    const mb = cost.bytes / (1024 * 1024);
    assert.ok(mb > 160 && mb < 180, `a year of nine bands is ${mb} MB`);
    // About an hour and a quarter on that phone. Not the eight minutes
    // it would be if the fine grid had the multi-band pass the coarse
    // map has — which is the strongest reason to give it one.
    const hoursTaken = cost.ms / 3600000;
    assert.ok(
      hoursTaken > 1 && hoursTaken < 1.5,
      `a year of nine bands takes ${hoursTaken} hours`,
    );
  });

  it('charges a band at a time, because the fine grid has no multi-band pass', () => {
    const one = costOf(288, 1, FINE_POINTS, 0.05);
    const nine = costOf(288, 9, FINE_POINTS, 0.05);
    assert.equal(nine.ms, one.ms * 9);
    assert.equal(nine.bytes, one.bytes * 9);
  });

  it('keeps one month of one band inside a coffee break', () => {
    // The default scope, and the one that has to feel reasonable on a
    // slow tablet: 24 runs.
    const cost = costOf(24, 1, FINE_POINTS, 0.0506);
    assert.equal(cost.files, 24);
    assert.ok(cost.ms / 60000 < 1.2, `${cost.ms / 60000} minutes`);
  });

  it('is one file a band an hour', () => {
    const cost = costOf(24, 3, FINE_POINTS, 0.05);
    assert.equal(cost.files, 72);
    assert.equal(cost.bytes, 72 * globeFileBytes(FINE_POINTS));
  });

  it('costs nothing when there is nothing left', () => {
    assert.deepEqual(costOf(0, 9, FINE_POINTS, 0.05), {
      hours: 0,
      files: 0,
      bytes: 0,
      ms: 0,
    });
  });
});

describe('the room a person allows', () => {
  it('says how many maps the room reaches', () => {
    // The number the screen shows when it says where the work will
    // stop. A whole year of nine bands is 2,592 maps, so 50 MB is a
    // small part of it.
    const files = filesWithin(50 * 1024 * 1024, FINE_POINTS);
    assert.equal(files, Math.floor((50 * 1024 * 1024) / 69168));
    assert.ok(files > 700 && files < 800, `${files} maps fit in 50 MB`);
  });

  it('holds a whole year of nine bands only well above the default', () => {
    const year = costOf(288, 9, FINE_POINTS, 0.05);
    assert.ok(filesWithin(128 * 1024 * 1024, FINE_POINTS) < year.files);
    assert.ok(filesWithin(256 * 1024 * 1024, FINE_POINTS) >= year.files);
  });

  it('reaches nothing when there is no room', () => {
    assert.equal(filesWithin(0, FINE_POINTS), 0);
  });
});
