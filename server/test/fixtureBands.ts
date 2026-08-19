import type { BandKey } from '../src/types.ts';

/**
 * The bands the captured listings in `fixtures/` were run for.
 *
 * Ascending by frequency, which is the order the columns appear in and
 * the order `parseVoacapOutput` reads them in.
 *
 * Named here rather than taken from `BANDS_BY_FREQ` because a fixture is
 * a recording of one particular question. When 60m was added to the app
 * (2026-08-18) the tests that read these files started asking for ten
 * bands from a listing that holds nine, and failed — not because
 * anything was wrong, but because they were describing the app when they
 * meant to describe the file. The listings are unchanged; what they
 * cover is now written down.
 *
 * Regenerating them against the Fortran would let these follow the app
 * again. Until then, a band added to the app does not silently change
 * what these tests believe they are reading.
 */
export const FIXTURE_BANDS: readonly BandKey[] = [
  '160m',
  '80m',
  '40m',
  '30m',
  '20m',
  '17m',
  '15m',
  '12m',
  '10m',
];
