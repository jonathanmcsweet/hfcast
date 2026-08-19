/**
 * The station dialog's working copy.
 *
 * The dialog used to write straight through to `useStationStore`, which
 * is persisted, so every character typed into the power field was a
 * serialization of the whole preset list and a write to AsyncStorage.
 * That is what made the form feel a shade behind the finger, and it is
 * also why the dialog could offer no Save button: there was nothing left
 * to save, because saving had already happened.
 *
 * So the dialog now edits one of these and the store hears nothing until
 * Save. Cancel throws the draft away, which is the whole of what Cancel
 * has to do.
 *
 * Kept apart from the component for the reason `bandStrip.ts` is: none of
 * it touches React, so `node --test` runs it. What it decides — which
 * station is active, what a new one is called, whether anything changed —
 * is exactly the part that is awkward to see once it is inside a dialog.
 */
import type { Antenna } from '../../../shared/antenna.ts';
import type { ModeKey } from '../../../shared/modes.ts';
import {
  clamp,
  DEFAULT_STATION,
  LIMITS,
  MAX_NAME_LENGTH,
  nextId,
  type StationPreset,
} from './station.ts';

/** Everything the dialog can change, and nothing it cannot. */
export interface Draft {
  presets: readonly StationPreset[];
  activeId: string;
}

/** The preset being edited. Falls back the same way the store does. */
export function active(draft: Draft): StationPreset {
  return draft.presets.find((preset) => preset.id === draft.activeId)
    ?? draft.presets[0]
    ?? { id: 's1', name: '', ...DEFAULT_STATION };
}

/** Applies a change to the active preset and leaves the others alone. */
function onActive(
  draft: Draft,
  change: (preset: StationPreset) => StationPreset,
): Draft {
  return {
    ...draft,
    presets: draft.presets.map((preset) =>
      preset.id === draft.activeId ? change(preset) : preset
    ),
  };
}

export const setWatts = (draft: Draft, watts: number): Draft =>
  onActive(draft, (preset) => ({
    ...preset,
    watts: clamp(watts, LIMITS.watts),
  }));

export const setMode = (draft: Draft, mode: ModeKey): Draft =>
  onActive(draft, (preset) => ({ ...preset, mode }));

export const setAntenna = (draft: Draft, antenna: Partial<Antenna>): Draft =>
  onActive(draft, (preset) => ({
    ...preset,
    antenna: {
      ...preset.antenna,
      ...antenna,
      ...(antenna.heightM === undefined
        ? {}
        : { heightM: clamp(antenna.heightM, LIMITS.heightM) }),
      ...(antenna.gainDbd === undefined
        ? {}
        : { gainDbd: clamp(antenna.gainDbd, LIMITS.gainDbd) }),
      ...(antenna.beamDeg === undefined
        ? {}
        : { beamDeg: ((antenna.beamDeg % 360) + 360) % 360 }),
    },
  }));

/**
 * Renames the active preset.
 *
 * Not trimmed here, only capped. Trimming as the reader types takes the
 * space away the moment it is pressed, so "Field day" cannot be typed.
 * The trim happens on the way into the store instead.
 */
export const rename = (draft: Draft, name: string): Draft =>
  onActive(draft, (preset) => ({
    ...preset,
    name: name.slice(0, MAX_NAME_LENGTH),
  }));

/** Returns the active preset's settings to the defaults, keeping its name. */
export const reset = (draft: Draft): Draft =>
  onActive(draft, (preset) => ({
    id: preset.id,
    name: preset.name,
    ...DEFAULT_STATION,
  }));

/**
 * What to call a station nobody has named yet.
 *
 * A new preset used to be created with an empty name, and the field then
 * showed its placeholder — which is indistinguishable from a form that
 * was never filled in, and is exactly why adding a station read as
 * losing one (user, 2026-08-18). So a new station arrives already named.
 *
 * The formatter is passed in rather than imported, because the word is
 * translated and this file knows nothing about i18next. Numbering starts
 * at the length of the list and walks up until the name is free, so
 * adding, deleting and adding again cannot produce two "Station 2"s.
 */
export function nextName(
  presets: readonly StationPreset[],
  format: (n: number) => string,
): string {
  const taken = new Set(presets.map((preset) => preset.name));
  for (let n = presets.length + 1; n < presets.length + 100; n++) {
    const name = format(n);
    if (!taken.has(name)) return name;
  }
  return format(presets.length + 1);
}

/**
 * Copies the active preset under a new name and selects the copy.
 *
 * A copy rather than a blank one: a second station is usually the first
 * with one thing different, and starting from the defaults would mean
 * setting all three again.
 */
export function addStation(
  draft: Draft,
  format: (n: number) => string,
): Draft {
  const source = active(draft);
  const id = nextId(draft.presets);
  const name = nextName(draft.presets, format);
  return {
    presets: [...draft.presets, { ...source, id, name }],
    activeId: id,
  };
}

/**
 * Removes a preset.
 *
 * Never nothing: with one left, deleting empties it back to the defaults
 * instead. An empty list would need an empty state in this dialog, in the
 * main screen's menu and in every path that runs a forecast.
 */
export function removeStation(draft: Draft, id: string): Draft {
  if (draft.presets.length <= 1) {
    const only = {
      id: draft.presets[0]?.id ?? 's1',
      name: '',
      ...DEFAULT_STATION,
    };
    return { presets: [only], activeId: only.id };
  }
  const presets = draft.presets.filter((preset) => preset.id !== id);
  const activeId = draft.activeId === id
    ? presets[0]?.id ?? draft.activeId
    : draft.activeId;
  return { presets, activeId };
}

export function selectStation(draft: Draft, activeId: string): Draft {
  return draft.presets.some((preset) => preset.id === activeId)
    ? { ...draft, activeId }
    : draft;
}

/**
 * Whether the draft still says what the store says.
 *
 * Drives the Save button and the question the × asks on the way out.
 * Switching which station is active counts as a change, because that is
 * the station the forecast will be run for — the dialog is one
 * transaction, not a form with a separate navigation control.
 */
export function isDirty(draft: Draft, saved: Draft): boolean {
  if (draft.activeId !== saved.activeId) return true;
  if (draft.presets.length !== saved.presets.length) return true;
  return draft.presets.some((preset, at) => {
    const was = saved.presets[at];
    return was === undefined
      || preset.id !== was.id
      || preset.name !== was.name
      || preset.watts !== was.watts
      || preset.mode !== was.mode
      || preset.antenna.type !== was.antenna.type
      || preset.antenna.heightM !== was.antenna.heightM
      || preset.antenna.gainDbd !== was.antenna.gainDbd
      || preset.antenna.beamDeg !== was.antenna.beamDeg;
  });
}

/**
 * The draft as the store should hold it.
 *
 * The trim that `rename` leaves undone happens here, on the one path
 * that reaches storage, so a name typed with a trailing space is stored
 * without it and a name of nothing but spaces becomes no name at all.
 */
export function forStore(draft: Draft): Draft {
  return {
    activeId: draft.activeId,
    presets: draft.presets.map((preset) => ({
      ...preset,
      name: preset.name.trim(),
    })),
  };
}

/** Which stations match what has been typed into the picker. */
export function matching(
  presets: readonly StationPreset[],
  query: string,
  unnamed: string,
): readonly StationPreset[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return presets;
  return presets.filter((preset) =>
    (preset.name === '' ? unnamed : preset.name)
      .toLocaleLowerCase()
      .includes(needle)
  );
}
