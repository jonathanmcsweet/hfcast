/**
 * What a station is, apart from where it is kept.
 *
 * `useStationStore` holds these and persists them; this file says what
 * they are. Split for the reason `bandStrip.ts` is split from the band
 * selector: the store reaches AsyncStorage the moment it is imported, so
 * nothing that imports the store can be read by `node --test`. The rules
 * about what a station may be — the limits, the defaults, how a new one
 * is identified — are exactly the part worth testing.
 *
 * The store re-exports all of this, so every existing importer keeps
 * working and there is one definition rather than two.
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
 * An empty `name` means the preset has never been named, and the UI shows
 * a translated default for it. Storing the translated word instead would
 * freeze it in whatever language the app happened to be in when the
 * preset was made. Stations made in the dialog now arrive named, so an
 * empty name means one that predates that or one the reader emptied.
 */
export interface StationPreset extends Station {
  id: string;
  name: string;
}

/**
 * What the controls stop at, which is what the server clamps to.
 *
 * Every number here comes from `shared/antenna.ts`, so a control cannot
 * offer a value the service will quietly change on the way through. They
 * had drifted before that: the dialog offered 1500 W and the server
 * accepted 10,000, while the comment claimed the two agreed.
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
 * The station every earlier version of the app assumed without saying:
 * 100 W to an isotropic antenna, at the threshold CW needs.
 *
 * Keeping these as the defaults means a reader who never opens the
 * settings sees exactly what they saw before.
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
 * Counted rather than random so the state stays a pure function of what
 * it held: a test can add a preset and know what it will be called, and
 * two devices restoring the same backup do not disagree.
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
