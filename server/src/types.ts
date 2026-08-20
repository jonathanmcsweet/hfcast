/**
 * The wire contract between the server and the app. The app's `PathPrediction`
 * mirrors this shape, so any change here is a change to the app's data layer.
 *
 * The bands, the cell shape and the grid point come from `shared/`, which
 * is where anything both projects have to agree on lives.
 */

import type { BandHourPrediction } from '../../shared/bands.ts';

export type {
  BandHourPrediction,
  BandKey,
  RawBandHour,
} from '../../shared/bands.ts';
export {
  BAND_MHZ,
  BAND_ORDER,
  BANDS_BY_FREQ,
  isBandKey,
  MIN_CARD_FREQ_MHZ,
} from '../../shared/bands.ts';

export type { CoveragePoint } from '../../shared/points.ts';

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
  /**
   * The far end, or null for a survey — what `/api/survey` returns, where
   * each cell is the share of directions reachable rather than the chance
   * of one contact. The three path fields are null together, never
   * separately; `/api/prediction` fills all three.
   */
  to: Endpoint | null;
  distanceKm: number | null;
  bearingDeg: number | null;
  /** The sunspot number the run actually used. */
  ssn: number;
  /**
   * The signal-to-noise this run required, in a 1 Hz bandwidth.
   *
   * Echoed so the app can say what the numbers mean without its own copy
   * of the mode table. Two tables drift, and the symptom is a screen
   * naming one threshold while the grid was computed at another.
   */
  requiredSnrDb: number;
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
 * MHz, or null where the engine printed no value. A null LUF is ordinary
 * — no frequency met the required reliability that hour, which is not the
 * same as a very low one. Whole days of null happen: a long path at low
 * power has no LUF at any hour.
 *
 * The whole object is null from the server's Fortran fallback, which
 * would need a second `voacapl` run to produce it.
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
   * Highest Kp over roughly the last 24 hours. Storm effects outlast the
   * disturbance, so "was there a storm recently" is what the spread
   * widening asks. See voacap/correct.ts.
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

/**
 * The part of the world the map is showing.
 *
 * `halfLatDeg` is half the height of the frame in degrees of latitude, so
 * a zoomed-in view asks for a small number. Where to centre and how much
 * has to fit is all the fine grid needs to know about the view.
 */
export interface MapRegion {
  lat: number;
  lon: number;
  halfLatDeg: number;
}
