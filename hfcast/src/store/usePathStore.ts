import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BandKey, Endpoint } from '../data/types';

/**
 * Non-network app state. Anything fetched lives in React Query instead.
 *
 * The store is deliberately small: the path being viewed, the band selected
 * and the hour selected. Everything else is derived.
 *
 * The path persists to the device. Without it a relaunch reset to the
 * built-in Seattle to Tokyo default, which on a dead connection meant
 * re-entering a location through a search that needs the network.
 */

/** Seattle to Tokyo, the path the app shipped with. Used until a location is chosen. */
const DEFAULT_FROM: Endpoint = {
  grid: 'CN87',
  label: 'Seattle',
  lat: 47.61,
  lon: -122.33,
};

const DEFAULT_TO: Endpoint = {
  grid: 'PM95',
  label: 'Tokyo',
  lat: 35.68,
  lon: 139.77,
};

/**
 * The band the app opens on.
 *
 * 40m is the general-purpose choice: it works by day out to a few hundred
 * kilometres and by night to a few thousand, so it is the band least likely
 * to show a beginner an empty row on their first launch.
 */
export const DEFAULT_BAND: BandKey = '40m';

interface PathState {
  from: Endpoint;
  to: Endpoint;
  /** The band every module is showing. Always set — there is no "auto". */
  band: BandKey;
  /** The hour every module is showing, 0..23. */
  hour: number;
  setFrom: (endpoint: Endpoint) => void;
  setTo: (endpoint: Endpoint) => void;
  swapEnds: () => void;
  setBand: (band: BandKey) => void;
  setHour: (hour: number) => void;
}

/**
 * Bump when a persisted field changes shape, and handle the old shape in
 * `migrate`. Without it a stored `Endpoint` from an older build would be
 * spread into state unchecked.
 */
const PERSIST_VERSION = 2;

export const usePathStore = create<PathState>()(
  persist(
    (set) => ({
      from: DEFAULT_FROM,
      to: DEFAULT_TO,
      band: DEFAULT_BAND,
      hour: new Date().getUTCHours(),
      setFrom: (from) => set({ from }),
      setTo: (to) => set({ to }),
      swapEnds: () => set((state) => ({ from: state.to, to: state.from })),
      setBand: (band) => set({ band }),
      setHour: (hour) =>
        set({ hour: Math.min(23, Math.max(0, Math.round(hour))) }),
    }),
    {
      name: 'hfcast.path',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      // The path and the band are worth restoring. `hour` is not: the app
      // should open on the current hour, not on whatever hour the user was
      // last inspecting.
      partialize: (state) => ({
        from: state.from,
        to: state.to,
        band: state.band,
      }),
      migrate: (persisted, version) => {
        // Version 1 stored `pinnedBand`, which could be null to mean
        // "follow the best band". That mode is gone, so a stored null
        // becomes the default band and the endpoints carry over.
        if (version === 1) {
          const old = persisted as {
            from?: Endpoint;
            to?: Endpoint;
            pinnedBand?: BandKey | null;
          };
          return {
            from: old.from ?? DEFAULT_FROM,
            to: old.to ?? DEFAULT_TO,
            band: old.pinnedBand ?? DEFAULT_BAND,
          };
        }
        if (version === PERSIST_VERSION) {
          return persisted as Partial<PathState>;
        }
        // A shape this build cannot read falls back to the defaults,
        // which is the safe outcome.
        return undefined;
      },
    },
  ),
);

/** Today, as the ISO date string the prediction request takes. */
export function today(from = new Date()): string {
  return from.toISOString().slice(0, 10);
}
