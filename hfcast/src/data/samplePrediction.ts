import { BAND_ORDER, BAND_MHZ } from './types';
import type { BandKey, BandHourPrediction, PathPrediction } from './types';

/**
 * Stand-in for a real VOACAP run. Replace `RELIABILITY` with the output of
 * your prediction backend — the rest of the app only reads `PathPrediction`,
 * so nothing else needs to change.
 *
 * Rows are bands, columns are UTC hours 0-23.
 */
const RELIABILITY: Record<BandKey, number[]> = {
  '10m': [0.04, 0.02, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.01, 0.02, 0.04, 0.06, 0.07, 0.06],
  '12m': [0.12, 0.08, 0.04, 0.02, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.01, 0.02, 0.04, 0.08, 0.12, 0.16, 0.17, 0.16],
  '15m': [0.37, 0.3, 0.23, 0.15, 0.09, 0.05, 0.03, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.01, 0.03, 0.05, 0.09, 0.15, 0.23, 0.3, 0.37, 0.41, 0.41],
  '17m': [0.61, 0.56, 0.48, 0.38, 0.29, 0.2, 0.14, 0.09, 0.05, 0.03, 0.01, 0.01, 0.01, 0.03, 0.05, 0.09, 0.14, 0.2, 0.29, 0.38, 0.48, 0.56, 0.61, 0.63],
  '20m': [0.93, 0.93, 0.9, 0.84, 0.76, 0.67, 0.57, 0.47, 0.38, 0.29, 0.22, 0.16, 0.11, 0.11, 0.16, 0.22, 0.29, 0.38, 0.47, 0.57, 0.67, 0.76, 0.84, 0.9],
  '30m': [0.03, 0.05, 0.08, 0.13, 0.19, 0.28, 0.38, 0.49, 0.6, 0.71, 0.8, 0.86, 0.88, 0.86, 0.8, 0.71, 0.6, 0.49, 0.38, 0.28, 0.19, 0.13, 0.08, 0.05],
  '40m': [0.0, 0.01, 0.02, 0.04, 0.08, 0.14, 0.24, 0.35, 0.49, 0.63, 0.74, 0.8, 0.8, 0.74, 0.63, 0.49, 0.35, 0.24, 0.14, 0.08, 0.04, 0.02, 0.01, 0.0],
  '80m': [0.0, 0.0, 0.0, 0.01, 0.02, 0.04, 0.09, 0.16, 0.26, 0.37, 0.46, 0.49, 0.46, 0.37, 0.26, 0.16, 0.09, 0.04, 0.02, 0.01, 0.0, 0.0, 0.0, 0.0],
  '160m': [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.01, 0.03, 0.08, 0.13, 0.19, 0.21, 0.19, 0.13, 0.08, 0.03, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
};

/** Crude but monotonic: better circuits sit further above the noise floor. */
function snrFor(band: BandKey, reliability: number): number {
  const noisePenalty = BAND_MHZ[band] < 8 ? 6 : 0;
  return Math.round(2 + reliability * 32 - noisePenalty);
}

const cells: BandHourPrediction[] = BAND_ORDER.flatMap((band) =>
  RELIABILITY[band].map((reliability, hour) => ({
    band,
    hour,
    reliability,
    snr: snrFor(band, reliability),
  })),
);

export const samplePrediction: PathPrediction = {
  fromGrid: 'CN87',
  toGrid: 'PM95',
  fromKey: 'places.seattle',
  toKey: 'places.tokyo',
  distanceKm: 7710,
  bearingDeg: 305,
  smoothedSSN: 68,
  month: 11,
  cells,
};

export function cellsForHour(
  p: PathPrediction,
  hour: number,
): BandHourPrediction[] {
  const h = ((hour % 24) + 24) % 24;
  return BAND_ORDER.map(
    (band) => p.cells.find((c) => c.band === band && c.hour === h)!,
  );
}

export function bestBandAt(
  p: PathPrediction,
  hour: number,
): BandHourPrediction {
  return cellsForHour(p, hour).reduce((best, c) =>
    c.reliability > best.reliability ? c : best,
  );
}

/**
 * Maximum usable frequency, approximated as the highest band still carrying
 * meaningful reliability. A real run reports MUF directly.
 */
export function mufAt(p: PathPrediction, hour: number): number {
  const open = cellsForHour(p, hour).filter((c) => c.reliability >= 0.15);
  if (open.length === 0) return 0;
  return Math.max(...open.map((c) => BAND_MHZ[c.band]));
}
