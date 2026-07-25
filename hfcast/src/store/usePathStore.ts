import { create } from 'zustand';

import type { BandKey, Endpoint } from '../data/types';

/**
 * Non-network app state. Anything fetched lives in React Query instead.
 *
 * The store is deliberately small: the path being viewed, which band the user
 * pinned, and how many days ahead they are looking. Everything else is derived.
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

/** How far ahead the day selector may go. Beyond this the guess is not useful. */
export const MAX_DAY_OFFSET = 6;

interface PathState {
  from: Endpoint;
  to: Endpoint;
  /** Null means "follow the best band", which is the default view. */
  pinnedBand: BandKey | null;
  /** Days ahead of today, 0..MAX_DAY_OFFSET. */
  dayOffset: number;
  setFrom: (endpoint: Endpoint) => void;
  setTo: (endpoint: Endpoint) => void;
  swapEnds: () => void;
  setPinnedBand: (band: BandKey | null) => void;
  setDayOffset: (offset: number) => void;
}

export const usePathStore = create<PathState>((set) => ({
  from: DEFAULT_FROM,
  to: DEFAULT_TO,
  pinnedBand: null,
  dayOffset: 0,
  setFrom: (from) => set({ from }),
  setTo: (to) => set({ to }),
  swapEnds: () => set((state) => ({ from: state.to, to: state.from })),
  setPinnedBand: (pinnedBand) => set({ pinnedBand }),
  setDayOffset: (dayOffset) =>
    set({ dayOffset: Math.min(MAX_DAY_OFFSET, Math.max(0, dayOffset)) }),
}));

/** The UTC date the given day offset refers to, as an ISO date string. */
export function dateForOffset(offset: number, from = new Date()): string {
  const utcMidnight = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  return new Date(utcMidnight + offset * 86_400_000).toISOString().slice(0, 10);
}
