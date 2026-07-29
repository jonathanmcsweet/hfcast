import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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

/** Modes an amateur station picks between, hardest to easiest. */
export const MODE_ORDER = [
  'fm',
  'am',
  'ssb',
  'rtty',
  'cw',
  'psk31',
  'ft8',
  'js8',
  'wspr',
] as const;

export type ModeKey = (typeof MODE_ORDER)[number];

/** Antenna families, in the order the picker lists them. */
export const ANTENNA_ORDER = [
  'isotropic',
  'dipole',
  'vertical',
  'invertedL',
  'yagi',
] as const;

export type AntennaKey = (typeof ANTENNA_ORDER)[number];

export interface Antenna {
  type: AntennaKey;
  /**
   * Height above ground, metres. The feed point of a dipole or yagi, the
   * element height of a vertical, the horizontal section of an inverted L.
   *
   * Always metres, whatever the reader is shown: the server takes metres,
   * and a preset saved in feet would become wrong the moment somebody
   * switched units.
   */
  heightM: number;
  /** Gain over a half-wave dipole, dB. Only the yagi uses it. */
  gainDbd: number;
  /** Where the beam points, degrees true. Only the yagi uses it. */
  beamDeg: number;
}

/** What a run needs to know about the transmitting end. */
export interface Station {
  watts: number;
  mode: ModeKey;
  antenna: Antenna;
}

/**
 * One saved station.
 *
 * An empty `name` means the preset has never been named, and the UI shows
 * a translated default for it. Storing the translated word instead would
 * freeze it in whatever language the app happened to be in when the
 * preset was made.
 */
export interface StationPreset extends Station {
  id: string;
  name: string;
}

/**
 * What the server clamps to. Repeated here so the controls stop at the
 * same place the server would, rather than letting a value be set that
 * quietly becomes something else on the way through.
 */
export const LIMITS = {
  // A tenth of a watt is where VOACAP stops tracking power: below that
  // the deck's kilowatt field rounds away, and at a hundredth of a watt
  // it returns a better answer than a hundred watts. QRP work happens at
  // and below one watt, so the range reaches there and stops where the
  // model does.
  watts: { min: 0.1, max: 1500 },
  heightM: { min: 1, max: 100 },
  gainDbd: { min: 0, max: 20 },
} as const;

/** How long a preset name may be. Long enough to name a station, short
 * enough to sit beside three icons on a phone. */
export const MAX_NAME_LENGTH = 24;

/** Only a beam has a gain figure to state. */
export const usesGain = (type: AntennaKey) => type === 'yagi';
export const usesHeight = (type: AntennaKey) => type !== 'isotropic';

/**
 * Which families have a direction at all.
 *
 * Measured against the engine rather than assumed: swept through the
 * compass on a 14 MHz path, a dipole moves 12 dB and an inverted L 12 dB,
 * and a vertical monopole moves by nothing. See `data/orientation.ts`.
 * Sending a bearing for the vertical would put it in the cache key and
 * refetch answers that cannot differ.
 */
export const usesBeam = (type: AntennaKey) =>
  type === 'dipole' || type === 'invertedL' || type === 'yagi';

/**
 * The station every earlier version of the app assumed without saying:
 * 100 W to an isotropic antenna, at the threshold CW needs.
 *
 * Keeping these as the defaults means a reader who never opens the
 * settings sees exactly what they saw before.
 */
export const DEFAULT_STATION: Station = {
  watts: 100,
  mode: 'cw',
  antenna: { type: 'isotropic', heightM: 10, gainDbd: 6, beamDeg: 0 },
};

/**
 * The next free identifier, given the ones in use.
 *
 * Counted rather than random so the store stays a pure function of what it
 * held: a test can add a preset and know what it will be called, and two
 * devices restoring the same backup do not disagree.
 */
export function nextId(presets: readonly StationPreset[]): string {
  const used = presets
    .map((preset) => Number(preset.id.replace(/^s/, '')))
    .filter((n) => Number.isInteger(n));
  return `s${Math.max(0, ...used) + 1}`;
}

const FIRST_PRESET: StationPreset = {
  id: 's1',
  name: '',
  ...DEFAULT_STATION,
};

const clamp = (value: number, { min, max }: { min: number; max: number; }) =>
  Math.min(max, Math.max(min, value));

interface StationState {
  presets: readonly StationPreset[];
  activeId: string;
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
