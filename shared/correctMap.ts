/**
 * The same correction the band table gets, applied to a coverage map.
 *
 * `correct.ts` explains why the correction exists and where its numbers
 * come from. This file is about applying it somewhere the band table's
 * shape does not fit.
 *
 * The correction shrinks an hour toward the middle of that place's own
 * day:
 *
 *   corrected = middle + swing * (this hour - middle)
 *
 * For one path that is easy: the band table already holds all 24 hours,
 * so the middle is a value it can take for itself. A map cannot. A map
 * is 34,560 places at one hour, and finding the middle of the day at
 * every one of them would be 24 times the work of drawing the map — long
 * enough that nobody would wait for it.
 *
 * What makes it affordable is that the two things the correction needs
 * pull in opposite directions. The detail has to be fine, but it is only
 * ever one hour: the hour on the screen. The middle of the day needs all
 * 24 hours, but it moves slowly across the map, so it does not need fine
 * detail. So the map runs at full detail for one hour, a much coarser
 * lattice runs the whole day, and every map cell takes its middle from
 * the four lattice points around it.
 *
 * Measured against the middle computed properly at every point, on a
 * 5 by 7.5 degree lattice: the middle is out by 1.1 dB in the typical
 * case, and 6.7% of cells land in a different colour band. Against
 * leaving the map uncorrected, which is what it did before: 21% of cells
 * were in the wrong band, all of them too optimistic, and 8% of the map
 * was painted "at least patchy" where the honest answer was closed.
 */
import type { CorrectionFactors } from './correct.ts';
import { phi } from './correct.ts';
import type { CoveragePoint } from './points.ts';

/** A decile is this many standard deviations of a normal distribution. */
const DECILE_TO_SIGMA = 1.2816;

/**
 * The lattice the first correction is computed on: the coarse map's own.
 *
 * Every band, in one whole-day run, which is 192 places rather than
 * 34,560. It lands in a fraction of a second, so the coarse map — which
 * is what a reader sees first — is corrected almost as soon as it is
 * drawn, and every band's reach percentage is corrected with it.
 *
 * Measured against the middle computed properly at every point: out by
 * 2.4 dB typically, and 15% of cells land in a different colour band.
 * That is worse than the finer lattice below and much better than no
 * correction at all, whose errors all point the same way — 21% of cells
 * wrong and every one of them too optimistic.
 */
export const CENTRE_LAT_STEP = 15;
export const CENTRE_LON_STEP = 22.5;

/**
 * The lattice the whole-world fine grid waits for.
 *
 * 1,728 places against the coarse lattice's 192, for one band rather
 * than all nine. Out by 1.1 dB typically, with 6.7% of cells landing in
 * a different colour band.
 *
 * The fine grid is only ever computed against this one, never against
 * the coarse lattice. A grid built on the coarse middle and rebuilt on
 * this one would cost a second 34,560-point run to change a colour here
 * and there, which is the most expensive thing this application does and
 * the least worth spending twice.
 */
export const FINE_CENTRE_LAT_STEP = 5;
export const FINE_CENTRE_LON_STEP = 7.5;

/**
 * The lowest signal level worth telling apart from any other.
 *
 * Where a band is shut the engine reports numbers like -272 dB. Those
 * are not measurements of anything — they say "no signal" in a way that
 * happens to be a number — and averaging one against a neighbour that
 * has real propagation produces a middle that describes neither place.
 * A lattice point next to the edge of the skip zone would otherwise drag
 * a whole cell's middle down by a hundred decibels.
 *
 * So a lattice value below this floor is read as the floor before the
 * four corners are averaged. That cannot change a colour: the required
 * signal-to-noise ratio is at most about 30 dB, the correction keeps
 * three quarters of the middle, and three quarters of -60 dB is far
 * enough below any requirement that the cell is shut either way. What it
 * changes is that the average between "shut" and "open" is now a number
 * near the edge rather than a number a hundred decibels away from both.
 */
export const DEAD_SIGNAL_FLOOR_DB = -60;

/** One point of the lattice that carries the middle of the day. */
export interface CentrePoint {
  lat: number;
  lon: number;
  /** Median signal-to-noise ratio over the 24 hours, dB. */
  medianSnr: number;
}

/**
 * The lattice of daily middles, ready to be read at any coordinate.
 *
 * Built once per band and read once per map cell, so it holds the points
 * in a row-major array with the lattice geometry beside it rather than
 * searching a list 34,560 times.
 */
export interface CentreField {
  latMin: number;
  lonMin: number;
  latStep: number;
  lonStep: number;
  rows: number;
  columns: number;
  /** Row-major, south to north then west to east, already floored. */
  values: Float32Array;
}

/**
 * Arranges an area run's daily middles for reading.
 *
 * The engine emits points south to north and west to east, which is the
 * order this indexes them in. The geometry is taken from the points
 * themselves rather than from what was asked for, because the engine
 * snaps a request to its own lattice and the answer is the truth about
 * where the values are.
 *
 * Returns null where there are too few points to interpolate between,
 * which a caller reads as "no correction available yet" rather than as
 * an error.
 */
export function centreField(
  points: readonly CentrePoint[],
  latStep: number,
  lonStep: number,
): CentreField | null {
  if (points.length < 4 || latStep <= 0 || lonStep <= 0) return null;

  const lats = [...new Set(points.map((p) => p.lat))].sort((a, b) => a - b);
  const lons = [...new Set(points.map((p) => p.lon))].sort((a, b) => a - b);
  if (lats.length < 2 || lons.length < 2) return null;
  if (lats.length * lons.length !== points.length) return null;

  const latMin = lats[0] as number;
  const lonMin = lons[0] as number;
  const values = new Float32Array(points.length);
  // A loop rather than `Float32Array.from(points.map(...))`, because
  // each point is placed by its own coordinates rather than by its
  // position in the list. The engine does emit them in order, and
  // trusting that would let this build the array straight from the map —
  // but then a change to the emission order would silently draw the
  // whole correction in the wrong places, which is exactly the kind of
  // fault nothing on screen would reveal.
  for (const p of points) {
    const row = Math.round((p.lat - latMin) / latStep);
    const column = Math.round((p.lon - lonMin) / lonStep);
    values[row * lons.length + column] = Math.max(
      DEAD_SIGNAL_FLOOR_DB,
      p.medianSnr,
    );
  }
  return {
    latMin,
    lonMin,
    latStep,
    lonStep,
    rows: lats.length,
    columns: lons.length,
    values,
  };
}

/** A value held inside the lattice, so an edge cell reads its edge. */
const clamp = (v: number, low: number, high: number) =>
  Math.min(high, Math.max(low, v));

/**
 * The middle of the day at any coordinate, between the four lattice
 * points around it.
 *
 * Longitude wraps: a cell at 179 degrees east sits between the last
 * column and the first one, and reading it as an edge instead would
 * leave a seam down the antimeridian that no reader could explain.
 * Latitude does not wrap — the poles are ends, not joins — so a cell
 * beyond the outermost row reads that row.
 */
export function centreAt(
  field: CentreField,
  lat: number,
  lon: number,
): number {
  const { rows, columns, values } = field;
  const y = clamp((lat - field.latMin) / field.latStep, 0, rows - 1);
  const row = Math.min(Math.floor(y), rows - 2);
  const dy = rows === 1 ? 0 : y - row;

  // The whole world is `columns * lonStep` wide when it is whole. Where
  // the lattice covers only part of it — a patch — the wrap never
  // triggers, because the coordinate stays inside.
  const span = columns * field.lonStep;
  const wrapped = span >= 359.9;
  const x = (lon - field.lonMin) / field.lonStep;
  const column = wrapped
    ? Math.floor(((x % columns) + columns) % columns)
    : Math.min(Math.floor(clamp(x, 0, columns - 1)), Math.max(0, columns - 2));
  const dx = x - Math.floor(x);
  const nextColumn = wrapped ? (column + 1) % columns : column + 1;

  const at = (r: number, c: number) => values[r * columns + c] as number;
  const lower = at(row, column) * (1 - dx) + at(row, nextColumn) * dx;
  const upper = at(row + 1, column) * (1 - dx)
    + at(row + 1, nextColumn) * dx;
  return lower * (1 - dy) + upper * dy;
}

/**
 * One map point as the engine now reports it, before correction.
 *
 * The three signal fields are optional, and absent means "there is
 * nothing here to correct". Two things arrive that way: a point from the
 * server, which corrected it already, and a point from an answer cached
 * before engine 0.68.0, which never carried them. Both pass through
 * untouched.
 */
export interface RawCoveragePoint extends CoveragePoint {
  /** Median signal-to-noise ratio at this hour, dB. */
  snr?: number | undefined;
  snrLowDecile?: number | null | undefined;
  snrUpDecile?: number | null | undefined;
}

/**
 * Corrects one map point against the middle of its own day.
 *
 * The arithmetic is `correct.ts`'s, value for value: the same swing, the
 * same spread factors, the same normal distribution over the same
 * decile-to-sigma conversion. It is written out again here rather than
 * called because the shapes differ — a band table corrects a list of
 * hours it holds all of, and a map corrects one hour against a middle
 * that came from somewhere else — and `sameCorrection` in the tests
 * holds the two to the same answer.
 *
 * A point without both deciles keeps the engine's own reliability, for
 * the reason `correctCells` keeps it: moving the median without knowing
 * the spread would be a guess, and the engine's value is at least
 * consistent with itself.
 */
export function correctPoint(
  point: RawCoveragePoint,
  centre: number,
  requiredSnrDb: number,
  factors: CorrectionFactors,
): CoveragePoint {
  const { snr: level, snrLowDecile, snrUpDecile } = point;
  if (
    level === undefined
    || snrLowDecile === undefined || snrLowDecile === null
    || snrUpDecile === undefined || snrUpDecile === null
  ) {
    return {
      lat: point.lat,
      lon: point.lon,
      reliability: point.reliability,
      takeoffAngleDeg: point.takeoffAngleDeg ?? null,
    };
  }
  const snr = centre + factors.swing * (level - centre);
  const z = snr - requiredSnrDb;
  const decile = z >= 0
    ? snrLowDecile * factors.spreadLow
    : snrUpDecile * factors.spreadUp;
  const reliability = decile <= 0
    ? (z >= 0 ? 1 : 0)
    : phi(z / (decile / DECILE_TO_SIGMA));
  return {
    lat: point.lat,
    lon: point.lon,
    reliability: clamp(reliability, 0, 1),
    // Geometry, not signal level: the correction has nothing to say
    // about it, so it passes through untouched.
    takeoffAngleDeg: point.takeoffAngleDeg ?? null,
  };
}

/**
 * Corrects a whole map against a lattice of daily middles.
 *
 * A null field returns the points unchanged rather than throwing: the
 * map is drawn before the lattice has been computed, and an uncorrected
 * map is what this application drew for its whole life until now. It
 * becomes correct when the lattice arrives.
 */
export function correctCoverage(
  points: readonly RawCoveragePoint[],
  field: CentreField | null,
  requiredSnrDb: number,
  factors: CorrectionFactors,
): CoveragePoint[] {
  if (field === null) {
    return points.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      reliability: p.reliability,
      takeoffAngleDeg: p.takeoffAngleDeg ?? null,
    }));
  }
  return points.map((p) =>
    correctPoint(p, centreAt(field, p.lat, p.lon), requiredSnrDb, factors)
  );
}
