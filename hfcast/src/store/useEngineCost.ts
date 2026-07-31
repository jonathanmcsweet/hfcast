/**
 * What the engine costs on this device, measured and remembered.
 *
 * The whole-world fine grid is affordable on some devices and not on
 * others, and the difference is about a factor of ten. Rather than guess
 * from a model name or a core count, the app times the coarse coverage
 * run it already makes — 192 points, once per band or hour change — and
 * keeps the cost per point.
 *
 * Persisted, so a device that has already answered the question does not
 * spend the first band change of every session answering it again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { medianOf } from '../data/engineBudget';

/**
 * How many readings are kept.
 *
 * Enough that one slow run cannot move the median, few enough that a
 * device which has genuinely changed — a tablet taken off a charger and
 * throttled, a phone that has warmed up — is followed within a few band
 * changes rather than held to what it managed last week.
 */
export const COST_SAMPLES = 7;

interface EngineCostState {
  /** Milliseconds per grid point, newest last. */
  samples: number[];
  /**
   * Records one run.
   *
   * Takes the run's own point count rather than assuming the coarse
   * grid's, so the fine run's timing can feed the same median once a
   * device is running one.
   */
  record: (elapsedMs: number, points: number) => void;
  /** The median cost per point, or null before the first run. */
  msPerPoint: () => number | null;
}

export const useEngineCost = create<EngineCostState>()(
  persist(
    (set, get) => ({
      samples: [],

      record: (elapsedMs, points) => {
        // A run of no points says nothing, and a negative or absent
        // clock reading is not a measurement. Both are dropped rather
        // than stored as a zero that would drag the median down and
        // turn the fine grid on for a device that cannot hold it.
        if (points <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
          return;
        }
        set((state) => ({
          samples: [...state.samples, elapsedMs / points].slice(-COST_SAMPLES),
        }));
      },

      msPerPoint: () => medianOf(get().samples),
    }),
    {
      name: 'hfcast-engine-cost',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
