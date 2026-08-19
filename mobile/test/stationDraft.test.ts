import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_STATION } from '../src/data/station.ts';
import * as draft from '../src/data/stationDraft.ts';
import type { Draft } from '../src/data/stationDraft.ts';

/**
 * The dialog's working copy.
 *
 * What matters here is that Save writes what the reader sees, Cancel
 * costs nothing, and a station made by pressing Add arrives with a name
 * on it — the empty name is what made adding a station read as losing
 * one.
 */

const at = (name: string, id: string) => ({ id, name, ...DEFAULT_STATION });

const one: Draft = { presets: [at('Home', 's1')], activeId: 's1' };
const two: Draft = {
  presets: [at('Home', 's1'), at('Portable', 's2')],
  activeId: 's1',
};

const number = (n: number) => `Station ${n}`;

describe('the station draft', () => {
  it('changes the active station and no other', () => {
    const next = draft.setWatts(two, 5);
    assert.equal(draft.active(next).watts, 5);
    assert.equal(next.presets[1]?.watts, DEFAULT_STATION.watts);
  });

  it('holds power and height inside what the model accepts', () => {
    assert.equal(draft.active(draft.setWatts(one, 99_999)).watts, 1500);
    assert.equal(draft.active(draft.setWatts(one, -5)).watts, 0.1);
    const high = draft.setAntenna(one, { heightM: 10_000 });
    assert.equal(draft.active(high).antenna.heightM, 100);
  });

  it('wraps a bearing rather than clamping it', () => {
    assert.equal(
      draft.active(draft.setAntenna(one, { beamDeg: 370 }))
        .antenna.beamDeg,
      10,
    );
    assert.equal(
      draft.active(draft.setAntenna(one, { beamDeg: -10 }))
        .antenna.beamDeg,
      350,
    );
  });

  it('names a new station rather than leaving it blank', () => {
    // The whole point. A blank name shows the placeholder, which looks
    // exactly like a form that was never filled in.
    const next = draft.addStation(one, number);
    assert.equal(next.presets.length, 2);
    assert.equal(draft.active(next).name, 'Station 2');
    assert.notEqual(draft.active(next).name, '');
  });

  it('does not name two stations the same', () => {
    const taken: Draft = {
      presets: [at('Home', 's1'), at('Station 2', 's2')],
      activeId: 's1',
    };
    assert.equal(
      draft.active(draft.addStation(taken, number)).name,
      'Station 3',
    );
  });

  it('selects the station it just made', () => {
    const next = draft.addStation(one, number);
    assert.equal(next.activeId, next.presets[1]?.id);
  });

  it('copies the active station rather than starting from defaults', () => {
    const set = draft.setWatts(one, 5);
    const next = draft.addStation(set, number);
    assert.equal(draft.active(next).watts, 5);
  });

  it('keeps a station to come back to when the last one is deleted', () => {
    const next = draft.removeStation(one, 's1');
    assert.equal(next.presets.length, 1);
    assert.equal(next.presets[0]?.watts, DEFAULT_STATION.watts);
  });

  it('moves off a deleted station', () => {
    const next = draft.removeStation({ ...two, activeId: 's2' }, 's2');
    assert.equal(next.presets.length, 1);
    assert.equal(next.activeId, 's1');
  });

  it('knows when nothing has changed', () => {
    assert.equal(draft.isDirty(one, one), false);
    assert.equal(draft.isDirty(draft.setWatts(one, 5), one), true);
    assert.equal(draft.isDirty(draft.rename(one, 'Shack'), one), true);
    assert.equal(draft.isDirty(draft.addStation(one, number), one), true);
  });

  it('counts a different station as a change', () => {
    // The active station is what the forecast is run for, so switching
    // it is something Save has to write and Cancel has to undo.
    assert.equal(draft.isDirty(draft.selectStation(two, 's2'), two), true);
  });

  it('ignores a selection of a station that is not there', () => {
    assert.equal(draft.selectStation(two, 'nope').activeId, 's1');
  });

  it('trims names on the way to the store, not while typing', () => {
    // Trimming as the reader types takes the space away the moment it
    // is pressed, so "Field day" could never be typed.
    const typed = draft.rename(one, 'Field ');
    assert.equal(draft.active(typed).name, 'Field ');
    assert.equal(draft.forStore(typed).presets[0]?.name, 'Field');
  });

  it('matches stations by what has been typed', () => {
    assert.equal(draft.matching(two.presets, '', 'My station').length, 2);
    assert.equal(
      draft.matching(two.presets, 'port', 'My station')[0]?.id,
      's2',
    );
    assert.equal(draft.matching(two.presets, 'zzz', 'My station').length, 0);
  });

  it('finds an unnamed station by the word shown for it', () => {
    const unnamed: Draft = { presets: [at('', 's1')], activeId: 's1' };
    assert.equal(
      draft.matching(unnamed.presets, 'my sta', 'My station').length,
      1,
    );
  });
});
