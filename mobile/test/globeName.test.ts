import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type Listed,
  type MapIdentity,
  PLACE_CHARS,
  placeName,
  readName,
  storedName,
  toDrop,
} from '../src/data/globeName.ts';

/**
 * A map computed at home has to be found again on a hill. What the file
 * is called is the whole of that, so these hold it: the same station in
 * the same place finds its maps, a different one does not, and the
 * maps dropped to make room are the ones nobody has opened.
 */

const HOME: MapIdentity = {
  grid: 'FN42kx',
  station: 'watts=100&mode=ssb&antHeight=10',
  engine: 'voacap',
  band: '20m',
  month: '2026-08',
  hour: 18,
};

describe('the name a stored map gets', () => {
  it('reads back as what it was made from', () => {
    const held = readName(storedName(HOME));
    assert.deepEqual(held, {
      month: '2026-08',
      band: '20m',
      hour: 18,
      place: placeName(HOME),
    });
  });

  it('pads the hour so the names sort', () => {
    assert.ok(storedName({ ...HOME, hour: 5 }).includes('_05_'));
  });

  it('keeps the longest band name readable', () => {
    const held = readName(storedName({ ...HOME, band: '160m' }));
    assert.equal(held?.band, '160m');
  });

  it('gives every hour, band and month its own name', () => {
    const names = new Set<string>();
    for (const month of ['2026-08', '2026-09']) {
      for (const band of ['20m', '40m'] as const) {
        for (let hour = 0; hour < 24; hour += 1) {
          names.add(storedName({ ...HOME, month, band, hour }));
        }
      }
    }
    assert.equal(names.size, 2 * 2 * 24);
  });
});

describe('which station a stored map belongs to', () => {
  it('is shared by two points in the same locator square', () => {
    // The reason the whole feature works: a person computes at home and
    // walks to a hilltop. The grid is finer than the map's own cells, so
    // the first four characters are what names the place.
    assert.equal(
      placeName({ ...HOME, grid: 'FN42kx' }),
      placeName({ ...HOME, grid: 'FN42ab' }),
    );
  });

  it('is not shared with the next square along', () => {
    assert.notEqual(
      placeName({ ...HOME, grid: 'FN42kx' }),
      placeName({ ...HOME, grid: 'FN43kx' }),
    );
  });

  it('is not shared with a different antenna', () => {
    // A map is of what this radio and this antenna reach. Showing one
    // station's map for another would be wrong in a way nobody could
    // see, so the station is part of the name.
    assert.notEqual(
      placeName(HOME),
      placeName({ ...HOME, station: 'watts=5&mode=cw&antHeight=2' }),
    );
  });

  it('is not shared between the two models', () => {
    // The two answer differently for the same place and hour, so one
    // model's map must never be read back as the other's.
    assert.notEqual(
      placeName(HOME),
      placeName({ ...HOME, engine: 'truecast' }),
    );
  });

  it('leaves the classic name as it was before the model was named', () => {
    // Maps on a device hold classic answers: the model choice never
    // reached a released build. The classic model adds nothing to the
    // hashed text, so those files stay readable. This is the value the
    // hash gave before `engine` existed, so a change that would strand
    // a whole store fails here rather than in the field.
    assert.equal(placeName(HOME), '6a94387a28bd2cf2');
  });

  it('is the same length whatever it was made from', () => {
    for (const station of ['', 'a', 'watts=1500&mode=ssb&antGain=12&beam=90']) {
      assert.match(placeName({ ...HOME, station }), /^[0-9a-f]{16}$/);
    }
  });

  it('uses four characters of the locator', () => {
    assert.equal(PLACE_CHARS, 4);
    assert.equal(
      placeName({ ...HOME, grid: 'fn42' }),
      placeName({ ...HOME, grid: 'FN42ZZ' }),
    );
  });
});

describe('a name this build did not write', () => {
  it('is not read as a stored map', () => {
    const bad = [
      'notes.txt',
      '2026-08_20m_18.hfg',
      '2026-8_20m_18_00112233445566aa.hfg',
      '2026-08_20m_99_00112233445566aa.hfg',
      '2026-08_20m_1a_00112233445566aa.hfg',
      '2026-08_20m_18_nothex0011223344.hfg',
      '2026-08_20m_18_00112233445566aa.hfg.writing',
    ];
    // A loop for its effect: each name is its own assertion message.
    for (const name of bad) {
      assert.equal(readName(name), null, name);
    }
  });
});

describe('making room', () => {
  const listed = (name: string, bytes: number, at: number): Listed => ({
    name,
    bytes,
    at,
  });

  it('drops nothing while everything fits', () => {
    const held = [listed('a', 100, 1), listed('b', 100, 2)];
    assert.deepEqual(toDrop(held, 200), []);
  });

  it('drops the maps nobody has opened for longest', () => {
    const held = [
      listed('newest', 100, 300),
      listed('oldest', 100, 100),
      listed('middle', 100, 200),
    ];
    assert.deepEqual(toDrop(held, 150), ['oldest', 'middle']);
  });

  it('stops as soon as there is room', () => {
    const held = [
      listed('oldest', 100, 100),
      listed('newer', 100, 200),
      listed('newest', 100, 300),
    ];
    assert.deepEqual(toDrop(held, 250), ['oldest']);
  });

  it('drops everything when no room is allowed', () => {
    const held = [listed('a', 100, 1), listed('b', 100, 2)];
    assert.deepEqual(toDrop(held, 0).length, 2);
  });

  it('breaks a tie by name rather than by chance', () => {
    // Two maps read in the same millisecond is ordinary on a fast
    // device. Which one goes has to be the same on every run, or the
    // same list would give two answers.
    const held = [listed('b', 100, 5), listed('a', 100, 5)];
    assert.deepEqual(toDrop(held, 100), ['a']);
  });
});
