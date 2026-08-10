/**
 * The whole-world fine grid, packed into typed arrays.
 *
 * The engine and the server both answer with one object per point. At
 * 34,560 points that is tens of megabytes of JavaScript heap for a
 * single hour, and the map holds more than one hour as a user moves the
 * slider. Packing them into two `Float32Array`s brings it to about
 * 280 KB, which is what makes holding a whole-world answer reasonable.
 *
 * The packing is only sound because the lattice is regular and the
 * engine's order is guaranteed — rows south to north, points within a
 * row west to east. That is a property of `HFAREA`, not an assumption
 * made here, and `fineGlobe.test.ts` checks it against real engine
 * output rather than trusting it.
 *
 * This runs in the query function, so the objects the wire carried are
 * released as soon as the arrays are built and never reach a cache.
 */
import type { BandKey, Coverage, CoveragePoint, FineGlobe } from './types.ts';

/**
 * How far apart two coordinates may be and still count as the same.
 *
 * The grid arrives as decimal degrees that have been through JSON, so
 * exact equality is the wrong test. A thousandth of a degree is about
 * 100 m, far below any step this grid uses and far above the error.
 */
const SAME_DEGREE = 1e-3;

/**
 * The step of the whole-world fine grid, and how many points that is.
 *
 * From the lattice module, not written out again. It is the same step
 * the viewport patch uses, so a reader zooming in sees magnification
 * rather than a changed answer — and the three copies of the pair that
 * used to exist were held together only by comments saying so.
 */
export { FINE_LAT_STEP, FINE_LON_STEP, FINE_POINTS } from './coveragePatch.ts';

/**
 * Pack a whole-world answer into columns.
 *
 * Throws rather than guessing when the points are not the lattice this
 * expects. A grid packed from a wrong row width would draw a map that
 * looks ordinary and is wrong everywhere — every cell displaced by a
 * growing offset — so it must fail where it can be seen, not silently.
 */
export function packGlobe(
  band: BandKey,
  hour: number,
  answer: Coverage,
): FineGlobe {
  const points = answer.points;
  if (points.length === 0) {
    throw new Error('the fine grid came back with no points');
  }

  const first = points[0] as CoveragePoint;

  // The row width is where the latitude first changes. Counting it
  // rather than dividing by an assumed step means a grid the engine
  // snapped differently is still read correctly.
  const nx = points.findIndex(
    (point) => Math.abs(point.lat - first.lat) > SAME_DEGREE,
  );
  if (nx <= 0 || points.length % nx !== 0) {
    throw new Error(
      `the fine grid is not rectangular: ${points.length} points, first row ${nx}`,
    );
  }
  const ny = points.length / nx;

  const reliability = new Float32Array(points.length);
  const takeoffAngleDeg = new Float32Array(points.length);

  // A loop, not a map: it fills two typed arrays in one pass over tens
  // of thousands of points, and the functional form would build an
  // intermediate array of exactly the objects this exists to avoid.
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i] as CoveragePoint;
    reliability[i] = point.reliability;
    takeoffAngleDeg[i] = point.takeoffAngleDeg ?? Number.NaN;
  }

  const second = points[1] as CoveragePoint;
  const nextRow = points[nx] as CoveragePoint;

  return {
    band,
    hour,
    latMin: first.lat,
    lonMin: first.lon,
    // The steps the points actually have, rather than the steps asked
    // for: the engine snaps its grid, and the cells have to be drawn
    // where it put them.
    latStep: nextRow.lat - first.lat,
    lonStep: second.lon - first.lon,
    nx,
    ny,
    reliability,
    takeoffAngleDeg,
  };
}

/** What the grid costs in memory, for the record and for tests. */
export const globeBytes = (grid: FineGlobe): number =>
  grid.reliability.byteLength + grid.takeoffAngleDeg.byteLength;
