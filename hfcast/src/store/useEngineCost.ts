/**
 * What the engine costs on this device, measured and remembered.
 *
 * The whole-world fine grid is affordable on some devices and not on
 * others, and the difference is about a factor of ten. Rather than guess
 * from a model name or a core count, the app times its own runs.
 *
 * Two sets of readings, kept apart on purpose. A run cut into strips
 * across eight cores and the same run on one thread are different work
 * with different costs, and a line fitted through a mixture of the two
 * describes neither. The fine grid is sharded, so the decision about it
 * is made from `sharded` alone.
 *
 * Persisted, so a device that has already answered the question does not
 * spend the first map of every session answering it again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  type CostSample,
  fineGlobeAffordable,
  fitRunCost,
  keepFastest,
  projectedFineMs,
} from '../data/engineBudget';

interface EngineCostState {
  /**
   * Whole runs on the single worker thread: the coarse map and the
   * viewport patch.
   *
   * Diagnostic only. Nothing decides anything from these — the grid they
   * would be used to predict is not run this way — but they are free,
   * they arrive constantly, and they are what tells a reader of the log
   * whether a device is slow everywhere or only slow in the batch.
   */
  samples: CostSample[];
  /**
   * Runs cut into strips across the device's cores: the two calibration
   * probes and the fine grid itself.
   *
   * These decide. They are the only runs whose shape matches the run the
   * decision is about.
   */
  sharded: CostSample[];
  /** Records one whole run. */
  record: (elapsedMs: number, points: number) => void;
  /** Records one run that was cut into strips. */
  recordSharded: (elapsedMs: number, points: number) => void;
  /**
   * What a sharded run costs here, or null until two sizes far enough
   * apart have been seen. A single size cannot separate a run's fixed
   * cost from its per-point cost.
   */
  fineCost: () => ReturnType<typeof fitRunCost>;
}

/** A run of no points, or a clock reading that is not one, says nothing. */
const measured = (elapsedMs: number, points: number): boolean =>
  points > 0 && Number.isFinite(elapsedMs) && elapsedMs > 0;

export const useEngineCost = create<EngineCostState>()(
  persist(
    (set, get) => ({
      samples: [],
      sharded: [],

      record: (elapsedMs, points) => {
        if (!measured(elapsedMs, points)) return;
        set((state) => ({
          samples: keepFastest(state.samples, { points, ms: elapsedMs }),
        }));
        say('whole', elapsedMs, points, get());
      },

      recordSharded: (elapsedMs, points) => {
        if (!measured(elapsedMs, points)) return;
        set((state) => ({
          sharded: keepFastest(state.sharded, { points, ms: elapsedMs }),
        }));
        say('strips', elapsedMs, points, get());
      },

      fineCost: () => fitRunCost(get().sharded),
    }),
    {
      name: 'hfcast-engine-cost',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the readings are stored. The functions beside them are
      // rebuilt on every launch and JSON would drop them regardless;
      // naming what is kept also makes the migration below type-check
      // against the stored shape rather than the whole store.
      partialize: (state) => ({
        samples: state.samples,
        sharded: state.sharded,
      }),
      version: 4,
      // Version 1 stored bare numbers, which say how long a run took but
      // not how large it was; version 2 stored every run, so the same two
      // sizes appeared a dozen times over; version 3 stored one set of
      // sizes with no record of whether each was cut into strips, and a
      // reading whose shape is unknown cannot be sorted into the two sets
      // above. None can be turned into what version 4 holds, so all are
      // dropped and the device measures itself again — which costs a
      // fraction of a second, once.
      //
      // Written out rather than left to happen: with no `migrate`,
      // zustand drops the state anyway but prints an error while doing
      // it, and an error in the log for behaviour that is intended sends
      // the next reader looking for a fault that is not there.
      migrate: () => ({ samples: [], sharded: [] }),
    },
  ),
);

/**
 * Says what a run cost and what it changed.
 *
 * Because this decision is otherwise invisible. The fine grid either
 * appears or it does not, and a device that never shows it looks the
 * same whether the gate refused, the measurement never arrived, or the
 * run failed. Three different faults with one symptom is not something a
 * screen can be read for — so the numbers behind the verdict go to the
 * log, where `adb logcat` can reach them on a device that cannot be
 * debugged any other way.
 */
function say(
  kind: 'whole' | 'strips',
  elapsedMs: number,
  points: number,
  state: EngineCostState,
): void {
  const cost = fitRunCost(state.sharded);
  const projected = projectedFineMs(cost);
  console.log(
    `[hfcast] engine ${kind} ${points} points in ${Math.round(elapsedMs)} ms`
      + ` | sizes ${state.samples.length} whole, ${state.sharded.length} strips`
      + ` | sharded ${
        cost === null
          ? 'unfitted'
          : `${Math.round(cost.fixedMs)} ms + ${cost.msPerPoint.toFixed(4)}/pt`
      }`
      + ` | fine grid ${
        projected === null ? 'unprojected' : `${Math.round(projected)} ms`
      }`
      + ` | affordable ${fineGlobeAffordable(cost)}`,
  );
}
