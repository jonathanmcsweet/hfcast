import type { AntennaKey } from '../store/useStationStore';

/**
 * Which way an antenna faces, and what that costs on a given path.
 *
 * Measured against the engine on 2026-07-29, Seattle to Tokyo at 14 MHz:
 * turning a dipole through the compass moves the signal by 12 dB and the
 * reliability from 7% to 71%. A vertical moves by nothing at all. So this
 * is not a refinement — for three of the five families it decides the
 * answer, and for one of them there is no question to ask.
 *
 * VOACAP takes a single "main beam" bearing. What an operator can
 * actually tell you differs by antenna, so the question differs too, and
 * the conversion happens here rather than in their head.
 */

/** Families whose gain depends on where they point. */
export const usesOrientation = (type: AntennaKey) =>
  type === 'dipole' || type === 'invertedL' || type === 'yagi';

/**
 * Families described by the run of their wire rather than by where they
 * point.
 *
 * Only the dipole. Somebody with a wire in a tree knows it runs
 * north-east to south-west; they do not know, and should not have to
 * work out, that this means it favours north-west and south-east. A
 * dipole radiates broadside, so the conversion is exact.
 *
 * The inverted L is not here even though it is also a wire: its pattern
 * is not a simple broadside one, so asking for the wire and adding a
 * right angle would be inventing physics. It is asked the same way as a
 * beam.
 */
export const askedAsWire = (type: AntennaKey) => type === 'dipole';

/**
 * Families that favour two opposite directions equally.
 *
 * Taken from the engine's own behaviour rather than from theory: swept
 * through 360 degrees, both the dipole and the inverted L repeat exactly
 * every 180. This is the thing newcomers are most often surprised by, so
 * it is said rather than assumed.
 */
export const isBidirectional = (type: AntennaKey) =>
  type === 'dipole' || type === 'invertedL';

const wrap = (deg: number) => ((deg % 360) + 360) % 360;

/** The main beam bearing for a wire running along `wireDeg`. */
export const beamFromWire = (wireDeg: number) => wrap(wireDeg + 90);

/** The run of the wire for a main beam along `beamDeg`. */
export const wireFromBeam = (beamDeg: number) => wrap(beamDeg - 90);

/** Every direction this antenna favours, in ascending order. */
export function lobes(beamDeg: number, type: AntennaKey): number[] {
  const main = wrap(beamDeg);
  return isBidirectional(type)
    ? [main, wrap(main + 180)].sort((a, b) => a - b)
    : [main];
}

/** The smaller of the two ways round the compass, 0 to 180. */
function separation(a: number, b: number): number {
  const raw = Math.abs(wrap(a) - wrap(b));
  return raw > 180 ? 360 - raw : raw;
}

/**
 * How far off its best direction the path falls, in degrees.
 *
 * The nearest lobe counts, so a bidirectional antenna is never described
 * as pointing the wrong way when its other lobe covers the path.
 */
export function offAxis(
  beamDeg: number,
  type: AntennaKey,
  pathDeg: number,
): number {
  return Math.min(
    ...lobes(beamDeg, type).map((lobe) => separation(lobe, pathDeg)),
  );
}

/**
 * How the offset reads in words.
 *
 * Bands rather than a predicted loss. The app has no copy of the antenna
 * pattern and should not grow one — a second model could disagree with
 * the engine, and the grid below already shows what the engine actually
 * says. Geometry is all this claims.
 *
 * The boundaries are where a dipole's own measured curve turns: within
 * about 30 degrees of a lobe it is near its best, and past about 60 it
 * is falling into the null off the ends of the wire.
 */
export type Alignment = 'best' | 'offToOneSide' | 'nearNull';

export function alignment(offsetDeg: number): Alignment {
  if (offsetDeg <= 30) return 'best';
  if (offsetDeg <= 60) return 'offToOneSide';
  return 'nearNull';
}
