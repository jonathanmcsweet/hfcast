/**
 * The only shapes the UI knows about.
 *
 * The bands, the cell and the grid point come from `shared/`, which both
 * projects import, so those cannot drift. The rest mirrors
 * `server/src/types.ts`: it is the wire contract, and the app's
 * `PathPrediction` allows a survey's null far end where the server's
 * always has both.
 */

import type { BandHourPrediction, BandKey } from '../../../shared/bands.ts';
import type { RawCoveragePoint } from '../../../shared/correctMap.ts';

export type {
  BandHourPrediction,
  BandKey,
  RawBandHour,
} from '../../../shared/bands.ts';
export {
  BAND_MHZ,
  BAND_ORDER,
  BANDS_BY_FREQ,
  isBandKey,
} from '../../../shared/bands.ts';

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

/**
 * A searched place as an endpoint.
 *
 * The one field that is not a rename: a place's `name` becomes the
 * endpoint's `label`. Both screens that offer a search had a copy of
 * this.
 */
export const placeToEndpoint = (place: Place): Endpoint => ({
  grid: place.grid,
  label: place.name,
  lat: place.lat,
  lon: place.lon,
});

export type { RawCoveragePoint } from '../../../shared/correctMap.ts';
export type { CoveragePoint } from '../../../shared/points.ts';

export interface Coverage {
  band: BandKey;
  hour: number;
  latStep: number;
  lonStep: number;
  reach: number;
  basis: PredictionBasis;
  /**
   * Before the correction, where the engine reported enough to apply it.
   *
   * The map is drawn from these as soon as they exist and corrected when
   * the lattice of daily middles arrives — see `correctedCoverage`. That
   * is what lets the first paint be immediate and the second be right,
   * without computing the grid twice.
   */
  points: readonly RawCoveragePoint[];
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
  /** Before the correction, as `Coverage.points` are. */
  points: readonly RawCoveragePoint[];
}

/**
 * The fine grid, over the whole world, stored by column rather than by
 * point.
 *
 * 34,560 points as objects is tens of megabytes of JavaScript heap for
 * one hour, and the map holds several hours as a user moves the slider.
 * As two typed arrays it is about 280 KB, which is what makes keeping a
 * whole-world answer in memory reasonable at all.
 *
 * This works because the lattice is regular and the engine's row order
 * is guaranteed — south to north, west to east — so a point's place in
 * the array is its position on the earth and does not need storing. The
 * conversion happens in the query function, so the raw objects the wire
 * carries are never what gets cached.
 *
 * `latMin` and `lonMin` are cell *centres*, matching what the engine
 * echoes and what `cellRing` expects.
 */
export interface FineGlobe {
  band: BandKey;
  hour: number;
  latMin: number;
  lonMin: number;
  latStep: number;
  lonStep: number;
  /** Columns, then rows. Index is `row * nx + column`. */
  nx: number;
  ny: number;
  reliability: Float32Array;
  takeoffAngleDeg: Float32Array;
}

/**
 * The part of the world the map is showing.
 *
 * `halfLatDeg` is half the height of the frame, in degrees of latitude,
 * so a zoomed-in view asks for a small number and a zoomed-out one a
 * large one. It is the whole of what the fine grid needs to know about
 * the view: where to centre, and how much has to fit.
 */
export interface MapRegion {
  lat: number;
  lon: number;
  halfLatDeg: number;
}
