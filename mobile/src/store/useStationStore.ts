import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  type Antenna,
  usesBeam,
  usesGain,
  usesHeight,
} from '../../../shared/antenna.ts';
import type { ModeKey } from '../../../shared/modes.ts';
import {
  clamp,
  DEFAULT_STATION,
  FIRST_PRESET,
  LIMITS,
  MAX_NAME_LENGTH,
  nextId,
  type Station,
  type StationPreset,
} from '../data/station.ts';

/**
 * The operator's own station, or stations.
 *
 * Separate from `useSettingsStore`, which is about how the app looks, and
 * from `usePathStore`, which is about what is being looked at. This is
 * about the radio: it belongs to the person, not to the screen or the
 * path, and it changes every number the app reports.
 *
 * Kept as a list of named presets because a licence does not come with
 * one station. The same operator has a base with a beam, a portable set
 * with a wire in a tree, and a mobile rig, and the answer to "can I work
 * this" is a different answer for each. Switching between them has to be
 * one tap, not a re-entry of three settings.
 */

// Re-exported rather than re-declared. Every component that draws the
// station dialog reaches for these through the store, which is the shape
// they were in before `shared/` existed; the definitions are there now.
export type { Antenna, AntennaKey } from '../../../shared/antenna.ts';
export {
  ANTENNA_ORDER,
  usesBeam,
  usesGain,
  usesHeight,
} from '../../../shared/antenna.ts';
export type { ModeKey } from '../../../shared/modes.ts';
export { MODE_ORDER } from '../../../shared/modes.ts';
export type { Station, StationPreset } from '../data/station.ts';
export {
  DEFAULT_STATION,
  LIMITS,
  MAX_NAME_LENGTH,
  nextId,
} from '../data/station.ts';

interface StationState {
  presets: readonly StationPreset[];
  activeId: string;
  /**
   * True while the station dialog is open.
   *
   * Every setting here changes the forecast, and on a device the forecast is an
   * engine run rather than a request to a server. Writing each keystroke
   * straight through meant deleting two digits of "100" started a run at "10"
   * and another at "1", so setting 1 W from 100 W computed two forecasts nobody
   * asked for. The queries stop while this is true and run once when it clears.
   *
   * Deliberately not persisted: a dialog is not open when the app starts, and a
   * saved `true` would leave the forecast permanently frozen.
   */
  editing: boolean;
  setEditing: (editing: boolean) => void;
  setWatts: (watts: number) => void;
  setMode: (mode: ModeKey) => void;
  setAntenna: (antenna: Partial<Antenna>) => void;
  /** Renames the active preset. An empty name falls back to the default. */
  rename: (name: string) => void;
  /** Copies the active preset, selects the copy, and returns nothing. */
  addPreset: () => void;
  /** Removes a preset. The last one is kept, reset rather than deleted. */
  removePreset: (id: string) => void;
  selectPreset: (id: string) => void;
  /** Returns the active preset's settings to the defaults. */
  reset: () => void;
  /**
   * Writes a whole edited list back, in one go.
   *
   * What the station dialog's Save button calls. Every other action here
   * changes one field of one preset, which is what the dialog used to do
   * on each keystroke — and since this store is persisted, each of those
   * was a serialization of the list and a write to AsyncStorage. The
   * dialog now keeps a draft (`data/stationDraft.ts`) and commits it
   * once, so a form filled in from top to bottom costs one write rather
   * than one per character.
   */
  commit: (next: {
    presets: readonly StationPreset[];
    activeId: string;
  }) => void;
}

/** Applies a change to the active preset and leaves the others alone. */
const onActive = (
  state: StationState,
  change: (preset: StationPreset) => StationPreset,
) => ({
  presets: state.presets.map((preset) =>
    preset.id === state.activeId ? change(preset) : preset
  ),
});

const PERSIST_VERSION = 2;

export const useStationStore = create<StationState>()(
  persist(
    (set) => ({
      presets: [FIRST_PRESET],
      activeId: FIRST_PRESET.id,
      editing: false,

      setEditing: (editing) => set({ editing }),

      setWatts: (watts) =>
        set((state) =>
          onActive(state, (preset) => ({
            ...preset,
            watts: clamp(watts, LIMITS.watts),
          }))
        ),

      setMode: (mode) =>
        set((state) => onActive(state, (preset) => ({ ...preset, mode }))),

      setAntenna: (antenna) =>
        set((state) =>
          onActive(state, (preset) => ({
            ...preset,
            antenna: {
              ...preset.antenna,
              ...antenna,
              ...(antenna.heightM === undefined
                ? {}
                : { heightM: clamp(antenna.heightM, LIMITS.heightM) }),
              ...(antenna.gainDbd === undefined
                ? {}
                : { gainDbd: clamp(antenna.gainDbd, LIMITS.gainDbd) }),
              ...(antenna.beamDeg === undefined
                ? {}
                : { beamDeg: ((antenna.beamDeg % 360) + 360) % 360 }),
            },
          }))
        ),

      rename: (name) =>
        set((state) =>
          onActive(state, (preset) => ({
            ...preset,
            name: name.trim().slice(0, MAX_NAME_LENGTH),
          }))
        ),

      // A copy rather than a blank one: a second station is usually the
      // first with one thing different, and starting from the defaults
      // would mean setting all three again.
      addPreset: () =>
        set((state) => {
          const source = state.presets.find((p) => p.id === state.activeId)
            ?? FIRST_PRESET;
          const id = nextId(state.presets);
          return {
            presets: [...state.presets, { ...source, id, name: '' }],
            activeId: id,
          };
        }),

      removePreset: (id) =>
        set((state) => {
          // Never nothing. With one preset left, deleting empties it back
          // to the defaults instead, so the app always has a station.
          if (state.presets.length <= 1) {
            return { presets: [FIRST_PRESET], activeId: FIRST_PRESET.id };
          }
          const presets = state.presets.filter((preset) => preset.id !== id);
          const activeId = state.activeId === id
            ? presets[0]?.id ?? FIRST_PRESET.id
            : state.activeId;
          return { presets, activeId };
        }),

      selectPreset: (activeId) =>
        set((state) =>
          state.presets.some((preset) => preset.id === activeId)
            ? { activeId }
            : {}
        ),

      reset: () =>
        set((state) =>
          onActive(state, (preset) => ({
            id: preset.id,
            name: preset.name,
            ...DEFAULT_STATION,
          }))
        ),

      // Guarded rather than trusted. A commit that named no preset, or
      // named one that is not in the list it arrived with, would leave
      // the app with no station to run a forecast for.
      commit: ({ presets, activeId }) =>
        set(() => {
          if (presets.length === 0) {
            return { presets: [FIRST_PRESET], activeId: FIRST_PRESET.id };
          }
          const known = presets.some((preset) => preset.id === activeId);
          return {
            presets,
            activeId: known ? activeId : presets[0]?.id ?? FIRST_PRESET.id,
          };
        }),
    }),
    {
      name: 'hfcast.station',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        presets: state.presets,
        activeId: state.activeId,
      }),
      migrate: (persisted, version) => {
        if (version === PERSIST_VERSION) {
          return persisted as Partial<StationState>;
        }
        // Version 1 held one unnamed station at the top level. It becomes
        // the first preset, so a reader who had set up their radio keeps
        // it rather than starting again.
        if (
          version === 1 && persisted !== null && typeof persisted === 'object'
        ) {
          const old = persisted as Partial<Station>;
          return {
            presets: [{
              ...FIRST_PRESET,
              ...(old.watts === undefined ? {} : { watts: old.watts }),
              ...(old.mode === undefined ? {} : { mode: old.mode }),
              ...(old.antenna === undefined ? {} : { antenna: old.antenna }),
            }],
            activeId: FIRST_PRESET.id,
          };
        }
        // Anything else falls back to the defaults, which are the
        // assumptions the app made before any of this existed.
        return undefined;
      },
    },
  ),
);

/** The preset in force, or the defaults if the saved state names none. */
export function activePreset(state: {
  presets: readonly StationPreset[];
  activeId: string;
}): StationPreset {
  return state.presets.find((preset) => preset.id === state.activeId)
    ?? state.presets[0]
    ?? FIRST_PRESET;
}

/**
 * The same, for a component.
 *
 * The lookup is a find over the list and it returns an object the store
 * already holds, so this subscribes to a stable reference and does not
 * make a new value on every render.
 */
export function useActivePreset(): StationPreset {
  return useStationStore(activePreset);
}

/**
 * The station as query parameters.
 *
 * Fields the antenna does not use are left out rather than sent as
 * zeroes: they would otherwise become part of the query key and the
 * server's cache key, so changing a beam heading would refetch every
 * dipole answer for nothing. The preset's name and identifier are not
 * sent at all — they are how the reader finds this station, not anything
 * the model reads.
 */
export function stationParams(station: Station): Record<string, string> {
  const { watts, mode, antenna } = station;
  return {
    watts: String(watts),
    mode,
    ...(antenna.type === 'isotropic' ? {} : { ant: antenna.type }),
    ...(usesHeight(antenna.type)
      ? { antHeight: String(antenna.heightM) }
      : {}),
    ...(usesGain(antenna.type) ? { antGain: String(antenna.gainDbd) } : {}),
    ...(usesBeam(antenna.type) ? { beam: String(antenna.beamDeg) } : {}),
  };
}

/** A stable string for a query key: same station, same key. */
export const stationKey = (station: Station): string =>
  Object.entries(stationParams(station))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
