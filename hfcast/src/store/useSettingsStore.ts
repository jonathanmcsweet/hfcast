import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

interface SettingsState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /**
   * Feet or metres. `auto` follows the device's region, which is right for
   * nearly everybody: three countries measure a mast in feet.
   */
  units: UnitPreference;
  setUnits: (units: UnitPreference) => void;
}

// Raised for `units`. A saved version 1 has no units field, so it is
// migrated forward rather than discarded: losing a theme choice to gain a
// units default would be a poor trade.
const PERSIST_VERSION = 2;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
      units: 'auto',
      setUnits: (units) => set({ units }),
    }),
    {
      name: 'hfcast.settings',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        units: state.units,
      }),
      migrate: (persisted, version) => {
        if (version === PERSIST_VERSION) {
          return persisted as Partial<SettingsState>;
        }
        // Version 1 is the same shape without `units`. Keeping the theme
        // and letting units fall to `auto` is what the reader would
        // expect: `auto` is what they would have chosen anyway.
        if (
          version === 1 && persisted !== null && typeof persisted === 'object'
        ) {
          return { ...(persisted as Partial<SettingsState>), units: 'auto' };
        }
        // Anything else falls back to the defaults, which follow the
        // device on both counts.
        return undefined;
      },
    },
  ),
);
