/**
 * The wire contract between the server and the app. The app's `PathPrediction`
 * mirrors this shape, so any change here is a change to the app's data layer.
 */

export type BandKey =
  | '160m'
  | '80m'
  | '40m'
  | '30m'
  | '20m'
  | '17m'
  | '15m'
  | '12m'
  | '10m';

export const BAND_ORDER: readonly BandKey[] = [
  '10m',
  '12m',
  '15m',
  '17m',
  '20m',
  '30m',
  '40m',
  '80m',
  '160m',
];

/** Nominal centre frequency in MHz, used for the deck and the MUF comparison. */
export const BAND_MHZ: Readonly<Record<BandKey, number>> = {
  '160m': 1.84,
  '80m': 3.75,
  '40m': 7.1,
  '30m': 10.12,
  '20m': 14.2,
  '17m': 18.1,
  '15m': 21.2,
  '12m': 24.94,
  '10m': 28.4,
};

/** Ascending frequency order, which is the order the deck must list them in. */
export const BANDS_BY_FREQ: readonly BandKey[] = [...BAND_ORDER].sort(
  (a, b) => BAND_MHZ[a] - BAND_MHZ[b],
);

export interface BandHourPrediction {
  /** UTC hour, 0-23. */
  hour: number;
  band: BandKey;
  /** Circuit reliability, 0..1. The "chance of rain" analogue. */
  reliability: number;
  /** Median signal-to-noise ratio in dB. */
  snr: number;
}

/** Where the sunspot number driving a run came from. */
export type PredictionBasis =
  /** Smoothed SSN for the month. Long-run climatology. */
  | 'climatology'
  /** SSN inferred from current solar and geomagnetic indices. */
  | 'nowcast'
  /** Predicted smoothed SSN for a future month. */
  | 'forecast';

export interface Endpoint {
  /** Maidenhead locator, 6 characters. Deliberately not translated. */
  grid: string;
  /** Free text place name from geocoding, or the grid if none is known. */
  label: string;
  lat: number;
  lon: number;
}

export interface PathPrediction {
  from: Endpoint;
  to: Endpoint;
  distanceKm: number;
  bearingDeg: number;
  /** The sunspot number the run actually used. */
  ssn: number;
  basis: PredictionBasis;
  /** 1-12. Climatology is monthly, so the month is part of the identity. */
  month: number;
  year: number;
  /** ISO date (UTC) this prediction is meant to describe. */
  date: string;
  /** Median MUF for the path, per UTC hour, index 0-23. */
  mufByHour: readonly number[];
  cells: readonly BandHourPrediction[];
}

export interface SpaceWeather {
  /** 10.7 cm solar radio flux in solar flux units. */
  f107: number;
  /** Observed (unsmoothed) daily sunspot number, when published. */
  observedSsn: number | null;
  /** Planetary K index, 0-9. */
  kp: number;
  /** SSN derived from f107 and kp, suitable for driving VOACAP now. */
  effectiveSsn: number;
  /** When the underlying measurements were taken. */
  observedAt: string;
}

export interface PredictionResponse {
  prediction: PathPrediction;
  /** Null when the space weather upstream was unreachable. */
  spaceWeather: SpaceWeather | null;
}
