/**
 * The cell field, as geometry, for whichever renderer is drawing it.
 *
 * The map has two cell renderers: a Skia canvas in the modern build and
 * SVG in the legacy one. Two renderers means a risk that the same
 * forecast is drawn two different ways, and the reader has no way to
 * know which one is lying. So every decision that could differ is made
 * here, once, and each renderer is left as a draw loop over the result:
 * which cells exist, where their corners are, which quality bucket each
 * falls in, and what the fill rule is.
 *
 * The unit of drawing is a **bucket**, not a cell. All the cells of one
 * quality become a single path with one subpath each. Two reasons, and
 * they point the same way:
 *
 * - It is what makes a canvas worth having. A whole-world fine grid is
 *   34,560 cells; as 34,560 draw calls that is hopeless, as four paths
 *   it is four. The cost moves from drawing to path building, which is
 *   done once per data change rather than once per frame.
 * - It removes the drift. Both renderers take the same strings, so the
 *   geometry cannot disagree — only the paint can, and the paint is four
 *   colours from the theme.
 *
 * Merging cells into one path is safe because cells of one grid never
 * overlap: they are a lattice. Non-overlapping subpaths wound the same
 * way fill identically under either fill rule, and a shared edge stops
 * showing a seam, which is an improvement rather than a change.
 */
import type { QualityKey } from '../theme.ts';
import { cellRing, pathOf, projectRing } from './projection.ts';
import type { Projector, ViewTransform } from './projection.ts';
import { isNvis, qualityFor } from './quality.ts';
import type { CoveragePoint } from './types.ts';

/** The box the Fit control frames, in disc coordinates. */
export interface ReachBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** One quality's worth of cells, as a single path. */
export interface CellBucket {
  quality: QualityKey;
  d: string;
}

export interface CellField {
  buckets: CellBucket[];
  /**
   * Null when this band reaches nowhere, so a caller can tell "no reach"
   * from "a reach of zero size" without inspecting the buckets.
   */
  reachBox: ReachBox | null;
}

/**
 * Turn grid points into one path per quality.
 *
 * `countInReach` says whether these cells set the Fit box. The coarse
 * grid does; the patch does not, because Fit frames where the band
 * reaches and the patch is a region rather than an answer about reach.
 * Counting it would pull the frame toward home on every band, whatever
 * the band did.
 */
export function cellField(
  p: Projector,
  points: readonly CoveragePoint[],
  lonStep: number,
  latStep: number,
  countInReach: boolean,
): CellField {
  // One string per quality, joined at the end. Built by appending
  // because a path is text and the alternative — an array per bucket
  // then four joins — allocates the same characters twice.
  const parts = new Map<QualityKey, string[]>();

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  // A loop rather than a reduce: this walks tens of thousands of points
  // to build strings and a bounding box, and the functional form would
  // rebuild both on every point. The values it writes do not escape.
  for (const point of points) {
    const ring = cellRing(point.lon, point.lat, lonStep, latStep);
    const runs = projectRing(p, [...ring, ring[0] as [number, number]]);
    // A cell straddling the clip boundary comes back in pieces. Only
    // whole ones are filled: a fragment closed on itself would be a
    // wedge of colour across a part of the map it does not describe.
    if (runs.length !== 1) continue;
    const run = runs[0] as [number, number][];
    const quality = qualityFor(point.reliability);

    const held = parts.get(quality);
    if (held === undefined) parts.set(quality, [pathOf(run, true)]);
    else held.push(pathOf(run, true));

    // Closed cells are left out of the box on purpose — they are the
    // part of the map the answer is not about.
    if (countInReach && quality !== 'closed') {
      for (const [x, y] of run) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return {
    buckets: [...parts].map(([quality, ds]) => ({
      quality,
      d: ds.join(' '),
    })),
    reachBox: minX <= maxX ? { minX, minY, maxX, maxY } : null,
  };
}

/**
 * Everything a cell renderer needs, and nothing about how it draws.
 *
 * Declared here rather than beside the canvas because both the canvas
 * and the legacy stub that stands in for it have to agree on this
 * shape, and only one of them can name Skia.
 */
export interface CellLayerProps {
  p: Projector;
  transform: ViewTransform;
  size: number;
  coarse: CellBucket[];
  patch: CellBucket[];
  /** The opaque rectangle under the patch, or '' when there is none. */
  patchBacking: string;
  nvis: [number, number][];
  ramp: Record<QualityKey, { fill: string; opacity: number; }>;
  /** The disc's own colour, and the patch backing's. */
  card: string;
  /** The stipple's colour. */
  ink: string;
}

/**
 * The near-vertical stipple, as projected points.
 *
 * Points rather than a property of a cell: a point beyond the clip
 * boundary projects to nothing, and that is a different question from
 * whether its cell could be drawn.
 */
export function nvisPoints(
  p: Projector,
  points: readonly CoveragePoint[],
): [number, number][] {
  return points
    .filter((point) => isNvis(point.takeoffAngleDeg, point.reliability))
    .map((point) => p.project(point.lon, point.lat))
    .filter((at): at is [number, number] => at !== null);
}
