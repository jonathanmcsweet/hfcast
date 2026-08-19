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
 * Separate from `useSettingsStore`, about how the app looks, and from
 * `usePathStore`, about what is being looked at. This is the radio: it
 * belongs to the person and changes every number the app reports.
 *
 * A list of named presets, because a licence does not come with one
 * station: a base with a beam, a portable with a wire in a tree, a mobile
 * rig. "Can I work this" is a different answer for each, and switching
 * has to be one tap rather than three settings re-entered.
 */

// Re-exported rather than re-declared: every component reaches for these
// through the store, which is the shape they were in before `shared/`.
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
   * Every setting here changes the forecast, which on a device is an
   * engine run. Writing each keystroke through meant deleting two digits
   * of "100" ran a forecast at "10" and another at "1". The queries stop
   * while this is true and run once when it clears.
   *
   * Not persisted: a dialog is not open when the app starts, and a saved
   * `true` would freeze the forecast for good.
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
   * Writes a whole edited list back, in one go. What Save calls.
   *
   * Every other action here changes one field of one preset, and this
   * store is persisted, so the dialog's old keystroke-by-keystroke
   * writing cost a serialization and a disk write each time. It now
   * keeps a draft (`data/stationDraft.ts`) and commits once.
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

      // Guarded, not trusted: a commit naming no preset, or one not in
      // the list it arrived with, would leave no station to forecast for.
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
 * The same, for a component. The lookup returns an object the store
 * already holds, so this subscribes to a stable reference rather than
 * making a new value on every render.
 */
export function useActivePreset(): StationPreset {
  return useStationStore(activePreset);
}

/**
 * The station as query parameters.
 *
 * Fields the antenna does not use are left out rather than sent as
 * zeroes: they would join the query key and the server's cache key, so
 * changing a beam heading would refetch every dipole answer. The name and
 * identifier are not sent at all — the model does not read them.
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
