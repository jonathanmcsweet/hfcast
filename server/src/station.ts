/**
 * The operator's own station: power, mode and antenna.
 *
 * These are the three assumptions every prediction used to make silently.
 * The engine's signal-to-noise is in a 1 Hz bandwidth — the noise default
 * of -145 dBW is VOACAP's per-hertz residential figure, and the WSPR
 * calibration measured a fixed 34 dB gap to WSPR's 2500 Hz scale — so a
 * mode's requirement converts as
 *
 *   required = in-channel SNR + 10 * log10(reference bandwidth)
 *
 * which is what turns "SSB" into the number the engine takes.
 */

/** Modes an amateur station picks between, hardest to easiest. */
export const MODE_ORDER = [
  'fm',
  'am',
  'ssb',
  'rtty',
  'cw',
  'psk31',
  'ft8',
  'js8',
  'wspr',
] as const;

export type ModeKey = (typeof MODE_ORDER)[number];

export interface ModeSpec {
  /**
   * What the signal actually occupies, Hz. Shown to the reader, not used
   * in the arithmetic.
   */
  occupiedHz: number;
  /**
   * The bandwidth the `snrDb` figure below is quoted in, Hz.
   *
   * For the analogue and keyed modes this is the receiver's own filter and
   * is the same as `occupiedHz`. For the weak-signal digital modes it is
   * not: their sensitivities are published in a 2500 Hz reference, which
   * is how every FT8, JS8 and WSPR report on the air is expressed, so
   * those thresholds are converted from that reference rather than from
   * the 50 Hz they really occupy. Using the occupied width instead would
   * make the app disagree with the number the operator reads in their own
   * decoder by about 17 dB.
   */
  referenceHz: number;
  /** Signal-to-noise the mode needs, in `referenceHz`, dB. */
  snrDb: number;
}

/**
 * Where each figure comes from.
 *
 * CW and SSB are set to reproduce VOACAP's own long-standing 24 dB and
 * 38 dB, because those are the numbers every other VOACAP tool reports
 * and disagreeing with them silently would be worse than being slightly
 * off. The digital thresholds are the published decoder floors. AM, FM
 * and RTTY are the conventional required ratios for adequate copy.
 */
export const MODES: Record<ModeKey, ModeSpec> = {
  fm: { occupiedHz: 16_000, referenceHz: 16_000, snrDb: 12 },
  am: { occupiedHz: 6_000, referenceHz: 6_000, snrDb: 8.2 },
  ssb: { occupiedHz: 2_400, referenceHz: 2_400, snrDb: 4.2 },
  rtty: { occupiedHz: 250, referenceHz: 250, snrDb: 8 },
  cw: { occupiedHz: 500, referenceHz: 500, snrDb: -3 },
  psk31: { occupiedHz: 31, referenceHz: 31.25, snrDb: 6 },
  ft8: { occupiedHz: 50, referenceHz: 2_500, snrDb: -21 },
  js8: { occupiedHz: 50, referenceHz: 2_500, snrDb: -24 },
  wspr: { occupiedHz: 6, referenceHz: 2_500, snrDb: -29 },
};

/**
 * The required signal-to-noise the engine takes, in 1 Hz, rounded to whole
 * dB.
 *
 * Whole dB because the engine prints SNR to the nearest dB, so a finer
 * threshold would claim a precision the comparison does not have.
 */
export function requiredSnrFor(mode: ModeKey): number {
  const spec = MODES[mode];
  return Math.round(spec.snrDb + 10 * Math.log10(spec.referenceHz));
}

/** The mode every earlier version of this server assumed without saying. */
export const DEFAULT_MODE: ModeKey = 'cw';

export function isModeKey(value: string): value is ModeKey {
  return (MODE_ORDER as readonly string[]).includes(value);
}
