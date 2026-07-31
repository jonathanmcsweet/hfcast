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
  /**
   * The far end, or null for a survey — a forecast with no destination,
   * where each cell is the share of directions reachable rather than the
   * chance of one contact. See `survey.ts`.
   *
   * This is where the app's shape stops mirroring the server's, which always
   * has both ends. The three fields that describe one path are null together
   * and never separately.
   */
  to: Endpoint | null;
  distanceKm: number | null;
  bearingDeg: number | null;
  /** The sunspot number the run actually used. */
  ssn: number;
  /**
   * The signal-to-noise this run required, in a 1 Hz bandwidth.
   *
   * Echoed so the app can say what the numbers mean without holding its
   * own copy of the mode table. Two tables would drift, and the symptom
   * would be a screen naming one threshold while the grid was computed at
   * another.
   */
  requiredSnrDb: number;
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
   * supply one. Drawn by the usable-window rail.
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
  /**
   * Highest Kp over roughly the last 24 hours. Ionospheric storm effects
   * outlast the disturbance itself, so "was there a storm recently" is the
   * question the spread widening asks. See `correct.ts`.
   */
  kpMax24h: number;
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

/** One grid point of the coverage map. */
export interface CoveragePoint {
  lat: number;
  lon: number;
  reliability: number;
  /**
   * Transmit take-off angle in degrees, where the engine printed one.
   *
   * Optional because the coarse whole-world grid does not need it and
   * older cached answers do not carry it. The fine patch does: near
   * vertical incidence is a property of this angle and of nothing else,
   * so it is what tells the region around the station that works without
   * a skip zone from a long low-angle hop. See `isNvis`.
   */
  takeoffAngleDeg?: number | null;
}

/**
 * Where one band reaches, at one hour, in every direction.
 *
 * `reach` is the share of the globe above the "patchy" threshold, weighted
 * by area — the headline number the map is a picture of. The cell size is
 * the server's, not a request parameter, so the cells always tile without
 * gaps.
 */
export interface Coverage {
  band: BandKey;
  hour: number;
  latStep: number;
  lonStep: number;
  reach: number;
  basis: PredictionBasis;
  points: readonly CoveragePoint[];
}

/**
 * The fine grid around the operator, drawn over the coarse one.
 *
 * A second answer to the same question at a scale the whole-world grid
 * cannot reach — see `coveragePatch.ts` for why it exists and how big it
 * is. It carries no `reach`, deliberately: the headline share of the
 * globe is computed from the coarse grid alone, and adding a region
 * already counted there would count it twice.
 */
export interface CoveragePatch {
  band: BandKey;
  hour: number;
  latStep: number;
  lonStep: number;
  /**
   * The rectangle that actually ran: the first and last point on each
   * axis, not the cell edges, which are half a step further out.
   */
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  basis: PredictionBasis;
  points: readonly CoveragePoint[];
}
