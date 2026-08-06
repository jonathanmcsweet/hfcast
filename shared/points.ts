/**
 * One grid point of a coverage map.
 *
 * Shared because the reach percentage is computed from these on both
 * sides and drawn from them on one, so the shape has to be the same
 * shape.
 */
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
   * a skip zone from a long low-angle hop.
   */
  takeoffAngleDeg?: number | null;
}
