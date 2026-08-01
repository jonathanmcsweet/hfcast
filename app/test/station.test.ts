import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  activePreset,
  ANTENNA_ORDER,
  DEFAULT_STATION,
  LIMITS,
  MODE_ORDER,
  nextId,
  type Station,
  stationKey,
  stationParams,
  type StationPreset,
  usesBeam,
  usesGain,
  usesHeight,
} from '../src/store/useStationStore.ts';

/**
 * The station decides every number on the screen, and it reaches the
 * server as query parameters. What matters here is that those parameters
 * describe the station exactly: a field left out or spelled differently
 * does not fail, it returns a forecast for a station the user does not
 * have.
 *
 * The key matters for the same reason. React Query and the server both
 * cache on it, so a key that misses a field serves an answer computed for
 * a different antenna, which looks like an ordinary forecast.
 */

const station = (over: Partial<Station> = {}): Station => ({
  ...DEFAULT_STATION,
  ...over,
});

describe('the station as query parameters', () => {
  it('sends nothing about an antenna when none is described', () => {
    // The server's own default is the isotrope, so an unspecified station
    // is an absent parameter rather than a named one.
    const params = stationParams(station());
    assert.equal(params.ant, undefined);
    assert.equal(params.antHeight, undefined);
    assert.equal(params.antGain, undefined);
    assert.equal(params.beam, undefined);
  });

  it('always sends the power and the mode', () => {
    const params = stationParams(station({ watts: 5, mode: 'ft8' }));
    assert.equal(params.watts, '5');
    assert.equal(params.mode, 'ft8');
  });

  it('sends a height for every antenna that has one', () => {
    const withHeight = ANTENNA_ORDER.filter(usesHeight);
    assert.deepEqual(
      withHeight.map((type) =>
        stationParams(
          station({ antenna: { ...DEFAULT_STATION.antenna, type } }),
        ).antHeight
      ),
      withHeight.map(() => '10'),
    );
  });

  it('sends a dipole its bearing but not a gain figure', () => {
    // The bearing matters: measured against the engine, turning a dipole
    // through the compass is worth 12 dB and takes the reliability from
    // 7% to 71%. An earlier version pinned it at zero and reported the
    // null off the ends of the wire as though it were the answer.
    //
    // The gain does not: only a beam has one to state.
    const params = stationParams(
      station({
        antenna: { type: 'dipole', heightM: 12, gainDbd: 9, beamDeg: 180 },
      }),
    );
    assert.equal(params.ant, 'dipole');
    assert.equal(params.antHeight, '12');
    assert.equal(params.beam, '180');
    assert.equal(params.antGain, undefined);
  });

  it('sends the vertical no bearing, because it measured 0 dB over the compass', () => {
    // Sending one would put it in the cache key, so turning a direction
    // the model never reads would refetch every answer and change none.
    const params = stationParams(
      station({
        antenna: { type: 'vertical', heightM: 12, gainDbd: 9, beamDeg: 180 },
      }),
    );
    assert.equal(params.ant, 'vertical');
    assert.equal(params.antHeight, '12');
    assert.equal(params.beam, undefined);
    assert.equal(params.antGain, undefined);
  });

  it('sends everything a beam has', () => {
    const params = stationParams(
      station({
        antenna: { type: 'yagi', heightM: 20, gainDbd: 8, beamDeg: 302 },
      }),
    );
    assert.deepEqual(params, {
      watts: '100',
      mode: 'cw',
      ant: 'yagi',
      antHeight: '20',
      antGain: '8',
      beam: '302',
    });
  });

  it('agrees with itself about which antennas read which fields', () => {
    // usesGain and usesBeam gate both the controls in the modal and the
    // parameters sent. If they disagreed, a control would be shown for a
    // value that never left the app.
    const gated = ANTENNA_ORDER.map((type) => {
      const params = stationParams(
        station({ antenna: { ...DEFAULT_STATION.antenna, type } }),
      );
      return {
        type,
        gain: params.antGain !== undefined,
        beam: params.beam !== undefined,
      };
    });
    assert.deepEqual(
      gated,
      ANTENNA_ORDER.map((type) => ({
        type,
        gain: usesGain(type),
        beam: usesBeam(type),
      })),
    );
  });
});

describe('the station as a cache key', () => {
  it('gives the same station the same key', () => {
    assert.equal(stationKey(station()), stationKey(station()));
  });

  it('changes when any field the server reads changes', () => {
    // Each of these moves the forecast, so each has to move the key.
    const base = stationKey(
      station({
        antenna: { type: 'yagi', heightM: 20, gainDbd: 8, beamDeg: 300 },
      }),
    );
    const changed = [
      station({ watts: 400 }),
      station({ mode: 'ssb' }),
      station({
        antenna: { type: 'dipole', heightM: 20, gainDbd: 8, beamDeg: 300 },
      }),
      station({
        antenna: { type: 'yagi', heightM: 21, gainDbd: 8, beamDeg: 300 },
      }),
      station({
        antenna: { type: 'yagi', heightM: 20, gainDbd: 9, beamDeg: 300 },
      }),
      station({
        antenna: { type: 'yagi', heightM: 20, gainDbd: 8, beamDeg: 301 },
      }),
    ];
    assert.ok(changed.every((next) => stationKey(next) !== base));
  });

  it('does not change when a field that antenna ignores changes', () => {
    // A vertical is the same in every direction — measured at 0 dB over
    // the whole compass — so turning its bearing must not refetch. The
    // server would return the same numbers.
    const vertical = (beamDeg: number) =>
      stationKey(
        station({
          antenna: { type: 'vertical', heightM: 12, gainDbd: 6, beamDeg },
        }),
      );
    assert.equal(vertical(0), vertical(270));
  });

  it('changes when a dipole is turned, because the engine answers differently', () => {
    const dipole = (beamDeg: number) =>
      stationKey(
        station({
          antenna: { type: 'dipole', heightM: 12, gainDbd: 6, beamDeg },
        }),
      );
    assert.notEqual(dipole(0), dipole(90));
  });
});

describe('the defaults', () => {
  it('are the assumptions the app made before this existed', () => {
    // 100 W to an isotrope at a CW threshold. A reader who never opens
    // the settings must see exactly what they saw before.
    assert.equal(DEFAULT_STATION.watts, 100);
    assert.equal(DEFAULT_STATION.mode, 'cw');
    assert.equal(DEFAULT_STATION.antenna.type, 'isotropic');
  });

  it('offers the modes hardest first and the antennas simplest first', () => {
    assert.equal(MODE_ORDER[0], 'fm');
    assert.equal(MODE_ORDER[MODE_ORDER.length - 1], 'wspr');
    assert.equal(ANTENNA_ORDER[0], 'isotropic');
  });
});

describe('saved stations', () => {
  const preset = (id: string, over: Partial<StationPreset> = {}) => ({
    id,
    name: '',
    ...DEFAULT_STATION,
    ...over,
  });

  it('never hands back nothing, even from an empty list', () => {
    // The screen reads a station on every render. A missing one would be
    // a crash on the first frame rather than a blank field.
    assert.equal(
      activePreset({ presets: [], activeId: 'gone' }).watts,
      DEFAULT_STATION.watts,
    );
  });

  it('falls back to the first when the active one has been deleted', () => {
    const presets = [preset('s1', { watts: 5 }), preset('s2')];
    assert.equal(activePreset({ presets, activeId: 'sX' }).watts, 5);
  });

  it('finds the active one among several', () => {
    const presets = [preset('s1'), preset('s2', { watts: 400 })];
    assert.equal(activePreset({ presets, activeId: 's2' }).watts, 400);
  });

  it('never reissues an identifier that is still in use', () => {
    // Counted rather than random, so a test can predict it and two
    // devices restoring one backup cannot disagree.
    assert.equal(nextId([]), 's1');
    assert.equal(nextId([preset('s1')]), 's2');
    // A gap left by a deletion must not be filled: the next identifier is
    // past the highest, not into the hole.
    assert.equal(nextId([preset('s1'), preset('s7')]), 's8');
  });

  it('leaves the name out of what gets sent and cached', () => {
    // Two stations set up identically should share an answer, and
    // renaming one should not throw its forecast away.
    const named = stationParams({ ...DEFAULT_STATION });
    assert.equal(Object.keys(named).includes('name'), false);
    assert.equal(Object.keys(named).includes('id'), false);
  });
});

describe('the power range', () => {
  it('reaches the QRP settings operators actually use', () => {
    // Half a watt is a real setting on a real radio, and the model tracks
    // power exactly down to a tenth.
    assert.ok(LIMITS.watts.min <= 0.5);
  });

  it('stops where VOACAP stops tracking power', () => {
    // Below a tenth of a watt the deck's kilowatt field rounds away, and
    // at a hundredth it returns a better answer than a hundred watts.
    // A control that went there would produce confident nonsense.
    assert.equal(LIMITS.watts.min, 0.1);
  });
});
