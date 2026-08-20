import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_STATION } from '../src/data/station.ts';
import * as draft from '../src/data/stationDraft.ts';
import type { Draft } from '../src/data/stationDraft.ts';

/**
 * The dialog's working copy. Save writes what the reader sees, Cancel
 * costs nothing, and a station made by Add arrives with no name — which
 * `needsName` then refuses to save.
 */

const at = (name: string, id: string) => ({ id, name, ...DEFAULT_STATION });

const one: Draft = { presets: [at('Home', 's1')], activeId: 's1' };
const two: Draft = {
  presets: [at('Home', 's1'), at('Portable', 's2')],
  activeId: 's1',
};

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

  it('leaves a new station with no name', () => {
    // Named would be a name nobody chose. `needsName` makes the reader
    // give it one before it can be saved.
    const next = draft.addStation(one);
    assert.equal(next.presets.length, 2);
    assert.equal(draft.active(next).name, '');
    assert.equal(draft.needsName(next.presets, one.presets), true);
  });

  it('selects the station it just made', () => {
    const next = draft.addStation(one);
    assert.equal(next.activeId, next.presets[1]?.id);
  });

  it('copies the active station rather than starting from defaults', () => {
    const set = draft.setWatts(one, 5);
    const next = draft.addStation(set);
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
    assert.equal(draft.isDirty(draft.addStation(one), one), true);
  });

  it('counts a different station as a change', () => {
    // The active station is what the forecast runs for, so Save has to
    // write the switch and Cancel has to undo it.
    assert.equal(draft.isDirty(draft.selectStation(two, 's2'), two), true);
  });

  it('ignores a selection of a station that is not there', () => {
    assert.equal(draft.selectStation(two, 'nope').activeId, 's1');
  });

  it('trims names on the way to the store, not while typing', () => {
    // Trimming while typing eats the space as it is pressed, so "Field
    // day" could never be typed.
    const typed = draft.rename(one, 'Field ');
    assert.equal(draft.active(typed).name, 'Field ');
    assert.equal(draft.forStore(typed).presets[0]?.name, 'Field');
  });

  it('holds Save until every station has a name', () => {
    assert.equal(draft.needsName(two.presets, two.presets), false);
    // Any of them, not only the one being edited: a station left unnamed
    // and switched away from is still one nobody can tell apart.
    const added = draft.addStation(two);
    assert.equal(
      draft.needsName(draft.selectStation(added, 's1').presets, two.presets),
      true,
    );
  });

  it('counts a name of nothing but spaces as no name', () => {
    assert.equal(
      draft.needsName(draft.rename(one, '   ').presets, one.presets),
      true,
    );

    // One saved without a name is not a debt: every install starts with
    // one, and it can be edited without being named first.
    const never: Draft = { presets: [at('', 's1')], activeId: 's1' };
    assert.equal(draft.needsName(never.presets, never.presets), false);
  });
});
