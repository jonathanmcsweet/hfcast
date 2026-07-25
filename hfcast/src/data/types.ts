export type BandKey =
  | '160m' | '80m' | '40m' | '30m' | '20m'
  | '17m' | '15m' | '12m' | '10m';

/** VOACAP emits one of these per band per hour. */
export interface BandHourPrediction {
  /** UTC hour, 0-23. */
  hour: number;
  band: BandKey;
  /** Circuit reliability, 0..1. The "chance of rain" analogue. */
  reliability: number;
  /** Median signal-to-noise ratio in dB. */
  snr: number;
}

export interface PathPrediction {
  /** Maidenhead locators. Deliberately not translated. */
  fromGrid: string;
  toGrid: string;
  /** i18n keys for endpoint place names. */
  fromKey: string;
  toKey: string;
  distanceKm: number;
  bearingDeg: number;
  /** Smoothed sunspot number the run assumed. Not today's SSN. */
  smoothedSSN: number;
  /** 1-12. Climatology is monthly, so the month is part of the identity. */
  month: number;
  cells: BandHourPrediction[];
}

export const BAND_ORDER: BandKey[] = [
  '10m', '12m', '15m', '17m', '20m', '30m', '40m', '80m', '160m',
];

/** Nominal centre frequency, used for the MUF comparison and sorting. */
export const BAND_MHZ: Record<BandKey, number> = {
  '160m': 1.84, '80m': 3.75, '40m': 7.1, '30m': 10.12, '20m': 14.2,
  '17m': 18.1, '15m': 21.2, '12m': 24.94, '10m': 28.4,
};
