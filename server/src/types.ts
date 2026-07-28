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
  /**
   * Transmit take-off angle in degrees, or null where the engine printed
   * no angle for this band and hour.
   *
   * Carried through so a client can say when a path works by
   * near-vertical incidence: a steep departure comes back down without a
   * skip zone, which is why a short path works on bands that look too
   * low for it. The empirical correction does not touch this — it moves
   * the signal median, not the geometry.
   */
  takeoffAngleDeg: number | null;
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
  /**
   * The frequency window to work inside, or null when the engine did
   * not supply one. Null is a normal answer, not an error: see
   * `OperatingWindow`.
   */
  window: OperatingWindow | null;
  cells: readonly BandHourPrediction[];
}

/**
 * The frequency window to work inside, per UTC hour, index 0-23.
 *
 * Answers "what should I set the dial to", which the reliability figures
 * do not: too high goes through the ionosphere, too low is absorbed.
 *
 * Every entry is in MHz, or null where the engine printed no value. A
 * null LUF is ordinary and means the search found no frequency meeting
 * the required reliability at that hour, not a very low one — zero is a
 * frequency and absent is not. Whole days of null happen: a long path at
 * low power has no LUF at any hour.
 *
 * The whole object is null when the prediction came from the server's
 * Fortran fallback, which would need a second `voacapl` run to produce
 * it.
 */
export interface OperatingWindow {
  /** Frequency of optimum traffic: the one to pick. */
  readonly fotByHour: readonly (number | null)[];
  /** Highest probable frequency. */
  readonly hpfByHour: readonly (number | null)[];
  /** Lowest usable frequency, below which absorption and noise win. */
  readonly lufByHour: readonly (number | null)[];
}

export interface SpaceWeather {
  /** 10.7 cm solar radio flux in solar flux units. */
  f107: number;
  /** Observed (unsmoothed) daily sunspot number, when published. */
  observedSsn: number | null;
  /** Planetary K index, 0-9. */
  kp: number;
  /**
   * Highest Kp over roughly the last 24 hours. Ionospheric storm effects
   * outlast the disturbance itself, so "was there a storm recently" is the
   * question the spread widening asks. See voacap/correct.ts.
   */
  kpMax24h: number;
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
