/**
 * Builds a VOACAP input deck.
 *
 * The format is punched-card fixed width: a 10-character keyword field followed
 * by 5-character numeric fields, with no separators. Values that fill their
 * field run straight into the next one, which is legal and expected. Column
 * positions are therefore the contract — never join these with spaces.
 */
import {
  BANDS_BY_FREQ,
  BAND_MHZ,
  type BandKey,
} from '../types.ts';

/** Number of frequency slots on a FREQUENCY card. */
export const FREQ_SLOTS = 11;

export interface DeckOptions {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  fromLabel: string;
  toLabel: string;
  /** 1-12. */
  month: number;
  year: number;
  ssn: number;
  /** Transmit power in watts. */
  watts: number;
  /** Signal-to-noise ratio the mode needs, in dB. 24 suits SSB and CW. */
  requiredSnrDb: number;
  /** Man-made noise at 3 MHz, as a positive number of dBW below zero. */
  noiseDbw: number;
  bands?: readonly BandKey[];
}

/** Right-justify a number in a fixed-width field, Fortran style. */
function field(value: string, width: number): string {
  if (value.length > width) {
    throw new Error(`value "${value}" overflows a ${width}-column field`);
  }
  return value.padStart(width);
}

/** Left-justify text in a fixed-width field. */
function text(value: string, width: number): string {
  return value.length > width ? value.slice(0, width) : value.padEnd(width);
}

/** "35.80N" — 5 columns of number then the hemisphere. */
function latCompact(lat: number): string {
  return `${field(Math.abs(lat).toFixed(2), 5)}${lat >= 0 ? 'N' : 'S'}`;
}

/** "   122.33W" — 9 columns of number then the hemisphere. */
function lonWide(lon: number): string {
  return `${field(Math.abs(lon).toFixed(2), 9)}${lon >= 0 ? 'E' : 'W'}`;
}

function latWide(lat: number): string {
  return `${field(Math.abs(lat).toFixed(2), 9)}${lat >= 0 ? 'N' : 'S'}`;
}

/** An antenna file path, padded to the 21 columns inside the brackets. */
function antennaRef(path: string): string {
  return `[${text(path, 21)}]`;
}

/**
 * Isotropic at both ends. This understates what a real station with a beam can
 * do, but it is the only assumption that is honest without asking the user
 * about their antennas, and it keeps the numbers comparable between paths.
 */
const ANTENNA_FILE = 'default/isotrope';

export function buildDeck(options: DeckOptions): string {
  const bands = options.bands ?? BANDS_BY_FREQ;
  if (bands.length > FREQ_SLOTS) {
    throw new Error(`at most ${FREQ_SLOTS} bands fit on a FREQUENCY card`);
  }
  if (options.month < 1 || options.month > 12) {
    throw new Error(`month out of range: ${options.month}`);
  }

  const freqs = bands.map((b) => BAND_MHZ[b]);
  const padded = [
    ...freqs,
    ...Array<number>(FREQ_SLOTS - freqs.length).fill(0),
  ];
  const freqCard = padded.map((f) => field(f.toFixed(2), 5)).join('');

  // VOACAP takes transmit power in kilowatts.
  const kw = options.watts / 1000;

  const lines = [
    'LINEMAX      55       number of lines-per-page',
    'COEFFS    CCIR',
    // All 24 hours, stepping by one, in UTC.
    `TIME      ${field('1', 5)}${field('24', 5)}${field('1', 5)}${field('1', 5)}`,
    `MONTH     ${field(String(options.year), 5)}${field(options.month.toFixed(2), 5)}`,
    `SUNSPOT   ${field(`${Math.round(options.ssn)}.`, 5)}`,
    `LABEL     ${text(options.fromLabel, 20)}${text(options.toLabel, 20)}`,
    `CIRCUIT   ${latCompact(options.fromLat)}${lonWide(options.fromLon)}` +
      `${latWide(options.toLat)}${lonWide(options.toLon)}  S     0`,
    `SYSTEM    ${field('1.', 5)}${field(`${options.noiseDbw}.`, 5)}` +
      `${field('0.10', 5)}${field('90.', 5)}` +
      `${field(options.requiredSnrDb.toFixed(1), 5)}${field('3.00', 5)}${field('0.10', 5)}`,
    'FPROB      1.00 1.00 1.00 0.00',
    `ANTENNA   ${field('1', 5)}${field('1', 5)}${field('2', 5)}${field('30', 5)}` +
      `${field('0.000', 10)}${antennaRef(ANTENNA_FILE)}${field('0.0', 5)}${field(kw.toFixed(4), 10)}`,
    `ANTENNA   ${field('2', 5)}${field('2', 5)}${field('2', 5)}${field('30', 5)}` +
      `${field('0.000', 10)}${antennaRef(ANTENNA_FILE)}${field('0.0', 5)}${field('0.0000', 10)}`,
    `FREQUENCY ${freqCard}`,
    `METHOD    ${field('30', 5)}${field('0', 5)}`,
    'EXECUTE',
    'QUIT',
  ];

  return `${lines.join('\n')}\n`;
}
