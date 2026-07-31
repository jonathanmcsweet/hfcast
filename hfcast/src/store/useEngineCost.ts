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

import {
  type CostSample,
  fineGlobeAffordable,
  keepFastest,
  marginalMsPerPoint,
  projectedFineMs,
} from '../data/engineBudget';

interface EngineCostState {
  /** Timed runs, newest last, each with the size it covered. */
  samples: CostSample[];
  /**
   * Records one run.
   *
   * Takes the run's own point count rather than assuming the coarse
   * grid's, so the fine run's timing can feed the same median once a
   * device is running one.
   */
  record: (elapsedMs: number, points: number) => void;
  /**
   * The marginal cost of one more point, or null until runs of two
   * different sizes have been seen. A single size cannot separate a
   * run's fixed cost from its per-point cost.
   */
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
          samples: keepFastest(state.samples, { points, ms: elapsedMs }),
        }));

        // Said out loud, because this decision is otherwise invisible.
        // The fine grid either appears or it does not, and a device that
        // never shows it looks the same whether the gate refused, the
        // measurement never arrived, or the run failed. Three different
        // faults with one symptom is not something a screen can be read
        // for — so the numbers behind the verdict go to the log, where
        // `adb logcat` can reach them on a device that cannot be
        // debugged any other way.
        //
        // One line per engine run, which is a handful per band change.
        const fitted = marginalMsPerPoint(get().samples);
        const projected = projectedFineMs(fitted);
        console.log(
          `[hfcast] engine ${points} points in ${Math.round(elapsedMs)} ms`
            + ` | samples ${get().samples.length}`
            + ` | ms/point ${fitted === null ? 'unknown' : fitted.toFixed(4)}`
            + ` | fine grid ${
              projected === null ? 'unprojected' : `${Math.round(projected)} ms`
            }`
            + ` | affordable ${fineGlobeAffordable(fitted)}`,
        );
      },

      msPerPoint: () => marginalMsPerPoint(get().samples),
    }),
    {
      name: 'hfcast-engine-cost',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the readings are stored. The two functions beside them are
      // rebuilt on every launch and JSON would drop them regardless;
      // naming what is kept also makes the migration below type-check
      // against the stored shape rather than the whole store.
      partialize: (state) => ({ samples: state.samples }),
      version: 3,
      // Version 1 stored bare numbers, which say how long a run took but
      // not how large it was; version 2 stored every run, so the same
      // two sizes appeared a dozen times over. Neither can be turned
      // into what version 3 holds — the fastest run at each size — so
      // both are dropped and the device measures itself again, which
      // costs one band change.
      //
      // Written out rather than left to happen: with no `migrate`,
      // zustand drops the state anyway but prints an error while doing
      // it, and an error in the log for behaviour that is intended sends
      // the next reader looking for a fault that is not there.
      migrate: () => ({ samples: [] }),
    },
  ),
);
