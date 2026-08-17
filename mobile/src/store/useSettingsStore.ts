import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { BAND_ORDER, type BandKey } from '../../../shared/bands';
import type { ScopeMonths } from '../data/precomputePlan';
import type { UnitPreference } from '../data/units';

/**
 * Preferences that are not about a path.
 *
 * Separate from `usePathStore` because it answers a different question and
 * has a different lifetime: the path is what you are looking at, this is
 * how you want to be shown it.
 */

/**
 * `system` follows the device. It is the default because a phone set to
 * dark at night has already said what it wants.
 *
 * The other two exist because that setting is not always the right one for
 * one app: a light phone in a dark shack, or a screen being read outdoors
 * where the dark theme is the harder one.
 */
/**
 * `lowLight` is red on black, for reading in the dark without losing
 * dark adaptation (user, 2026-08-01) — an operator at a night station,
 * or anyone reading a chart beside a telescope.
 *
 * It is a choice and never a default: nothing the device reports says a
 * reader wants it, so `system` cannot select it, and it stays off until
 * somebody asks for it.
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
 * physics conditioned the new model's way: on a live effective index
 * when the app has one, and otherwise on the engine's built-in
 * day-of-year correction — which is measured to beat the classic run
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
   * map computed without a live space weather reading is stored, and
   * that is the map a device with no network computes anyway. So an
   * afternoon offline fills the store with exactly what the next
   * afternoon offline will want, and no run happens that would not have
   * happened.
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
   * Every band by default, with the smallest scope of months, so the
   * job somebody starts without reading anything is one month of
   * everything rather than a year of it.
   *
   * Each band is its own engine run — the whole-world fine grid has no
   * multi-band pass — so this is the strongest control a person has
   * over how long a large scope takes, as well as over the room.
   */
  precomputeBands: readonly BandKey[];
  setPrecomputeBands: (bands: readonly BandKey[]) => void;
  /**
   * Whether a job computing maps ahead waits for a charger.
   *
   * On, because the job it guards is the long one. A year of nine bands
   * is about 75 minutes of the engine at full tilt, and this app is for
   * devices carried into a field with no charger in reach — so the
   * default protects the battery somebody will need for the radio, and
   * turning it off is a deliberate act (user, 2026-08-11).
   *
   * Waiting rather than refusing: unplugging pauses the job and plugging
   * back in continues it, so a job left running overnight survives
   * somebody moving the tablet.
   */
  precomputeOnCharger: boolean;
  setPrecomputeOnCharger: (on: boolean) => void;
  /**
   * Whether the tools for measuring this device are shown.
   *
   * Off, and reached by tapping the version in About three times (user,
   * 2026-08-11). What it reveals is a benchmark that runs the engine
   * flat out for half a minute — useful to whoever is working on the
   * app, and to somebody sending numbers in, but not something to leave
   * in front of a person who came here to change the theme.
   *
   * A stored choice rather than a development build flag, because the
   * measurement worth having is of the build that ships. See
   * `diagnostics.ts`, which makes the same argument about its own
   * switch.
   */
  developer: boolean;
  setDeveloper: (on: boolean) => void;
  /**
   * Which prediction model answers.
   *
   * `voacap` by default: it is the behaviour every existing install
   * has, and switching models moves every number in the app, so that
   * is a choice a person makes rather than an upgrade that happens to
   * them.
   */
  engineModel: EngineModel;
  setEngineModel: (model: EngineModel) => void;
}

/** How much room the stored maps may take, unless somebody says otherwise. */
export const DEFAULT_MAP_BUDGET_MB = 128;

/** The sizes offered. A whole year of nine bands is about 171 MB. */
export const MAP_BUDGET_CHOICES = [64, 128, 256, 512] as const;

// Raised for the stored maps at 3, `developer` at 4, waiting for a
// charger at 5, the engine model at 6, and its renamed value at 7. An
// older saved shape is migrated forward rather than discarded: losing a
// theme and a units choice to gain a storage default would be a poor
// trade.
const PERSIST_VERSION = 7;

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
      engineModel: 'voacap',
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
        // Version 1 is the same shape without `units`, and version 2
        // without the stored maps. Keeping what was chosen and letting
        // the rest fall to their defaults is what the reader would
        // expect: the defaults are what they would have chosen anyway.
        const held = persisted as Partial<SettingsState>;
        if (version >= 1 && version <= 6) {
          return {
            ...held,
            units: held.units ?? 'auto',
            keepMaps: held.keepMaps ?? true,
            mapsOnCard: held.mapsOnCard ?? false,
            mapBudgetMb: held.mapBudgetMb ?? DEFAULT_MAP_BUDGET_MB,
            precomputeMonths: held.precomputeMonths ?? 1,
            precomputeBands: held.precomputeBands ?? BAND_ORDER,
            // Kept where a version 4 store already had one, so somebody
            // upgrading does not lose a choice they made.
            precomputeOnCharger: held.precomputeOnCharger ?? true,
            developer: held.developer ?? false,
            // A version 6 store spelled the new model `nowcast`, the
            // name it carried before release.
            engineModel: (held.engineModel as string) === 'nowcast'
              ? 'truecast'
              : held.engineModel ?? 'voacap',
          };
        }
        // Anything else falls back to the defaults, which follow the
        // device on every count that can.
        return undefined;
      },
    },
  ),
);
