/**
 * What a station is, apart from where it is kept.
 *
 * Split out because the store reaches AsyncStorage on import, so nothing
 * importing it can be read by `node --test` — and the limits, defaults
 * and identifiers are the part worth testing.
 *
 * The store re-exports all of this, so importers keep working and there
 * is one definition rather than two.
 */
import {
  type Antenna,
  MAX_GAIN_DBD,
  MAX_HEIGHT_M,
  MAX_WATTS,
  MIN_GAIN_DBD,
  MIN_HEIGHT_M,
  MIN_WATTS,
} from '../../../shared/antenna.ts';
import type { ModeKey } from '../../../shared/modes.ts';

/** What a run needs to know about the transmitting end. */
export interface Station {
  watts: number;
  mode: ModeKey;
  antenna: Antenna;
}

/**
 * One saved station.
 *
 * An empty `name` has never been named, and the UI shows a translated
 * default. Storing that word instead would freeze it in whatever language
 * the app was in when the preset was made. New stations arrive named, so
 * an empty name predates that or was emptied by the reader.
 */
export interface StationPreset extends Station {
  id: string;
  name: string;
}

/**
 * What the controls stop at, which is what the server clamps to.
 *
 * All from `shared/antenna.ts`, so a control cannot offer a value the
 * service will change on the way through. They had drifted: the dialog
 * offered 1500 W against the server's 10,000.
 */
export const LIMITS = {
  watts: { min: MIN_WATTS, max: MAX_WATTS },
  heightM: { min: MIN_HEIGHT_M, max: MAX_HEIGHT_M },
  gainDbd: { min: MIN_GAIN_DBD, max: MAX_GAIN_DBD },
} as const;

/**
 * How long a preset name may be. Long enough to name a station, short
 * enough to sit beside three icons on a phone.
 */
export const MAX_NAME_LENGTH = 24;

/**
 * What every earlier version assumed without saying: 100 W to an
 * isotropic antenna, at the threshold CW needs. Kept as the defaults so
 * a reader who never opens the settings sees what they saw before.
 */
export const DEFAULT_STATION: Station = {
  watts: 100,
  mode: 'cw',
  antenna: { type: 'isotropic', heightM: 10, gainDbd: 6, beamDeg: 0 },
};

/** The one every install starts with. */
export const FIRST_PRESET: StationPreset = {
  id: 's1',
  name: '',
  ...DEFAULT_STATION,
};

/**
 * The next free identifier, given the ones in use.
 *
 * Counted, not random, so the state stays a pure function of what it
 * held: a test knows what a new preset will be called, and two devices
 * restoring one backup do not disagree.
 */
export function nextId(presets: readonly StationPreset[]): string {
  const used = presets
    .map((preset) => Number(preset.id.replace(/^s/, '')))
    .filter((n) => Number.isInteger(n));
  return `s${Math.max(0, ...used) + 1}`;
}

export const clamp = (
  value: number,
  { min, max }: { min: number; max: number; },
): number => Math.min(max, Math.max(min, value));
