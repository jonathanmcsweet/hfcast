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

import type { MapRegion } from './types';

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
  /**
   * A screen point back to a longitude and latitude, or null outside the
   * drawn disc.
   *
   * The inverse exists in closed form here, which is not true of every
   * projection: distance from the centre is the angular distance to
   * scale, and the direction from the centre is the bearing, so a point
   * on the screen names a bearing and a range and those name a place.
   */
  invert(x: number, y: number): readonly [number, number] | null;
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
    invert(x: number, y: number) {
      const scale = radius / Math.PI;
      const dx = (x - radius) / scale;
      // Screen y grows downward and latitude grows upward.
      const dy = (radius - y) / scale;
      const c = Math.hypot(dx, dy);
      if (c > clip) return null;
      // The centre is the one point with no bearing from itself, and the
      // formulas below divide by `c`.
      if (c === 0) return [centreLon, centreLat] as const;

      const sinC = Math.sin(c);
      const cosC = Math.cos(c);
      const phi = Math.asin(
        Math.min(1, Math.max(-1, cosC * sinLat0 + (dy * sinC * cosLat0) / c)),
      );
      const lambda = lon0
        + Math.atan2(dx * sinC, c * cosLat0 * cosC - dy * sinLat0 * sinC);
      // Folded into -180..180, which is what every other coordinate here
      // is in.
      return [((lambda / DEG + 540) % 360) - 180, phi / DEG] as const;
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

/**
 * An SVG path from a list of projected points.
 *
 * Two decimals, because the viewBox multiplies rounding error by the
 * zoom. The coordinates are written once, in the base space, and the
 * deepest zoom magnifies whatever error they carry: at one decimal the
 * worst case is 0.05 px, which is invisible at 1x and 1.5 px of wobble
 * at the 30x ceiling — every line in the map wiggled. Two decimals is
 * 0.15 px at 30x, under what a screen can show.
 */
export function pathOf(
  points: readonly (readonly [number, number])[],
  close = false,
): string {
  if (points.length === 0) return '';
  const parts = points.map(([x, y], i) =>
    `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
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
 * The outline of a whole grid of cells, as a ring of lon/lat.
 *
 * The bounds are the first and last *point* on each axis, as the engine
 * echoes them, so the outline is half a step further out on all four
 * sides — the outer edge of the outermost cells. Getting that wrong by
 * half a step leaves a hairline of whatever is underneath showing round
 * the edge.
 *
 * Subdivided more finely than a single cell, because it is several cells
 * long and the same number of segments over a longer edge is a coarser
 * curve.
 */
export function gridOutline(
  bounds: {
    readonly lonMin: number;
    readonly lonMax: number;
    readonly latMin: number;
    readonly latMax: number;
  },
  lonStep: number,
  latStep: number,
  perEdge = 16,
): (readonly [number, number])[] {
  return cellRing(
    (bounds.lonMin + bounds.lonMax) / 2,
    (bounds.latMin + bounds.latMax) / 2,
    bounds.lonMax - bounds.lonMin + lonStep,
    bounds.latMax - bounds.latMin + latStep,
    perEdge,
  );
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

/** Kilometres in a degree of latitude. Only the scale of a box needs it. */
const KM_PER_DEGREE = 111.19;

/**
 * What the map is showing: how far in, and on what.
 *
 * The centre is a fraction of the disc rather than a pixel, so a layout
 * change does not move the view.
 */
export interface MapView {
  scale: number;
  cxF: number;
  cyF: number;
}

/**
 * The scale at which the whole disc fits the frame.
 *
 * Owned here rather than by the map component, because two pieces of
 * arithmetic assume it: `regionOf` reads "at or below this" as "showing
 * the whole globe", and `containView` pins the centre when the window is
 * the disc. A component free to change its own minimum would move one
 * without the other.
 */
export const MIN_SCALE = 1;

/**
 * Where the view puts a disc point on the screen, in both the forms the
 * map needs to draw it.
 *
 * The map is drawn on two surfaces at once: a Skia canvas carrying the
 * cell field, and an SVG layer over it carrying the coast, the rings,
 * the night cap and the markers. They place a point by different means —
 * SVG through a `viewBox` string, Skia through a matrix — and if the two
 * ever disagree the coastlines slide off the cells. That is the first
 * fault a reader sees, and it does not look like a rounding error; it
 * looks like the map is wrong about where land is.
 *
 * So neither renderer computes this. Both take it from here, and
 * `projection.test.ts` checks that a point lands on the same pixel
 * through both.
 *
 * `scale`, `tx` and `ty` are a similarity transform: multiply, then
 * offset. That is all an azimuthal disc under a square window needs —
 * the window is square and the zoom is uniform, so there is no rotation
 * and no aspect to carry.
 */
export interface ViewTransform {
  /** For `<Svg viewBox=…>`. */
  viewBox: string;
  /** Uniform, so one number serves both axes. */
  scale: number;
  tx: number;
  ty: number;
}

export function viewTransform(view: MapView, size: number): ViewTransform {
  // The viewBox is text, and text is rounded. Both layers are then
  // derived from the rounded numbers rather than from the exact ones,
  // because SVG can only use what the string says.
  //
  // Rounding the window's *width* is what makes this matter: it changes
  // the scale SVG actually applies, by size/round(w) against size/w, and
  // that error multiplies with distance from the window's corner. At the
  // 30x ceiling it reached 1.35 px — small as a number, but it is the
  // coastlines sliding off the cells, which reads as the map being wrong
  // about where land is.
  const round = (n: number) => Number(n.toFixed(2));

  const windowSize = round(size / view.scale);
  const minX = round(view.cxF * size - windowSize / 2);
  const minY = round(view.cyF * size - windowSize / 2);

  // SVG is given the window in disc units and fits it to the element.
  // Skia is given the same mapping written out: a point at `minX` lands
  // at 0, and one disc unit becomes `scale` pixels.
  const scale = size / windowSize;

  return {
    viewBox: [minX, minY, windowSize, windowSize]
      .map((n) => n.toFixed(2))
      .join(' '),
    scale,
    tx: -minX * scale,
    ty: -minY * scale,
  };
}

/** A disc point in screen pixels. The canvas draws through this. */
export const toScreen = (
  t: ViewTransform,
  x: number,
  y: number,
): [number, number] => [x * t.scale + t.tx, y * t.scale + t.ty];

/**
 * The part of the world the map is showing, in degrees.
 *
 * The centre comes back through the projection's inverse, which is
 * closed form here, so it is the place under the middle of the frame
 * rather than an estimate. The half-extent is the visible half-width
 * turned into kilometres and then into degrees of latitude; on an
 * azimuthal equidistant projection distance from the centre is to
 * scale, which is exactly the property that makes this a division
 * rather than a search.
 *
 * Null at a whole-globe view, and wherever the middle of the frame is
 * off the disc — panned to a corner. Both mean the same thing to the
 * caller: there is no region worth running, use the default.
 */
export function regionOf(
  p: Projector,
  view: MapView,
  size: number,
): MapRegion | null {
  if (view.scale <= MIN_SCALE) return null;
  const centre = p.invert(view.cxF * size, view.cyF * size);
  if (centre === null) return null;
  const [lon, lat] = centre;
  const halfKm = size / (2 * view.scale) / p.pxPerKm;
  return { lat, lon, halfLatDeg: halfKm / KM_PER_DEGREE };
}

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Keeps the visible window inside the disc.
 *
 * At 1x the window is the whole disc, so the only centre that fits is the
 * middle — which is what stops a drag from sliding the globe off its own
 * frame when there is nothing to pan to. Zoomed in, it stops the edge of
 * the world being dragged into the middle of the card.
 */
export const containView = (v: MapView): MapView => {
  const half = 1 / (2 * v.scale);
  return {
    scale: v.scale,
    cxF: clamp(v.cxF, half, 1 - half),
    cyF: clamp(v.cyF, half, 1 - half),
  };
};
