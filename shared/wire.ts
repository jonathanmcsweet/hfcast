/**
 * What the engine binary emits, as one declaration.
 *
 * There is one emitter — `hfcast-engine/src/service.rs` — and two readers
 * of it. The server spawns the binary; the app calls the same Rust
 * through `modules/engine-bridge`, which serialises with that same
 * serializer. So the two readers are reading one format and had written
 * it out separately, with the app's copy declaring three fields that can
 * be null as plain numbers. Nothing failed, because the one consumer that
 * does arithmetic on them checks for null first — but the declaration
 * said the check was unnecessary.
 *
 * Every field is optional or nullable where the emitter can leave it out.
 * That is not defensiveness: `service.rs` writes `at(row).map(num)
 * .unwrap_or(Json::Null)` for the decile and angle columns, so a null is
 * what the listing had no value for, and a reader has to decide what to
 * do about it rather than being told it cannot happen.
 */

/** One band-hour cell as the binary emits it, before it is given a band. */
export interface WireCell {
  hour: number;
  freqMhz: number;
  reliability: number;
  snr: number;
  /**
   * The day-to-day spread below and above the median, in dB, or null
   * where the listing printed no number. `shared/correct.ts` recomputes
   * reliability from these and falls back to the engine's own value when
   * either is absent.
   */
  snrLowDecile: number | null;
  snrUpDecile: number | null;
  /**
   * Transmit take-off angle in degrees, or null where the engine printed
   * no number.
   */
  takeoffAngleDeg: number | null;
}

/** One prediction: a path, all 24 hours, every band asked for. */
export interface WirePrediction {
  mufByHour?: readonly number[];
  fotByHour?: readonly (number | null)[];
  hpfByHour?: readonly (number | null)[];
  lufByHour?: readonly (number | null)[];
  cells?: readonly WireCell[];
  /**
   * Present when the run failed. The app checks for it one layer up, in
   * `modules/engine-bridge/index.ts`, and the server checks it here.
   */
  error?: string;
}

/** One grid point of an area run. */
export interface WireCoveragePoint {
  lat: number;
  lon: number;
  reliability: number;
  /**
   * Transmit take-off angle in degrees, or null where the engine printed
   * no number. Steep means near-vertical incidence: the signal leaves
   * steeply and comes back down close to where it started, with no skip
   * zone, which is the whole of what the fine grid is for.
   */
  takeoffAngleDeg?: number | null;
  /**
   * Median signal-to-noise ratio at this hour, dB, and the day-to-day
   * spread below and above it.
   *
   * What `shared/correctMap.ts` corrects the cell from. Optional because
   * answers cached before engine 0.68.0 do not carry them, and a cell
   * without them keeps the engine's own reliability — which is the map
   * this application drew for its whole life until now.
   */
  snr?: number | undefined;
  snrLowDecile?: number | null | undefined;
  snrUpDecile?: number | null | undefined;
}

/** One area run: the grid it landed on, and a point for each cell. */
export interface WireCoverage {
  latStep?: number;
  lonStep?: number;
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
  points?: readonly WireCoveragePoint[];
  error?: string;
}

/**
 * One grid point of a whole-day area run: the middle of its day.
 *
 * `medianSnr` is one number where one band was asked for and one a band
 * where several were. There is no hour for a reliability or an angle to
 * be about, so the run reports neither.
 */
export interface WireMedianPoint {
  lat: number;
  lon: number;
  medianSnr: number | readonly number[];
}

/** One whole-day area run. */
export interface WireMedians {
  latStep?: number;
  lonStep?: number;
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
  freqsMhz?: readonly number[];
  points?: readonly WireMedianPoint[];
  error?: string;
}
