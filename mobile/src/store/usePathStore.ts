import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { PAST_WINDOW } from '../data/timeline';
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

/**
 * Greenwich, where UTC starts.
 *
 * The location a skipped first run falls back to. It used to be Seattle, which
 * is a real place somebody lives and reads as a mistake rather than as a
 * default; the prime meridian at least explains itself, since every hour on
 * this screen is UTC.
 */
export const GREENWICH: Endpoint = {
  grid: 'IO91',
  label: 'Greenwich',
  lat: 51.4779,
  lon: -0.0014,
};

const DEFAULT_FROM: Endpoint = GREENWICH;

/**
 * No destination, which is an ordinary state rather than an unset one.
 *
 * The map answers who can hear you without one, and the grid below reports
 * the share of directions reachable instead of the chance of one contact.
 */
const DEFAULT_TO: Endpoint | null = null;

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
  to: Endpoint | null;
  /** The band every module is showing. Always set — there is no "auto". */
  band: BandKey;
  /** The hour every module is showing, 0..23. */
  hour: number;
  /**
   * Where the rolling timeline starts: the current hour, taken at launch
   * and again when the app returns to the foreground. Every track runs
   * 24 hours forward from here. See `src/data/timeline.ts`.
   */
  anchor: number;
  /**
   * How many hours behind "now" the track reaches, 0..`PAST_WINDOW`.
   *
   * Grows as hours pass in use and stops at the window, so the track
   * fills in behind the now line and then rolls. Not persisted, like
   * `anchor`: a relaunch starts at "now" with nothing behind it.
   */
  past: number;
  /**
   * Whether the operator has been asked where they are.
   *
   * False only until the first-run pane has been answered or skipped. It is
   * not "has a location", because skipping sets one — it records that the
   * question has been put, so it is never asked twice.
   */
  ready: boolean;
  setFrom: (endpoint: Endpoint) => void;
  setTo: (endpoint: Endpoint | null) => void;
  swapEnds: () => void;
  setBand: (band: BandKey) => void;
  setHour: (hour: number) => void;
  /**
   * Moves "now" to the current hour, keeping the hours just passed on
   * the track as its past side. Called every minute while the screen
   * is open, and when the app returns to the foreground.
   */
  reanchor: () => void;
  /** Marks the first run answered, with whatever location it settled on. */
  finishFirstRun: (from: Endpoint) => void;
}

/**
 * Bump when a persisted field changes shape, and handle the old shape in
 * `migrate`. Without it a stored `Endpoint` from an older build would be
 * spread into state unchecked.
 */
const PERSIST_VERSION = 3;

export const usePathStore = create<PathState>()(
  persist(
    (set) => ({
      from: DEFAULT_FROM,
      to: DEFAULT_TO,
      band: DEFAULT_BAND,
      hour: new Date().getUTCHours(),
      anchor: new Date().getUTCHours(),
      past: 0,
      ready: false,
      setFrom: (from) => set({ from }),
      setTo: (to) => set({ to }),
      // Nothing to swap when there is only one end. Doing nothing rather
      // than moving the operator to where they were not transmitting from.
      swapEnds: () =>
        set((state) =>
          state.to === null ? state : { from: state.to, to: state.from }
        ),
      setBand: (band) => set({ band }),
      setHour: (hour) =>
        set({ hour: Math.min(23, Math.max(0, Math.round(hour))) }),
      // A no-op inside the same hour, so switching apps and straight back
      // never moves anything. Across an hour boundary the hours just
      // passed stay on the track as its past side, up to `PAST_WINDOW`
      // of them.
      //
      // The selection follows "now" when it was on it. A selection the
      // user had moved keeps its hour: that hour is still on the track,
      // now as the recent past, and its meaning holds. Only after a gap
      // longer than the window does the selection snap to "now" — by
      // then the kept hour could have slid to the far end and mean
      // tomorrow, a quiet change of meaning under a selection the user
      // made with today in mind.
      reanchor: () =>
        set((state) => {
          const now = new Date().getUTCHours();
          if (now === state.anchor) return state;
          const elapsed = (now - state.anchor + 24) % 24;
          const follow = state.hour === state.anchor
            || elapsed > PAST_WINDOW;
          return {
            anchor: now,
            past: Math.min(PAST_WINDOW, state.past + elapsed),
            hour: follow ? now : state.hour,
          };
        }),
      finishFirstRun: (from) => set({ from, ready: true }),
    }),
    {
      name: 'hfcast.path',
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      // The path and the band are worth restoring. `hour`, `anchor` and
      // `past` are not: the app should open on the current hour, not on
      // whatever hour the user was last inspecting.
      partialize: (state) => ({
        from: state.from,
        to: state.to,
        band: state.band,
        ready: state.ready,
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
            ready: old.from !== undefined,
          };
        }
        // Version 2 had no `ready` and required both ends. Anyone with a
        // stored path has already chosen a location, whatever the app asked
        // at the time, so they are not shown the first-run pane.
        if (version === 2) {
          const old = persisted as Partial<PathState>;
          return { ...old, ready: true };
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
