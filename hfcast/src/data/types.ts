/**
 * The only shapes the UI knows about. These mirror `server/src/types.ts`;
 * changing one means changing the other.
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

/** VOACAP emits one of these per band per hour. */
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
   * none. Steep means near-vertical incidence: see `isNvis`.
   */
  takeoffAngleDeg: number | null;
}

/** Where the sunspot number driving a run came from. */
export type PredictionBasis =
  /** Observed smoothed SSN for the month. Long-run climatology. */
  | 'climatology'
  /** SSN inferred from current solar and geomagnetic indices. */
  | 'nowcast'
  /** Predicted smoothed SSN for a month not yet observed. */
  | 'forecast';

export interface Endpoint {
  /** Maidenhead locator. Deliberately not translated. */
  grid: string;
  /** Place name from geocoding, or the locator when none is known. */
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
  /** ISO date (UTC) this prediction describes. */
  date: string;
  /** Median MUF in MHz per UTC hour, index 0-23. */
  mufByHour: number[];
  /**
   * The frequency window to work inside, or null when the server did not
   * supply one. Nothing displays it yet.
   */
  window: OperatingWindow | null;
  cells: BandHourPrediction[];
}

/**
 * The frequency window, per UTC hour, index 0-23.
 *
 * Answers "what should I set the dial to", which the reliability figures
 * do not: above the MUF the signal passes through the ionosphere, below
 * the LUF it is absorbed or lost in noise.
 *
 * Null entries are ordinary and mean the engine reported no value for
 * that hour. A null LUF specifically means no frequency met the required
 * reliability, not that a very low one did — so an hour with no LUF has
 * no bottom to draw, rather than a bottom at zero. A long path at low
 * power can have no LUF at any hour of the day.
 */
export interface OperatingWindow {
  /** Frequency of optimum traffic: the one to pick. */
  fotByHour: (number | null)[];
  /** Highest probable frequency. */
  hpfByHour: (number | null)[];
  /** Lowest usable frequency. */
  lufByHour: (number | null)[];
}

export interface SpaceWeather {
  /** 10.7 cm solar radio flux in solar flux units. */
  f107: number;
  observedSsn: number | null;
  /** Planetary K index, 0-9. */
  kp: number;
  /** SSN derived from f107 and kp, used to drive a now-cast. */
  effectiveSsn: number;
  observedAt: string;
}

/**
 * A measured foF2 from a real ionosonde near the path, for comparison with
 * the model's assumption. Absent for most of the world: only a handful of
 * stations report live, and nearly all of them are in Europe.
 */
export interface Sounding {
  station: string;
  ursi: string;
  /** How far the sounder is from the point asked about, km. */
  km: number;
  /** Critical frequency of the F2 layer, MHz. */
  fof2: number;
  measuredAt: string;
  /** Autoscaling confidence, 0-100. */
  confidence: number;
}

export interface PredictionResponse {
  prediction: PathPrediction;
  /** Null when the space weather upstream was unreachable. */
  spaceWeather: SpaceWeather | null;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
  grid: string;
  country: string | null;
  admin1: string | null;
}

export const BAND_ORDER: BandKey[] = [
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

/** Nominal centre frequency, used for the MUF comparison and sorting. */
export const BAND_MHZ: Record<BandKey, number> = {
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
