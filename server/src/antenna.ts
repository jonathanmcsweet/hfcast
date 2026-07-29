/**
 * Antenna definition files, written for the station the operator describes.
 *
 * VOACAP names an antenna by a path under `<itshfbc>/antennas`, so an
 * antenna the app can vary has to exist as a file. The distributed tree
 * has samples with the right shapes but fixed parameters, and the one
 * parameter that decides most amateur answers is height: at 14 MHz a
 * dipole one wavelength up beats the same dipole a quarter wave up by
 * about 9 dB at the low angles a long path needs. So the files are
 * generated from the operator's numbers rather than chosen from a list.
 *
 * Each file is named from a digest of its own contents, which makes
 * writing it idempotent: two requests for the same antenna agree on the
 * name, so concurrent runs cannot half-write one another's file, and a
 * name that already exists needs no work.
 *
 * Lengths and heights are metres, or wavelengths when negative
 * (`hfcast-engine/src/voacap/ioncap.rs`). Element length is given as -0.5
 * throughout: a half wave at whatever frequency is being predicted, which
 * models the resonant antenna an operator actually has on each band
 * rather than one piece of wire mistuned everywhere but one.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Antenna families offered, by VOACAP type number. */
export const ANTENNA_ORDER = [
  'isotropic',
  'dipole',
  'vertical',
  'yagi',
  'invertedL',
] as const;

export type AntennaKey = (typeof ANTENNA_ORDER)[number];

export interface AntennaChoice {
  type: AntennaKey;
  /**
   * Height above ground, metres. The feed point for a dipole or yagi, the
   * element height for a vertical, the horizontal section for an
   * inverted L.
   */
  heightM: number;
  /**
   * Gain over a half-wave dipole, dB. Only the yagi reads it; VOACAP
   * takes a directional array's gain as a number rather than deriving it
   * from a boom and a count of elements.
   */
  gainDbd: number;
  /**
   * Where the main beam points, degrees true. Only the yagi reads it.
   * The caller resolves "at the other station" into a bearing before
   * getting here.
   */
  beamDeg: number;
}

export const DEFAULT_ANTENNA: AntennaChoice = {
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

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export function normaliseAntenna(
  antenna: Partial<AntennaChoice> & { type: AntennaKey; },
): AntennaChoice {
  return {
    type: antenna.type,
    heightM: clamp(
      antenna.heightM ?? DEFAULT_ANTENNA.heightM,
      MIN_HEIGHT_M,
      MAX_HEIGHT_M,
    ),
    gainDbd: clamp(
      antenna.gainDbd ?? DEFAULT_ANTENNA.gainDbd,
      MIN_GAIN_DBD,
      MAX_GAIN_DBD,
    ),
    beamDeg: ((antenna.beamDeg ?? 0) % 360 + 360) % 360,
  };
}

/** The card's fields are fixed width, so every number is right-aligned. */
const field = (value: string, width: number) => value.padStart(width);
const decimals = (value: number, places: number, width: number) =>
  field(value.toFixed(places), width);

/**
 * Ground under the antenna: relative permittivity and conductivity in
 * mhos per metre.
 *
 * The distributed samples all use 4 and 0.001, which is average ground,
 * and the app does not ask an operator to survey their garden. Holding
 * them fixed also keeps the comparison between two antennas about the
 * antennas.
 */
const DIELECTRIC = 4;
const CONDUCTIVITY = 0.001;

/**
 * The frequency the file's own parameters are quoted against. Only
 * parameters given in wavelengths read it, and the height here is in
 * metres, so it changes nothing; it is written because the format has
 * the slot.
 */
const DESIGN_MHZ = 10;

/**
 * One numbered parameter line. The reader takes the value from the fixed
 * columns at the front; the bracketed number and the name after it are
 * for a human opening the file.
 */
const param = (value: string, index: number, name: string) =>
  `${value}  [${field(String(index), 2)}] ${name}`;

/**
 * The parameters after the five every family shares.
 *
 * Read carefully rather than copied between families: for the monopole
 * parameter 6 is its height and parameter 7 is a gain, where the dipole
 * has length then height. Reading one across from the other would give a
 * vertical whose height was whatever gain figure happened to be set.
 */
function tail(antenna: AntennaChoice): readonly string[] {
  const height = decimals(antenna.heightM, 2, 6);
  switch (antenna.type) {
    case 'dipole':
      return [
        param('  -.50', 6, 'Antenna Length:'),
        param(height, 7, 'Antenna Height:'),
        param('   0.0', 8, 'Gain ab dipole:'),
      ];
    case 'yagi':
      return [
        param('  -.50', 6, 'Antenna Length:'),
        param(height, 7, 'Antenna Height:'),
        param(decimals(antenna.gainDbd, 1, 6), 8, 'Gain ab dipole:'),
      ];
    case 'vertical':
      return [
        param(height, 6, 'Antenna Height:'),
        param('   0.0', 7, 'Gain ab dipole:'),
      ];
    case 'invertedL':
      // Its two parameters are the horizontal run and the vertical drop.
      // An amateur inverted L is usually about a quarter wave of wire in
      // total, so the run is taken as equal to the height rather than
      // asked for separately.
      return [
        param(height, 6, 'Antenna Length:'),
        param(height, 7, 'Antenna Height:'),
      ];
    case 'isotropic':
      return [];
  }
}

const TITLES: Record<AntennaKey, string> = {
  isotropic: 'isotrope',
  dipole: 'dipole',
  vertical: 'vertical',
  yagi: 'yagi',
  invertedL: 'inverted L',
};

function definition(antenna: AntennaChoice): string {
  // Never written for an isotropic station: it names no file at all,
  // which is what the engine already defaults to.
  if (antenna.type === 'isotropic') return '';

  const params = [
    param('  0.00', 1, 'Max Gain dBi..:'),
    param(field(String(TYPE[antenna.type]), 6), 2, 'Antenna Type..:'),
    param(field(String(DIELECTRIC), 6), 3, 'Dielectric....:'),
    param(decimals(CONDUCTIVITY, 5, 6), 4, 'Conductivity..:'),
    param(decimals(DESIGN_MHZ, 3, 6), 5, 'Operating Freq:'),
    ...tail(antenna),
  ];

  // The count on the second line is what the reader trusts: it stops
  // there, so a wrong one drops the parameters after it, the height
  // among them.
  return [
    `HFcast ${TITLES[antenna.type]} ${antenna.heightM} m`,
    `${field(String(params.length), 2)}    ${params.length} parameters`,
    ...params,
    '',
  ].join('\n');
}

const TYPE: Record<AntennaKey, number> = {
  isotropic: 0,
  vertical: 22,
  dipole: 23,
  yagi: 24,
  invertedL: 28,
};

/**
 * Where generated files go, under the tree the engine reads. The card
 * holds 21 columns, so the directory name and the digest below have to
 * fit inside that together with the extension.
 */
export const GENERATED_DIR = 'hfcast';

/**
 * Writes the definition for this antenna and returns the path to name on
 * the card, or null for an isotropic station, which names no file.
 */
export async function antennaFile(
  itshfbc: string,
  antenna: AntennaChoice,
): Promise<string | null> {
  if (antenna.type === 'isotropic') return null;
  const text = definition(antenna);
  // Nine hex characters, because the whole path has to fit the card's 21
  // columns: seven for the directory, one for the prefix, four for the
  // extension. The engine refuses a longer one rather than truncating it.
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 9);
  const name = `${GENERATED_DIR}/a${digest}.voa`;
  const full = path.join(itshfbc, 'antennas', name);
  await mkdir(path.dirname(full), { recursive: true });
  // Written every time rather than only when absent. The name is the
  // digest of the contents, so a write can only ever replace a file with
  // the same bytes, and checking first would cost a stat to save nothing.
  await writeFile(full, text);
  return name;
}

/**
 * Families whose gain depends on which way they face.
 *
 * Measured against the engine on 2026-07-29, Seattle to Tokyo at 14 MHz:
 * a dipole swings 12 dB over the compass and its reliability runs from
 * 7% to 71%; an inverted L swings 12 dB; a vertical monopole swings 0.
 * Pinning a dipole's bearing at zero, as an earlier version did, reports
 * the null off the ends of the wire as though it were the answer.
 */
const DIRECTIONAL: readonly AntennaKey[] = ['dipole', 'invertedL', 'yagi'];

/** What the engine's JSON takes for one end. */
export interface AntennaCard {
  file: string;
  beamDeg: number;
}

/**
 * The card for the operator's own end, or null when they are isotropic.
 *
 * Only the transmitting end is described. The other end belongs to a
 * station this app knows nothing about, and inventing an antenna for
 * them would move every number without being any more true than the
 * isotrope.
 */
export async function txCard(
  itshfbc: string,
  antenna: AntennaChoice,
): Promise<AntennaCard | null> {
  const file = await antennaFile(itshfbc, antenna);
  if (file === null) return null;
  return {
    file,
    // Every family whose pattern depends on azimuth carries its bearing.
    // The vertical monopole does not: measured on a 14 MHz path it moves
    // by 0 dB over the whole compass, so a bearing there would be a
    // number the model never reads.
    beamDeg: DIRECTIONAL.includes(antenna.type) ? antenna.beamDeg : 0,
  };
}

export function isAntennaKey(value: string): value is AntennaKey {
  return (ANTENNA_ORDER as readonly string[]).includes(value);
}
