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
 * minimum in 2019. Provenance and the full evidence: propcore/docs/accuracy.md
 * and propcore/docs/calibration-matrix-es.md.
 *
 * Reliability is recomputed from the corrected median, because the engine's
 * printed reliability was derived from the uncorrected one. VOACAP models the
 * day-to-day SNR spread with deciles (`SNR LW`, `SNR UP`); treating a decile
 * as 1.2816 standard deviations of a normal distribution reproduces the
 * engine's own reliability from its own numbers (checked in tests), so the
 * same formula applied to the corrected median is consistent with the engine
 * rather than a second model. The deciles themselves are left as printed: the
 * validation covered the daily swing of the median, not the day-to-day
 * spread.
 */
import type { BandHourPrediction } from '../types.ts';
import type { RawBandHour } from './parse.ts';

/**
 * How much of VOACAP's predicted daily swing is real. Fitted on 2025-06,
 * validated out of sample on 2025-07, 2025-03, 2024-12, 2019-06 and 2019-12.
 */
export const SWING_FACTOR = 0.25;

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
  swingFactor: number = SWING_FACTOR,
): BandHourPrediction[] {
  // The centre is per band: each band has its own daily curve.
  const centres = new Map<string, number>();
  const byBand = new Map<string, number[]>();
  for (const cell of cells) {
    const list = byBand.get(cell.band);
    if (list === undefined) byBand.set(cell.band, [cell.snr]);
    else list.push(cell.snr);
  }
  for (const [band, values] of byBand) {
    centres.set(band, median(values));
  }

  return cells.map((cell) => {
    const centre = centres.get(cell.band) ?? cell.snr;
    const snr = centre + swingFactor * (cell.snr - centre);
    const reliability = cell.snrLowDecile !== null && cell.snrUpDecile !== null
      ? reliabilityFrom(snr, requiredSnrDb, cell.snrLowDecile, cell.snrUpDecile)
      : cell.reliability;
    return {
      hour: cell.hour,
      band: cell.band,
      reliability: Math.min(1, Math.max(0, reliability)),
      snr,
    };
  });
}
