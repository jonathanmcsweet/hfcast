import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { BAND_ORDER, type BandKey } from '../../../shared/bands';
import { withNewBands } from '../data/bandChoice.ts';
import type { ScopeMonths } from '../data/precomputePlan';
import type { UnitPreference } from '../data/units';

/**
 * Preferences that are not about a path.
 *
 * Separate from `usePathStore`, which has a different lifetime: the path
 * is what you are looking at, this is how you want to be shown it.
 */

/**
 * `system` follows the device, and is the default: a phone set to dark at
 * night has already said what it wants. Light and dark are here because
 * that is not always right for one app — a light phone in a dark shack,
 * or a screen read outdoors where dark is the harder one.
 *
 * `lowLight` is red on black, for reading in the dark without losing dark
 * adaptation (user, 2026-08-01). A choice and never a default: nothing
 * the device reports says a reader wants it.
 */
export type ThemeMode = 'system' | 'light' | 'dark' | 'lowLight';

export const THEME_MODES: ThemeMode[] = [
  'system',
  'light',
  'dark',
  'lowLight',
];

/**
 * Which prediction model answers.
 *
 * `voacap` is the engine as it has always run. `truecast` is the same
 * physics on a live effective index where there is one, and otherwise on
 * the engine's day-of-year correction — measured to beat the classic run
 * with no network at all (engine repository, `docs/offline.md`).
 */
export type EngineModel = 'voacap' | 'truecast';

export const ENGINE_MODELS: EngineModel[] = ['voacap', 'truecast'];

interface SettingsState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /**
   * Feet or metres. `auto` follows the device's region, which is right for
   * nearly everybody: three countries measure a mast in feet.
   */
  units: UnitPreference;
  setUnits: (units: UnitPreference) => void;
  /**
   * Whether computed maps are kept on disk to be read again.
   *
   * On by default, because what it keeps costs nothing to make: only a
   * map computed without a live reading is stored, which is the map a
   * device with no network computes anyway. An afternoon offline fills
   * the store with what the next one will want, and no extra run happens.
   */
  keepMaps: boolean;
  setKeepMaps: (keep: boolean) => void;
  /**
   * Whether they go on the memory card.
   *
   * Off by default and offered only where a card is present. The old
   * tablets this app is for are often short of internal storage and take
   * one (user, 2026-08-10).
   */
  mapsOnCard: boolean;
  setMapsOnCard: (onCard: boolean) => void;
  /** How much room the stored maps may take, in megabytes. */
  mapBudgetMb: number;
  setMapBudgetMb: (mb: number) => void;
  /** How many months ahead the compute-ahead job covers, including this. */
  precomputeMonths: ScopeMonths;
  setPrecomputeMonths: (months: ScopeMonths) => void;
  /**
   * Which bands it computes.
   *
   * Every band by default, with the smallest scope of months, so a job
   * started without reading anything is one month of everything.
   *
   * Each band is its own engine run — the whole-world fine grid has no
   * multi-band pass — so this is the strongest control over how long a
   * large scope takes, as well as over the room.
   */
  precomputeBands: readonly BandKey[];
  setPrecomputeBands: (bands: readonly BandKey[]) => void;
  /**
   * Whether a job computing maps ahead waits for a charger.
   *
   * On, because the job it guards is the long one: a year of every band
   * is about 84 minutes of engine time, and this app is for devices
   * carried where there is no charger, so the default protects the
   * battery somebody needs for the radio (user, 2026-08-11).
   *
   * Waiting rather than refusing: unplugging pauses the job and plugging
   * in continues it, so an overnight job survives the tablet being moved.
   */
  precomputeOnCharger: boolean;
  setPrecomputeOnCharger: (on: boolean) => void;
  /**
   * Whether the tools for measuring this device are shown.
   *
   * Off, reached by tapping the version in About three times (user,
   * 2026-08-11). It reveals a benchmark that runs the engine flat out for
   * half a minute: useful to whoever works on the app or sends numbers
   * in, not to somebody who came here to change the theme.
   *
   * A stored choice rather than a build flag, because the measurement
   * worth having is of the build that ships. See `diagnostics.ts`.
   */
  developer: boolean;
  setDeveloper: (on: boolean) => void;
  /**
   * Which prediction model answers.
   *
   * `truecast` by default: measured to beat the classic model against
   * ionosonde soundings, with no network at all (engine repository,
   * `docs/comparison.md`), so a reader who never opens this menu gets
   * the better answer. `voacap` stays for anyone who wants the classic
   * numbers.
   */
  engineModel: EngineModel;
  setEngineModel: (model: EngineModel) => void;
}

/** How much room the stored maps may take, unless somebody says otherwise. */
export const DEFAULT_MAP_BUDGET_MB = 128;

/** The sizes offered. A whole year of every band is about 190 MB. */
export const MAP_BUDGET_CHOICES = [64, 128, 256, 512] as const;

// Raised for the stored maps at 3, `developer` at 4, waiting for a
// charger at 5, the engine model at 6, its renamed value at 7, and the
// new model becoming the default at 8. An older saved shape is migrated
// forward rather than discarded: losing a theme and a units choice to
// gain a storage default would be a poor trade.
const PERSIST_VERSION = 9;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
      units: 'auto',
      setUnits: (units) => set({ units }),
      keepMaps: true,
      setKeepMaps: (keepMaps) => set({ keepMaps }),
      mapsOnCard: false,
      setMapsOnCard: (mapsOnCard) => set({ mapsOnCard }),
      mapBudgetMb: DEFAULT_MAP_BUDGET_MB,
      setMapBudgetMb: (mapBudgetMb) => set({ mapBudgetMb }),
      precomputeMonths: 1,
      setPrecomputeMonths: (precomputeMonths) => set({ precomputeMonths }),
      precomputeBands: BAND_ORDER,
      setPrecomputeBands: (precomputeBands) => set({ precomputeBands }),
      precomputeOnCharger: true,
      setPrecomputeOnCharger: (precomputeOnCharger) =>
        set({ precomputeOnCharger }),
      developer: false,
      setDeveloper: (developer) => set({ developer }),
      engineModel: 'truecast',
      setEngineModel: (engineModel) => set({ engineModel }),
    }),
    {
      name: 'hfcast.settings',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        units: state.units,
        keepMaps: state.keepMaps,
        mapsOnCard: state.mapsOnCard,
        mapBudgetMb: state.mapBudgetMb,
        precomputeMonths: state.precomputeMonths,
        precomputeBands: state.precomputeBands,
        precomputeOnCharger: state.precomputeOnCharger,
        developer: state.developer,
        engineModel: state.engineModel,
      }),
      migrate: (persisted, version) => {
        if (version === PERSIST_VERSION) {
          return persisted as Partial<SettingsState>;
        }
        if (persisted === null || typeof persisted !== 'object') {
          return undefined;
        }
        // Version 1 is the same shape without `units`, version 2 without
        // the stored maps. What was chosen is kept and the rest fall to
        // defaults, which is what they would have chosen anyway.
        const held = persisted as Partial<SettingsState>;
        if (version >= 1 && version <= 8) {
          return {
            ...held,
            units: held.units ?? 'auto',
            keepMaps: held.keepMaps ?? true,
            mapsOnCard: held.mapsOnCard ?? false,
            mapBudgetMb: held.mapBudgetMb ?? DEFAULT_MAP_BUDGET_MB,
            precomputeMonths: held.precomputeMonths ?? 1,
            // 60m arrived in version 9. A store that held every band
            // before it meant "all of them" and gets the new one; a
            // chosen few keeps exactly those.
            precomputeBands: withNewBands(held.precomputeBands),
            // Kept where a version 4 store already had one, so somebody
            // upgrading does not lose a choice they made.
            precomputeOnCharger: held.precomputeOnCharger ?? true,
            developer: held.developer ?? false,
            // Every stored shape up to 7 moves to the new default, and
            // nobody loses a decision: the choice never reached a
            // released build, so a stored `voacap` is the old default
            // rather than a pick. Version 6 spelled the new model
            // `nowcast` and lands in the same place.
            engineModel: 'truecast',
          };
        }
        // Anything else falls back to the defaults, which follow the
        // device on every count that can.
        return undefined;
      },
    },
  ),
);
