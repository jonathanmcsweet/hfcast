import { create } from 'zustand';

/**
 * How far the compute-ahead job has got.
 *
 * Not persisted, and deliberately: a job stops when the app stops, so a
 * count restored from disk would describe work that is no longer
 * happening. What survives is the maps it wrote, which is what it was
 * for — starting again skips every hour already on disk.
 *
 * Zustand rather than React Query because nothing here comes off a
 * network: it is the state of a job running in this process.
 */

export interface PrecomputeState {
  running: boolean;
  /** Grids written or already held. */
  done: number;
  /** Grids the job set out to write. */
  total: number;
  /** Grids that failed. The job carries on past them. */
  failed: number;
  /** What it is working on, for the line on screen. Null when stopped. */
  at: string | null;
  /** Whether the last stop was asked for rather than the job finishing. */
  stopped: boolean;
  begin: (total: number) => void;
  advance: (at: string) => void;
  fail: () => void;
  finish: (stopped: boolean) => void;
}

export const usePrecomputeStore = create<PrecomputeState>()((set) => ({
  running: false,
  done: 0,
  total: 0,
  failed: 0,
  at: null,
  stopped: false,
  begin: (total) =>
    set({ running: true, done: 0, total, failed: 0, at: null, stopped: false }),
  advance: (at) => set((state) => ({ done: state.done + 1, at })),
  fail: () => set((state) => ({ failed: state.failed + 1 })),
  finish: (stopped) => set({ running: false, at: null, stopped }),
}));
