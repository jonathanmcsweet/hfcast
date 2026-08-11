/**
 * The whole-world fine grid, as bytes that can be written to a file.
 *
 * A grid in memory is two `Float32Array`s — 34,560 points each, 276 KB
 * together. That is the right shape for drawing, and the wrong shape for
 * keeping a year of them: a person who computes every hour of every
 * month at home, so that nothing has to be computed in the field, would
 * be asking for about 700 MB. On the cheap tablets this app is for (see
 * "Who the users are" in AGENTS.md) that is not a reasonable thing to
 * ask.
 *
 * So the file form stores one byte for each value instead of four, which
 * makes the same grid 67.5 KB. Both stored values are quantities the
 * screen shows rather than quantities anything computes from again:
 *
 *   reliability       0 to 1, drawn as four colour bands
 *   take-off angle    0 to 90 degrees, compared against one threshold
 *
 * One byte holds each of them more finely than the screen can show. The
 * cost is that a grid read back is not identical to the grid computed:
 * reliability can move by up to 0.002, and a cell within that distance
 * of a colour boundary can be drawn in the neighbouring colour. That is
 * about fifty times smaller than the correction this app already applies
 * to the same number, so it does not change any answer a person acts on.
 * It does mean a stored map and a freshly computed one can differ in a
 * few cells, and this comment is where that is written down.
 *
 * The format describes itself. A file carries the lattice it was built
 * on and the band and hour it is for, so a file found on disk can be
 * checked against the name it was filed under rather than trusted. It
 * carries no date: a prediction is monthly climatology, and the month is
 * part of where the file is kept.
 *
 * Nothing here touches React Native, a file system or the engine, so it
 * runs under `node --test` — see `globeCodec.test.ts`, which puts real
 * grids through both directions.
 */
import { isBandKey } from '../../../shared/bands.ts';
import type { FineGlobe } from './types.ts';

/**
 * The first four bytes of every file: `HFG1` in ASCII.
 *
 * A file that does not start with these is not one of ours, whatever it
 * is called. Reading one as a grid would draw a map out of somebody
 * else's data rather than fail, so the check is not optional.
 */
const MAGIC = Uint8Array.of(0x48, 0x46, 0x47, 0x31);

/**
 * Bump when the layout below changes.
 *
 * A stored grid is read by builds that did not write it. The version is
 * what lets a later build reject an older file instead of reading the
 * wrong bytes out of it, and the store above treats a rejected file the
 * same way it treats a missing one: compute it again.
 */
export const FORMAT_VERSION = 1;

/**
 * The fixed part at the front, in bytes.
 *
 * Forty-eight rather than the forty-four the fields need, so the point
 * data begins on an eight-byte boundary. The four spare bytes are
 * written as zero and are where a checksum would go if one is ever
 * wanted.
 */
export const HEADER_BYTES = 48;

/** Where each header field sits. */
const AT = {
  magic: 0,
  version: 4,
  nx: 6,
  ny: 8,
  hour: 10,
  band: 12,
  latMin: 16,
  lonMin: 24,
  latStep: 32,
  lonStep: 40,
} as const;

/**
 * The byte that means "the engine gave no take-off angle here".
 *
 * The angle has to come back as `NaN` rather than as a number, because
 * `isNvis` decides on `angle >= 60` and any real number would answer
 * that question. 255 is spent on saying nothing, so the angles
 * themselves are spread over 0 to 254.
 */
const NO_ANGLE = 255;

/** The widest take-off angle the engine can report, in degrees. */
const MAX_ANGLE_DEG = 90;

/** How far apart two stored reliabilities can be. */
export const RELIABILITY_STEP = 1 / 255;

/** How far apart two stored take-off angles can be, in degrees. */
export const ANGLE_STEP_DEG = MAX_ANGLE_DEG / (NO_ANGLE - 1);

/** What one grid of this many points costs on disk, for the estimate. */
export const globeFileBytes = (points: number): number =>
  HEADER_BYTES + points * 2;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * Packs a grid into bytes.
 *
 * Throws when the grid does not describe itself consistently. A grid
 * whose arrays are not `nx * ny` long is already wrong in memory, and
 * writing it would put a file on disk that reads back as a map drawn
 * with every cell displaced.
 */
export function encodeGlobe(grid: FineGlobe): Uint8Array {
  const points = grid.nx * grid.ny;
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error(`a grid of ${grid.nx} by ${grid.ny} has no points`);
  }
  if (
    grid.reliability.length !== points
    || grid.takeoffAngleDeg.length !== points
  ) {
    throw new Error(
      `a grid of ${points} points carries `
        + `${grid.reliability.length} reliabilities and `
        + `${grid.takeoffAngleDeg.length} angles`,
    );
  }
  if (grid.nx > 0xffff || grid.ny > 0xffff) {
    throw new Error(`a grid of ${grid.nx} by ${grid.ny} is too wide to store`);
  }
  if (!Number.isInteger(grid.hour) || grid.hour < 0 || grid.hour > 23) {
    throw new Error(`${grid.hour} is not an hour of the day`);
  }
  if (grid.band.length > 4) {
    throw new Error(`the band name "${grid.band}" does not fit the header`);
  }

  const bytes = new Uint8Array(globeFileBytes(points));
  const head = new DataView(bytes.buffer);

  bytes.set(MAGIC, AT.magic);
  head.setUint16(AT.version, FORMAT_VERSION, true);
  head.setUint16(AT.nx, grid.nx, true);
  head.setUint16(AT.ny, grid.ny, true);
  bytes[AT.hour] = grid.hour;
  bytes.set(
    Uint8Array.from(grid.band.padEnd(4, ' '), (each) => each.charCodeAt(0)),
    AT.band,
  );
  head.setFloat64(AT.latMin, grid.latMin, true);
  head.setFloat64(AT.lonMin, grid.lonMin, true);
  head.setFloat64(AT.latStep, grid.latStep, true);
  head.setFloat64(AT.lonStep, grid.lonStep, true);

  // A loop rather than `map`, for the reason `packGlobe` gives: this
  // walks tens of thousands of points across typed arrays, and every
  // functional form of it builds the intermediate array that the packing
  // exists to avoid.
  const angles = HEADER_BYTES + points;
  for (let i = 0; i < points; i += 1) {
    const reliability = grid.reliability[i] as number;
    bytes[HEADER_BYTES + i] = Number.isFinite(reliability)
      ? Math.round(clamp(reliability, 0, 1) * 255)
      : 0;
    const angle = grid.takeoffAngleDeg[i] as number;
    bytes[angles + i] = Number.isFinite(angle)
      ? Math.round(
        (clamp(angle, 0, MAX_ANGLE_DEG) / MAX_ANGLE_DEG) * (NO_ANGLE - 1),
      )
      : NO_ANGLE;
  }

  return bytes;
}

/**
 * Reads bytes back into a grid.
 *
 * Throws on anything it does not recognise — a foreign file, a version
 * this build cannot read, a length that does not match the lattice in
 * the header. Every one of those means the same thing to the caller:
 * there is no stored grid here, so compute one. A half-written file is
 * caught by the length check, which is what makes an interrupted write
 * safe to leave on disk.
 */
export function decodeGlobe(bytes: Uint8Array): FineGlobe {
  if (bytes.length < HEADER_BYTES) {
    throw new Error(`${bytes.length} bytes is shorter than a grid header`);
  }
  // `every` rather than a loop: four bytes, and the question is whether
  // they all match rather than what to do with each.
  if (!MAGIC.every((byte, i) => bytes[AT.magic + i] === byte)) {
    throw new Error('these bytes are not a stored grid');
  }

  const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = head.getUint16(AT.version, true);
  if (version !== FORMAT_VERSION) {
    throw new Error(
      `a stored grid of version ${version}, and this build reads ${FORMAT_VERSION}`,
    );
  }

  const nx = head.getUint16(AT.nx, true);
  const ny = head.getUint16(AT.ny, true);
  const points = nx * ny;
  if (points <= 0) {
    throw new Error(`a stored grid of ${nx} by ${ny} has no points`);
  }
  if (bytes.length !== globeFileBytes(points)) {
    throw new Error(
      `a stored grid of ${points} points needs `
        + `${globeFileBytes(points)} bytes, and this is ${bytes.length}`,
    );
  }

  const hour = bytes[AT.hour] as number;
  if (hour > 23) {
    throw new Error(`a stored grid says hour ${hour}`);
  }

  const band = String.fromCharCode(
    ...bytes.subarray(AT.band, AT.band + 4),
  ).trimEnd();
  if (!isBandKey(band)) {
    throw new Error(`a stored grid says band "${band}"`);
  }

  const reliability = new Float32Array(points);
  const takeoffAngleDeg = new Float32Array(points);

  // A loop, for the same reason as in `encodeGlobe` above.
  const angles = HEADER_BYTES + points;
  for (let i = 0; i < points; i += 1) {
    reliability[i] = (bytes[HEADER_BYTES + i] as number) / 255;
    const stored = bytes[angles + i] as number;
    takeoffAngleDeg[i] = stored === NO_ANGLE
      ? Number.NaN
      : (stored / (NO_ANGLE - 1)) * MAX_ANGLE_DEG;
  }

  return {
    band,
    hour,
    latMin: head.getFloat64(AT.latMin, true),
    lonMin: head.getFloat64(AT.lonMin, true),
    latStep: head.getFloat64(AT.latStep, true),
    lonStep: head.getFloat64(AT.lonStep, true),
    nx,
    ny,
    reliability,
    takeoffAngleDeg,
  };
}
