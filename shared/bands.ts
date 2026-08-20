/**
 * The amateur bands this application forecasts, and their frequencies.
 *
 * One list, because the app and the server both key answers by band and a
 * band missing from one of them is a column that silently disappears.
 */

export type BandKey =
  | '160m'
  | '80m'
  | '60m'
  | '40m'
  | '30m'
  | '20m'
  | '17m'
  | '15m'
  | '12m'
  | '10m';

/** Display order: highest frequency first, as the selector lists them. */
export const BAND_ORDER: readonly BandKey[] = [
  '10m',
  '12m',
  '15m',
  '17m',
  '20m',
  '30m',
  '40m',
  '60m',
  '80m',
  '160m',
];

/**
 * The lowest frequency an antenna card claims to serve, in whole MHz.
 *
 * The engine takes the first card whose range holds the frequency, and
 * gives a frequency in no card's range **no antenna at all**. The card's
 * default is 2 MHz and 160m is 1.84, so until 2026-08-19 every 160m
 * forecast ran isotropic: dipole and isotrope matched below 2 MHz and
 * differed by 3 dB above it, on a short summer path.
 *
 * 1 rather than 1.8 because the card holds whole megahertz. Nothing else
 * moves — a card covering more frequencies serves each the same way.
 */
export const MIN_CARD_FREQ_MHZ = 1;

/** Nominal centre frequency in MHz, for the deck and the MUF comparison. */
export const BAND_MHZ: Readonly<Record<BandKey, number>> = {
  '160m': 1.84,
  '80m': 3.75,
  // The one band here that is not a contiguous allocation everywhere.
  // WRC-15 gave 5.3515-5.3665 MHz; several countries license channels
  // either side instead, the widest spread 5.332 to 5.405. 5.36 is inside
  // the WRC-15 band and within 1% of the middle of the channelised plans,
  // far below what moves a prediction.
  '60m': 5.36,
  '40m': 7.1,
  '30m': 10.12,
  '20m': 14.2,
  '17m': 18.1,
  '15m': 21.2,
  '12m': 24.94,
  '10m': 28.4,
};

/**
 * Ascending frequency order.
 *
 * The order the deck must list them in, and the order the engine requires
 * for a multi-band run: each band's antenna table is installed in a window
 * cut halfway to its neighbours, so a list that is not increasing is
 * refused.
 */
export const BANDS_BY_FREQ: readonly BandKey[] = [...BAND_ORDER].sort(
  (a, b) => BAND_MHZ[a] - BAND_MHZ[b],
);

export const isBandKey = (value: string): value is BandKey =>
  (BAND_ORDER as readonly string[]).includes(value);

/** One band at one hour, as everything downstream reads it. */
export interface BandHourPrediction {
  /** UTC hour, 0-23. */
  hour: number;
  band: BandKey;
  /** Circuit reliability, 0..1. The "chance of rain" analogue. */
  reliability: number;
  /** Median signal-to-noise ratio in dB. */
  snr: number;
  /**
   * Transmit take-off angle in degrees, or null where the engine printed
   * none.
   *
   * Steep means near-vertical incidence: the signal leaves steeply and
   * comes back down close to where it started, with no skip zone, which
   * is why a short path works on bands that look too low. The empirical
   * correction moves the signal median, not the geometry.
   */
  takeoffAngleDeg: number | null;
}

/**
 * One band at one hour as the engine reports it, before correction.
 *
 * The deciles are what the correction needs and what a cell may lack: a
 * row without them keeps the engine's own reliability rather than having
 * one guessed for it.
 */
export interface RawBandHour extends BandHourPrediction {
  snrLowDecile: number | null;
  snrUpDecile: number | null;
}
