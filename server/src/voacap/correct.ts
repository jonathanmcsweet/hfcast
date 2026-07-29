/**
 * Empirical amplitude correction for VOACAP's daily swing.
 *
 * Measured against six months of WSPR reception reports spanning the solar
 * cycle, VOACAP places a circuit's peaks and fades at the right hours but
 * predicts a swing between best and worst hour about four times larger than
 * reality. The correction shrinks each band's daily SNR curve toward its own
 * median:
 *
 *   corrected = centre + k * (predicted - centre)
 *
 * `SWING_FACTOR` was fitted on June 2025 alone and then beat or matched the
 * flat with-hindsight baseline on five months it never saw, including solar
 * minimum in 2019. Provenance and the full evidence: hfcast-engine/docs/accuracy.md
 * and hfcast-engine/docs/calibration-matrix-es.md.
 *
 * Reliability is recomputed from the corrected median, because the engine's
 * printed reliability was derived from the uncorrected one. VOACAP models the
 * day-to-day SNR spread with deciles (`SNR LW`, `SNR UP`); treating a decile
 * as 1.2816 standard deviations of a normal distribution reproduces the
 * engine's own reliability from its own numbers (checked in tests), so the
 * same formula applied to the corrected median is consistent with the engine
 * rather than a second model. The deciles are scaled by the validated spread
 * factors (hfcast-engine/docs/reliability.md), and after a recent geomagnetic
 * storm the downward one is widened further (hfcast-engine/docs/storm.md).
 */
import type { BandHourPrediction } from '../types.ts';
import type { RawBandHour } from './parse.ts';

/**
 * How much of VOACAP's predicted daily swing is real. Fitted on 2025-06,
 * validated out of sample on 2025-07, 2025-03, 2024-12, 2019-06, 2019-12,
 * 2022-09 and 2015-03.
 */
export const SWING_FACTOR = 0.25;

/**
 * How much of VOACAP's claimed day-to-day spread is real, below and above
 * the median.
 *
 * Checked against per-day WSPR records: the engine claims 25-30% of days
 * fall 6 dB or more below an hour's monthly median, when 5-10% actually do.
 * Fitted on 2025-06 and validated on five other months spanning 2015-2025
 * (hfcast-engine/docs/reliability.md). Scaling the deciles by these factors makes
 * the predicted frequencies match the measured ones in the 3-10 dB range
 * that decides most reliability values; beyond 10 dB real life still has
 * more bad days than the scaled model claims, so reliability shown near
 * 100% should be read as "9 in 10", not certainty.
 */
export const SPREAD_FACTOR_LOW = 0.4;
export const SPREAD_FACTOR_UP = 0.59;

/** The knobs the validation fixed, overridable in tests. */
export interface CorrectionFactors {
  swing: number;
  spreadLow: number;
  spreadUp: number;
}

const VALIDATED: CorrectionFactors = {
  swing: SWING_FACTOR,
  spreadLow: SPREAD_FACTOR_LOW,
  spreadUp: SPREAD_FACTOR_UP,
};

/**
 * How much wider the downward spread really is after a geomagnetic storm.
 *
 * Measured by tagging every day-hour in the eight validation months with the
 * highest Kp of its preceding 24 hours (hfcast-engine/docs/storm.md). Below Kp 5
 * the calibrated spread holds. Above it, bad days come both more often and
 * deeper, growing with storm strength: the spread must be about 1.4 times
 * wider after Kp 5-6, about 2 times after Kp 6-7, about 2.5 times after
 * Kp 7+. The gradient reproduces across ten years of data. Only the
 * downward side widens — storms suppress signals, they do not boost them.
 */
export const STORM_WIDENING_START_KP = 4.75;
export const STORM_WIDENING_PER_KP = 0.5;
export const STORM_WIDENING_CAP = 2.5;

/** The widening factor for a given "highest Kp in the last 24 hours". */
export function stormWidening(kpMax24h: number): number {
  const widening = 1
    + STORM_WIDENING_PER_KP * (kpMax24h - STORM_WIDENING_START_KP);
  return Math.min(STORM_WIDENING_CAP, Math.max(1, widening));
}

/**
 * The correction factors to use given current geomagnetic conditions.
 * Pass null when conditions are unknown (any request that is not a
 * now-cast): the prediction then describes a typical day of the month,
 * which is the quiet-day calibration.
 */
export function factorsFor(kpMax24h: number | null): CorrectionFactors {
  if (kpMax24h === null) return VALIDATED;
  return {
    ...VALIDATED,
    spreadLow: VALIDATED.spreadLow * stormWidening(kpMax24h),
  };
}

/** A decile is this many standard deviations of a normal distribution. */
const DECILE_TO_SIGMA = 1.2816;

/** Standard normal cumulative distribution, via Abramowitz-Stegun 7.1.26. */
export function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t
    * (0.254829592
      + t
        * (-0.284496736
          + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (sorted.length % 2 === 0 && lower !== undefined && upper !== undefined) {
    return (lower + upper) / 2;
  }
  return upper ?? 0;
}

/**
 * The probability that a day's SNR meets the requirement, given the median
 * and the decile spread around it.
 */
function reliabilityFrom(
  snr: number,
  requiredSnrDb: number,
  lowDecile: number,
  upDecile: number,
): number {
  const z = snr - requiredSnrDb;
  const decile = z >= 0 ? lowDecile : upDecile;
  if (decile <= 0) return z >= 0 ? 1 : 0;
  return phi(z / (decile / DECILE_TO_SIGMA));
}

/**
 * Applies the swing correction and recomputes reliability.
 *
 * Cells missing their deciles keep the engine's reliability: shifting the
 * median without knowing the spread would be a guess, and the engine's value
 * is at least self-consistent.
 */
export function correctCells(
  cells: readonly RawBandHour[],
  requiredSnrDb: number,
  factors: CorrectionFactors = VALIDATED,
): BandHourPrediction[] {
  // The centre is per band: each band has its own daily curve.
  const bands = [...new Set(cells.map((cell) => cell.band))];
  const centres = new Map(
    bands.map((band) => [
      band,
      median(cells.filter((cell) => cell.band === band).map((c) => c.snr)),
    ]),
  );

  return cells.map((cell) => {
    const centre = centres.get(cell.band) ?? cell.snr;
    const snr = centre + factors.swing * (cell.snr - centre);
    const reliability = cell.snrLowDecile !== null && cell.snrUpDecile !== null
      ? reliabilityFrom(
        snr,
        requiredSnrDb,
        cell.snrLowDecile * factors.spreadLow,
        cell.snrUpDecile * factors.spreadUp,
      )
      : cell.reliability;
    return {
      hour: cell.hour,
      band: cell.band,
      reliability: Math.min(1, Math.max(0, reliability)),
      snr,
      // Geometry, not signal level: the correction has nothing to say
      // about it, so it passes through untouched.
      takeoffAngleDeg: cell.takeoffAngleDeg,
    };
  });
}
