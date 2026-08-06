/**
 * The antenna families offered, and the rules that follow from the family.
 *
 * Only what both projects need: which families exist, which of their
 * numbers mean anything, and the one approximation VOACAP does not
 * provide. Writing the definition file is the server's business, and
 * writing it into a scratch directory the system may empty is the app's,
 * so neither is here.
 *
 * One list for both. It was two, and they had drifted: this one ended
 * `invertedL, yagi` and the server's ended `yagi, invertedL`, while both
 * comments said the order was the picker's. Nothing pinned it, because
 * the source-text comparison that pinned the other constants did not name
 * this file.
 */

/** Antenna families offered, in the order the picker lists them. */
export const ANTENNA_ORDER = [
  'isotropic',
  'dipole',
  'invertedV',
  'vertical',
  'invertedL',
  'yagi',
] as const;

export type AntennaKey = (typeof ANTENNA_ORDER)[number];

export const isAntennaKey = (value: string): value is AntennaKey =>
  (ANTENNA_ORDER as readonly string[]).includes(value);

/** What an antenna is, apart from where its definition file lives. */
export interface Antenna {
  type: AntennaKey;
  /**
   * Height above ground, metres. The feed point of a dipole or yagi, the
   * element height of a vertical, the horizontal section of an inverted L,
   * and the apex — the highest point, where the feed is — of an inverted V.
   *
   * Always metres, whatever the reader is shown: the server takes metres,
   * and a preset saved in feet would become wrong the moment somebody
   * switched units.
   */
  heightM: number;
  /** Gain over a half-wave dipole, dB. Only the yagi uses it. */
  gainDbd: number;
  /** Where the beam points, degrees true. Only the yagi uses it. */
  beamDeg: number;
}

export const DEFAULT_ANTENNA: Antenna = {
  type: 'isotropic',
  heightM: 10,
  gainDbd: 6,
  beamDeg: 0,
};

/** Heights outside this are not a station, they are a typing mistake. */
export const MIN_HEIGHT_M = 1;
export const MAX_HEIGHT_M = 100;
/** A yagi below this is a dipole; above it is not an amateur antenna. */
export const MIN_GAIN_DBD = 0;
export const MAX_GAIN_DBD = 20;

/** Only a beam has a gain figure to state. */
export const usesGain = (type: AntennaKey) => type === 'yagi';

/** Everything but the isotrope sits at a height that changes the answer. */
export const usesHeight = (type: AntennaKey) => type !== 'isotropic';

/**
 * Which families have a direction at all.
 *
 * Measured against the engine rather than assumed: swept through the
 * compass on a 14 MHz path, a dipole moves 12 dB and an inverted L 12 dB,
 * and a vertical monopole moves by nothing. Sending a bearing for the
 * vertical would put it in the cache key and refetch answers that cannot
 * differ.
 */
export const usesBeam = (type: AntennaKey) =>
  type === 'dipole' || type === 'invertedV' || type === 'invertedL'
  || type === 'yagi';

/**
 * What fraction of its apex height an inverted V behaves like.
 *
 * VOACAP has no inverted V. IONCAP's ten patterns are the rhombics, the
 * monopole, the dipole, the Yagi, the log periodic, the curtain, the
 * sloping vee and the inverted L, and no later family adds one, so there
 * is nothing to select and nothing to fit.
 *
 * What there is instead is the reason the shape matters at all. A
 * horizontal antenna's gain straight up is set by its height in
 * wavelengths, through the ground reflection: at a quarter wave up it is
 * near its maximum overhead, and by a half wave the overhead lobe has
 * split. An inverted V is a dipole whose ends are pulled down, so its
 * current is spread between the apex and the lower legs and it behaves
 * like a horizontal dipole somewhere below the apex. Four fifths is the
 * usual figure for the shallow droop an amateur actually builds — legs at
 * roughly 30 to 45 degrees below horizontal — and it is a stated
 * approximation rather than a measurement.
 *
 * Two of these would give one station two forecasts depending on which
 * path answered, and the help text names the percentage, so one side
 * would also be explaining the other side's arithmetic.
 */
export const INVERTED_V_HEIGHT_FRACTION = 0.8;

/**
 * The height the engine is given, which is not always the height asked
 * for. Only the inverted V differs — see the constant above.
 */
export function effectiveHeightM(antenna: Antenna): number {
  return antenna.type === 'invertedV'
    ? antenna.heightM * INVERTED_V_HEIGHT_FRACTION
    : antenna.heightM;
}

/**
 * What an amateur station may transmit at, watts.
 *
 * A tenth of a watt is where VOACAP stops tracking power: below that the
 * deck's kilowatt field rounds away, and at a hundredth of a watt it
 * returns a better answer than a hundred watts. QRP work happens at and
 * below one watt, so the range reaches there and stops where the model
 * does. 1500 W is the legal ceiling in the countries this is built for.
 *
 * One pair of numbers because the app's control and the server's clamp
 * have to be the same range. They were not: the app offered 1500 and the
 * server accepted 10,000, while the app's comment said it repeated what
 * the server clamps to.
 */
export const MIN_WATTS = 0.1;
export const MAX_WATTS = 1500;
