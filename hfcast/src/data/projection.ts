/**
 * Azimuthal equidistant projection, centred on the operator.
 *
 * The right projection for this app and not a stylistic choice: every
 * straight line from the centre is a great circle, and distance from the
 * centre is to scale in every direction. So a distance ring really is a
 * circle, a bearing really is an angle read off the page, and "how far does
 * this band reach" is a shape rather than a lookup. On a Mercator map none
 * of those hold, and the answer would be wrong in exactly the direction
 * operators care about most — over the poles.
 *
 * The cost is that the edge is the point opposite you, smeared around the
 * whole rim. That is why the far edge is clipped rather than drawn.
 */

const DEG = Math.PI / 180;

/** Mean Earth radius, km. The same value the engine's hop arithmetic uses. */
export const EARTH_KM = 6371;

/**
 * How far round the world to draw, in degrees of arc.
 *
 * Just short of 180: the antipode itself projects to the entire rim at
 * once, so a polygon containing it wraps the whole circle and paints over
 * everything. Stopping half a degree short costs about 55 km of ocean on
 * the far side of the planet and removes the failure.
 */
export const CLIP_DEG = 179.5;

export interface Projector {
  /** Radius of the full 180° disc, in pixels. */
  readonly radius: number;
  readonly cx: number;
  readonly cy: number;
  /** Null when the point is beyond the clip angle. */
  project(lon: number, lat: number): readonly [number, number] | null;
  /** Pixels per kilometre along any radius from the centre. */
  readonly pxPerKm: number;
}

export function projector(
  centreLon: number,
  centreLat: number,
  size: number,
): Projector {
  const radius = size / 2;
  const lat0 = centreLat * DEG;
  const lon0 = centreLon * DEG;
  const sinLat0 = Math.sin(lat0);
  const cosLat0 = Math.cos(lat0);
  const clip = CLIP_DEG * DEG;

  return {
    radius,
    cx: radius,
    cy: radius,
    pxPerKm: radius / (Math.PI * EARTH_KM),
    project(lon: number, lat: number) {
      const phi = lat * DEG;
      const dLon = lon * DEG - lon0;
      const cosC = sinLat0 * Math.sin(phi)
        + cosLat0 * Math.cos(phi) * Math.cos(dLon);
      // `acos` of a value a hair outside [-1, 1] from rounding is NaN,
      // which would silently poison every path it touched.
      const c = Math.acos(Math.min(1, Math.max(-1, cosC)));
      if (c > clip) return null;

      // At the centre the scale factor is 0/0. The limit is 1, and the
      // point is the centre, so both branches agree there.
      const sinC = Math.sin(c);
      const k = sinC === 0 ? 1 : c / sinC;
      const x = k * Math.cos(phi) * Math.sin(dLon);
      const y = k
        * (cosLat0 * Math.sin(phi) - sinLat0 * Math.cos(phi) * Math.cos(dLon));

      // Angular distance runs 0..π across the disc, so π maps to the rim.
      const scale = radius / Math.PI;
      return [radius + x * scale, radius - y * scale] as const;
    },
  };
}

/**
 * A ring of points, projected, split wherever it leaves the disc.
 *
 * Returned as separate runs rather than one path with gaps: a coastline
 * that disappears over the far edge and comes back must not be joined by a
 * straight line across the middle of the map.
 */
export function projectRing(
  p: Projector,
  ring: readonly (readonly [number, number])[],
): (readonly [number, number])[][] {
  const runs: (readonly [number, number])[][] = [];
  let run: (readonly [number, number])[] = [];
  for (const [lon, lat] of ring) {
    const point = p.project(lon, lat);
    if (point === null) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    run.push(point);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** An SVG path from a list of projected points. */
export function pathOf(
  points: readonly (readonly [number, number])[],
  close = false,
): string {
  if (points.length === 0) return '';
  const parts = points.map(([x, y], i) =>
    `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  );
  return parts.join(' ') + (close ? ' Z' : '');
}

/**
 * The point `km` away from `(lon, lat)` on bearing `deg`.
 *
 * Used for great-circle paths and for the terminator, both of which are
 * curves the projection cannot draw as a straight line.
 */
export function destination(
  lon: number,
  lat: number,
  bearingDeg: number,
  km: number,
): readonly [number, number] {
  const d = km / EARTH_KM;
  const brg = bearingDeg * DEG;
  const phi1 = lat * DEG;
  const lam1 = lon * DEG;
  const sinPhi2 = Math.sin(phi1) * Math.cos(d)
    + Math.cos(phi1) * Math.sin(d) * Math.cos(brg);
  const phi2 = Math.asin(Math.min(1, Math.max(-1, sinPhi2)));
  const lam2 = lam1
    + Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(phi1),
      Math.cos(d) - Math.sin(phi1) * sinPhi2,
    );
  return [((lam2 / DEG + 540) % 360) - 180, phi2 / DEG] as const;
}

/**
 * Where the sun is overhead, for the given moment.
 *
 * A low-precision solar position: good to a fraction of a degree, which is
 * far finer than a terminator drawn a few hundred pixels wide can show. It
 * exists so the map's day and night agree with the forecast's, and the
 * forecast is monthly climatology.
 */
export function subsolarPoint(when: Date): readonly [number, number] {
  const start = Date.UTC(when.getUTCFullYear(), 0, 0);
  const day = (when.getTime() - start) / 86_400_000;
  // Declination, from the standard approximation to the obliquity term.
  const dec = -23.44
    * Math.cos(DEG * (360 / 365) * (day + 10));
  const hours = when.getUTCHours() + when.getUTCMinutes() / 60;
  const lon = -15 * (hours - 12);
  return [((lon + 540) % 360) - 180, dec] as const;
}

/**
 * The great circle 90° from a point, as a closed ring of lon/lat.
 *
 * Around the antisolar point that circle is the terminator: the boundary
 * between the lit and unlit halves of the earth.
 */
export function circleAround(
  lon: number,
  lat: number,
  radiusKm: number,
  steps = 180,
): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(destination(lon, lat, (i * 360) / steps, radiusKm));
  }
  return out;
}

/**
 * A great-circle path between two points, sampled densely enough to draw.
 *
 * Straight in this projection only when one end is the centre, which is the
 * common case here but not the only one.
 */
export function greatCircle(
  fromLon: number,
  fromLat: number,
  toLon: number,
  toLat: number,
  steps = 96,
): (readonly [number, number])[] {
  const phi1 = fromLat * DEG;
  const lam1 = fromLon * DEG;
  const phi2 = toLat * DEG;
  const lam2 = toLon * DEG;
  const d = 2
    * Math.asin(Math.sqrt(
      Math.sin((phi2 - phi1) / 2) ** 2
        + Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2,
    ));
  if (d === 0) return [[fromLon, fromLat]];

  const out: (readonly [number, number])[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(phi1) * Math.cos(lam1)
      + b * Math.cos(phi2) * Math.cos(lam2);
    const y = a * Math.cos(phi1) * Math.sin(lam1)
      + b * Math.cos(phi2) * Math.sin(lam2);
    const z = a * Math.sin(phi1) + b * Math.sin(phi2);
    out.push([
      Math.atan2(y, x) / DEG,
      Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG,
    ]);
  }
  return out;
}

/**
 * One grid cell as a ring of lon/lat, with its edges subdivided.
 *
 * Four corners would be wrong: a cell 22.5° wide is a curve in this
 * projection, and joining its corners with straight lines leaves white
 * wedges between neighbours and bulges the shape near the rim.
 */
export function cellRing(
  lon: number,
  lat: number,
  lonStep: number,
  latStep: number,
  perEdge = 4,
): (readonly [number, number])[] {
  const w = lonStep / 2;
  const h = latStep / 2;
  // Latitudes are clamped: a cell centred half a step from the pole would
  // otherwise reach past it and fold back on itself.
  const north = Math.min(90, lat + h);
  const south = Math.max(-90, lat - h);
  const out: (readonly [number, number])[] = [];
  const edge = (
    fromLon: number,
    fromLat: number,
    toLon: number,
    toLat: number,
  ) => {
    for (let i = 0; i < perEdge; i += 1) {
      const f = i / perEdge;
      out.push([
        fromLon + (toLon - fromLon) * f,
        fromLat + (toLat - fromLat) * f,
      ]);
    }
  };
  edge(lon - w, south, lon + w, south);
  edge(lon + w, south, lon + w, north);
  edge(lon + w, north, lon - w, north);
  edge(lon - w, north, lon - w, south);
  return out;
}

/**
 * The angle between two points on the sphere, in degrees.
 */
export function angularDistanceDeg(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const cos = Math.sin(lat1 * DEG) * Math.sin(lat2 * DEG)
    + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG)
      * Math.cos((lon2 - lon1) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
}

/**
 * Whether it is dark at a place at a given moment.
 *
 * Geometric night: more than 90° from the point the sun is overhead. It
 * takes no account of twilight or of refraction at the horizon, which move
 * the boundary by under a degree and do not change which half of the earth
 * a place is on.
 */
export function isNight(lon: number, lat: number, when: Date): boolean {
  const [sunLon, sunLat] = subsolarPoint(when);
  return angularDistanceDeg(lon, lat, sunLon, sunLat) > 90;
}

/**
 * Whether a closed polygon encloses a point, by ray casting.
 */
export function polygonContains(
  points: readonly (readonly [number, number])[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a === undefined || b === undefined) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    const straddles = yi > y !== yj > y;
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Which side of the projected terminator is the night side.
 *
 * The terminator is a closed curve on the map, and nothing about the curve
 * itself says which of the two regions it separates is dark — that depends
 * on where the sun is, and the answer flips through the day. Filling the
 * inside unconditionally shaded the operator's own half of the world in
 * broad daylight.
 *
 * The operator is at the centre of the projection and it is either dark
 * there or it is not, which settles it: if it is night at the centre, the
 * night side is whichever region contains the centre.
 */
export function nightIsInside(
  terminator: readonly (readonly [number, number])[],
  centreX: number,
  centreY: number,
  centreIsNight: boolean,
): boolean {
  return centreIsNight === polygonContains(terminator, centreX, centreY);
}

/**
 * Twice the signed area of a closed polygon. The sign is the winding
 * direction, which is the only part used here.
 */
export function signedArea(
  points: readonly (readonly [number, number])[],
): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a === undefined || b === undefined) continue;
    sum += (b[0] - a[0]) * (b[1] + a[1]);
  }
  return sum / 2;
}

/**
 * The rim of the disc as a ring of points.
 *
 * A polygon rather than two arcs so its winding direction is known and can
 * be set against the terminator's. Cutting one shape out of another needs
 * the two to wind opposite ways under the non-zero fill rule, and comes out
 * the same either way under even-odd — so doing it this way means the map
 * does not depend on which rule the renderer applies.
 */
export function discRing(
  cx: number,
  cy: number,
  radius: number,
  steps = 128,
): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (i * 2 * Math.PI) / steps;
    out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return out;
}

/** The same ring wound the other way. */
export function opposedTo(
  ring: readonly (readonly [number, number])[],
  reference: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  const same = Math.sign(signedArea(ring)) === Math.sign(signedArea(reference));
  return same ? [...ring].reverse() : ring;
}
