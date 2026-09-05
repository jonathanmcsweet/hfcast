import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GRID_IN_KEY, heldWhileHere } from '../src/data/heldAnswer.ts';

/**
 * Which answer may stay on screen while the next one is computed.
 *
 * The keys here are the shape `useMapRun` builds: the kind of map, who
 * answered, the grid square, then the band and everything else. Only the
 * third part is read, and the tests carry whole keys rather than that one
 * field so a key that changes shape fails here rather than in the map.
 */

const IO91 = ['coverage', 'device', 'IO91wm', '20m', 14, '2026-08'] as const;
const FN31 = ['coverage', 'device', 'FN31pr', '20m', 14, '2026-08'] as const;

const answer = { points: [1, 2, 3] };
const at = (key: readonly unknown[]) => ({ queryKey: key });

describe('holding a map up while the next one is computed', () => {
  it('keeps it through a band, an hour or a date', () => {
    // Same station, a different question about it. Blanking the map at
    // every step of a sweep is worse than a moment of old colours.
    const hold = heldWhileHere('IO91wm');
    const laterHour = ['coverage', 'device', 'IO91wm', '20m', 15, '2026-08'];
    assert.equal(hold(answer, at(IO91)), answer);
    assert.equal(hold(answer, at(laterHour)), answer);
  });

  it('drops it when the reader has moved', () => {
    // The projection recentres before the run finishes, so this answer
    // would be redrawn against a centre it was not computed for.
    assert.equal(heldWhileHere('FN31pr')(answer, at(IO91)), undefined);
    assert.equal(heldWhileHere('IO91wm')(answer, at(FN31)), undefined);
  });

  it('holds nothing when there is no previous query', () => {
    assert.equal(heldWhileHere('IO91wm')(answer, undefined), undefined);
    assert.equal(heldWhileHere('IO91wm')(undefined, at(IO91)), undefined);
  });

  it('reads the grid from where both key builders put it', () => {
    // `key` and `centreKey` differ in every other part and agree here.
    const centres = ['centres', 'device', 'IO91wm', 'all', 'coarse'];
    assert.equal(IO91[GRID_IN_KEY], 'IO91wm');
    assert.equal(centres[GRID_IN_KEY], 'IO91wm');
    assert.equal(heldWhileHere('IO91wm')(answer, at(centres)), answer);
  });
});
