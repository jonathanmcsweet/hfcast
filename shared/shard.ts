/**
 * Splitting one area run into several, to use more than one core.
 *
 * The engine is a single-threaded process that reads a request and writes
 * an answer, so a grid runs at the speed of one core however many the
 * host has. Nothing in a grid point depends on the point before it — the
 * engine carries two pieces of state between them, but the printed
 * answers were measured identical at every point of a 34,560-point grid
 * run whole against the same grid run as 16 rectangles. So the grid can
 * be cut into strips and the strips run at once.
 *
 * Cut by latitude only. A strip is whole rows, and the engine emits rows
 * south to north and each row west to east, so the strips concatenate
 * into exactly the sequence one run would have produced — not merely the
 * same set of points in some order.
 *
 * The cut has to land between rows rather than inside one, or a row
 * would be run twice or not at all. That is what the quarter-cell inset
 * below is for.
 */

/** The rectangle an area run covers, in degrees. */
export interface AreaBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

/**
 * The point at which a grid is big enough to be worth splitting.
 *
 * Each strip is its own process, and each process re-reads the
 * coefficient files — about 16 ms before it computes anything. Below
 * this the fixed cost is most of the run and splitting makes it slower.
 *
 * The two grids the app asks for today, 192 points and about 300, are
 * both far below it. This exists for a whole-world grid at the fine
 * step, which is 34,560.
 */
export const MIN_SHARD_POINTS = 2000;

/** One axis of the engine's lattice, as `part_axis` computes it. */
interface Axis {
  /** How many cells the axis is divided into over the whole span. */
  bands: number;
  /** One cell, in degrees. Not the requested step where it does not divide. */
  width: number;
  /** The first and last cell index the request covers. */
  first: number;
  last: number;
}

/**
 * The cells an axis holds, mirroring the engine's own snapping.
 *
 * The engine does not use the requested step directly: it divides the
 * span into the nearest whole number of bands and uses that width. A
 * server that guessed the row positions instead of reproducing this
 * would cut between rows that are not where it thinks they are.
 *
 * Null where the axis cannot be split safely — see `latShards`.
 */
function axisOf(
  lo: number | undefined,
  hi: number | undefined,
  step: number,
  edge: number,
  span: number,
): Axis | null {
  const bands = Math.round(span / step);
  if (bands < 2) return null;
  const width = span / bands;

  if (lo === undefined || hi === undefined) {
    // A whole-world run takes a different code path in the engine, and
    // the two agree only where the step divides the span evenly. At a
    // step of 7 degrees the world grid puts its 26 points 6.92 degrees
    // apart, which is not this lattice, and strips cut on this lattice
    // would not reproduce it.
    if (Math.abs(span / step - bands) > 1e-9) return null;
    return { bands, width, first: 0, last: bands - 1 };
  }

  const index = (deg: number) => (deg - edge) / width - 0.5;
  const first = Math.max(0, Math.ceil(index(lo)));
  const last = Math.min(bands - 1, Math.floor(index(hi)));
  if (last < first) return null;
  return { bands, width, first, last };
}

/** Where the middle of cell `i` sits, in degrees. */
const centre = (axis: Axis, edge: number, i: number) =>
  edge + (i + 0.5) * axis.width;

/**
 * An edge that asks for cells `first` through `last` and no others.
 *
 * Inset a quarter of a cell inside the two centres rather than placed on
 * them. The engine rounds an edge up to the next cell and the far edge
 * down to the previous one, so an edge sitting exactly on a centre is
 * decided by the last bit of a division — a hair high and the row is
 * dropped, a hair low and it is kept. A quarter cell is far enough from
 * both neighbours that no rounding reaches them, and the answer is the
 * same rows every time.
 */
const edgesFor = (axis: Axis, edge: number, first: number, last: number) => ({
  lo: centre(axis, edge, first) - axis.width / 4,
  hi: centre(axis, edge, last) + axis.width / 4,
});

/** How many points a request covers, for the size test. */
export function pointCount(
  bounds: AreaBounds | undefined,
  latStep: number,
  lonStep: number,
): number {
  const lat = axisOf(bounds?.latMin, bounds?.latMax, latStep, -90, 180);
  const lon = axisOf(bounds?.lonMin, bounds?.lonMax, lonStep, -180, 360);
  if (lat === null || lon === null) return 0;
  return (lat.last - lat.first + 1) * (lon.last - lon.first + 1);
}

/**
 * The grid cut into `shards` strips of whole rows, or null to run it
 * whole.
 *
 * Null rather than one strip when it should not be split, so a caller
 * cannot accidentally send a rewritten request in the case where the
 * rewrite would not reproduce the original grid.
 */
export function latShards(
  bounds: AreaBounds | undefined,
  latStep: number,
  lonStep: number,
  shards: number,
  /**
   * How many points make a grid worth splitting.
   *
   * The default counts one hour at each place, which is what an area run
   * has always been. A whole-day run is about fifteen times that at the
   * same places — see `dailyMedian` in the engine — so a lattice of
   * 1,728 places is more work than a one-hour grid of 25,000, and the
   * default would refuse to split it.
   *
   * A caller splitting for a reason other than speed passes a lower
   * number. Work that fills the map in behind the reader is cut small on
   * purpose: the engine takes one request at a time and cannot be
   * interrupted, so the size of a piece is the longest anyone can be
   * held up by it.
   */
  minimum: number = MIN_SHARD_POINTS,
): AreaBounds[] | null {
  if (shards < 2) return null;
  const lat = axisOf(bounds?.latMin, bounds?.latMax, latStep, -90, 180);
  const lon = axisOf(bounds?.lonMin, bounds?.lonMax, lonStep, -180, 360);
  if (lat === null || lon === null) return null;

  const rows = lat.last - lat.first + 1;
  const columns = lon.last - lon.first + 1;
  if (rows * columns < minimum) return null;
  // A strip needs two rows, because a one-row rectangle is a division by
  // zero in the engine rather than a thin answer.
  const strips = Math.min(shards, Math.floor(rows / 2));
  if (strips < 2) return null;

  const { lo: lonMin, hi: lonMax } = edgesFor(lon, -180, lon.first, lon.last);

  // Rows spread as evenly as the count allows: the first `rows % strips`
  // strips take one extra row each.
  const sizes = Array.from(
    { length: strips },
    (_, i) => Math.floor(rows / strips) + (i < rows % strips ? 1 : 0),
  );

  return sizes.reduce<{ next: number; out: AreaBounds[]; }>(
    ({ next, out }, size) => {
      const { lo: latMin, hi: latMax } = edgesFor(
        lat,
        -90,
        next,
        next + size - 1,
      );
      return {
        next: next + size,
        out: [...out, { latMin, latMax, lonMin, lonMax }],
      };
    },
    { next: lat.first, out: [] },
  ).out;
}
