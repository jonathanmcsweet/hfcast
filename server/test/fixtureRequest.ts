import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The one question the recorded listing answers.
 *
 * Shared by the tests and by `recordFixture.ts`, so the listing and the
 * tests reading it cannot describe two different runs.
 *
 * No `bands`, so the deck asks for every band the app forecasts and the
 * listing follows the app. 60m arrived (2026-08-18) into a listing that
 * held nine, and the tests said nine as well: they described the file
 * when they meant the app, so the new band went uncompared.
 */
export const FIXTURE_REQUEST = {
  fromLat: 47.61,
  fromLon: -122.33,
  toLat: 35.68,
  toLon: 139.77,
  fromLabel: 'Seattle',
  toLabel: 'Tokyo',
  month: 7,
  year: 2026,
  ssn: 68,
  watts: 100,
  requiredSnrDb: 24,
  noiseDbw: 145,
};

/** The listing itself. Re-record with `pnpm record-fixture`. */
export const FIXTURE_PATH = path.join(
  here,
  'fixtures/seattle-tokyo-jul2026-ssn68.out',
);
