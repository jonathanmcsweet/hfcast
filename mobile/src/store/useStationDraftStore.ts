import { create } from 'zustand';

import type { Antenna } from '../../../shared/antenna.ts';
import type { ModeKey } from '../../../shared/modes.ts';
import type { StationPreset } from '../data/station.ts';
import type { Draft } from '../data/stationDraft.ts';
import * as draft from '../data/stationDraft.ts';

/**
 * The station dialog's draft, while the dialog is open.
 *
 * Deliberately not persisted, and deliberately not the station store:
 * `useStationStore` writes to AsyncStorage on every change, which is why
 * the form used to spend a serialization and a disk write on every
 * character typed into it. Nothing here reaches disk. Save copies this
 * into `useStationStore` in one go, and Cancel abandons it.
 *
 * A store rather than a React context, which is what this was first
 * built as. A context hands the same object to every consumer, so all
 * five sections re-rendered whenever any field changed — typing in the
 * antenna height re-drew the name, mode, power and aim sections, each
 * with its own controls. A store lets a section subscribe to the one
 * field it draws. It is also what this project asks for: non-network
 * state belongs in Zustand (`CLAUDE.md`).
 */
interface StationDraftState {
  draft: Draft;
  /** Starts again from what is saved. Called when the dialog opens. */
  begin: (saved: Draft) => void;
  setWatts: (watts: number) => void;
  setMode: (mode: ModeKey) => void;
  setAntenna: (antenna: Partial<Antenna>) => void;
  rename: (name: string) => void;
  /**
   * Copies the active station under a new name.
   *
   * The name is translated, and a store knows nothing about i18next, so
   * the caller passes the formatter it already has.
   */
  addStation: (format: (n: number) => string) => void;
  removeStation: (id: string) => void;
  selectStation: (id: string) => void;
  reset: () => void;
}

const EMPTY: Draft = { presets: [], activeId: '' };

export const useStationDraftStore = create<StationDraftState>()((set) => ({
  draft: EMPTY,

  begin: (saved) => set({ draft: saved }),

  setWatts: (watts) => set((s) => ({ draft: draft.setWatts(s.draft, watts) })),
  setMode: (mode) => set((s) => ({ draft: draft.setMode(s.draft, mode) })),
  setAntenna: (antenna) =>
    set((s) => ({ draft: draft.setAntenna(s.draft, antenna) })),
  rename: (name) => set((s) => ({ draft: draft.rename(s.draft, name) })),
  addStation: (format) =>
    set((s) => ({ draft: draft.addStation(s.draft, format) })),
  removeStation: (id) =>
    set((s) => ({ draft: draft.removeStation(s.draft, id) })),
  selectStation: (id) =>
    set((s) => ({ draft: draft.selectStation(s.draft, id) })),
  reset: () => set((s) => ({ draft: draft.reset(s.draft) })),
}));

/**
 * The station being edited.
 *
 * Returns an object the draft already holds, so a section that reads a
 * field off it re-renders only when that field's own preset changed.
 */
export const useDraftPreset = (): StationPreset =>
  useStationDraftStore((s) => draft.active(s.draft));

/**
 * One field of it.
 *
 * The point of the store. `useDraftField((p) => p.watts)` subscribes to
 * a number, so the power section is left alone while the antenna height
 * is being typed.
 */
export function useDraftField<T>(read: (preset: StationPreset) => T): T {
  return useStationDraftStore((s) => read(draft.active(s.draft)));
}

export const useDraftPresets = (): readonly StationPreset[] =>
  useStationDraftStore((s) => s.draft.presets);

export const useDraftActiveId = (): string =>
  useStationDraftStore((s) => s.draft.activeId);

/** The whole draft, for the dialog itself: Save writes it, Cancel drops it. */
export const useDraft = (): Draft => useStationDraftStore((s) => s.draft);
