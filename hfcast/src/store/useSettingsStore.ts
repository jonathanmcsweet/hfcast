import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
}

const PERSIST_VERSION = 1;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: 'hfcast.settings',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ themeMode: state.themeMode }),
      migrate: (persisted, version) => {
        if (version === PERSIST_VERSION) {
          return persisted as Partial<SettingsState>;
        }
        // An unreadable shape falls back to the default, which is the
        // system setting — the safe answer for a display preference.
        return undefined;
      },
    },
  ),
);
