import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * What this device measured about itself.
 *
 * Separate from `useSettingsStore` because nobody chose any of this: it
 * is a property of the hardware in hand, found by running the engine on
 * it. The users this app is for carry old, slow, cheap devices — see
 * "Who the users are" in AGENTS.md — so numbers that depend on the
 * device are measured on the device, never assumed from a fast one.
 */

/** One calibration: what was measured, on what, by which build. */
export interface MeasuredThreads {
  /** The thread count that ran the probe grid fastest here. */
  threads: number;
  /** How long one grid point takes on one of this device's cores. */
  pointMs: number;
  /** The core count when measured — a different count means a different device. */
  cores: number;
  /** The app version that measured, so an engine change re-measures. */
  version: string;
  /** When, in milliseconds since the epoch, for going stale. */
  at: number;
}

interface DeviceState {
  measured: MeasuredThreads | null;
  setMeasured: (measured: MeasuredThreads) => void;
}

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set) => ({
      measured: null,
      setMeasured: (measured) => set({ measured }),
    }),
    {
      name: 'hfcast-device',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
