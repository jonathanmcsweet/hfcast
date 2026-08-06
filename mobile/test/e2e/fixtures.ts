/**
 * The answers the web build is given, instead of a server.
 *
 * The web build has no engine in it and reads every forecast from the
 * prediction server, which needs `voacapl` and an `itshfbc` tree. These
 * tests are about the application: what it draws, and what it does when an
 * answer does not arrive. So the server is replaced by fixed answers, and
 * a failure here always means the application changed.
 *
 * What this cannot catch is the server and the application disagreeing
 * about the shape of an answer. `server/test` holds that, against the real
 * engine.
 *
 * The numbers are made by a rule rather than copied from a run, so each
 * one can be predicted by a test without a table of expected values here.
 */
import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  BAND_ORDER,
  type BandHourPrediction,
  type BandKey,
  type Endpoint,
  type PredictionResponse,
  type SpaceWeather,
} from '../../src/data/types.ts';

/** Where the tests transmit from. Also the application's own default. */
export const GREENWICH: Endpoint = {
  grid: 'IO91',
  label: 'Greenwich',
  lat: 51.48,
  lon: 0,
};

export const LONDON: Endpoint = {
  grid: 'IO91',
  label: 'London',
  lat: 51.5,
  lon: -0.1,
};

/**
 * Reliability for one band at one hour, 0..1.
 *
 * Daytime favours the high bands and night the low ones, which is what the
 * ionosphere does and what makes the drawn grid look like a real one. The
 * rule matters more than the values: a test can work out what any cell must
 * hold, so an assertion names a number rather than an index into a table.
 *
 * 40m at 12 UTC is 0.9, which is the cell most of these tests read.
 */
export function reliabilityFor(band: BandKey, hour: number): number {
  const day = hour >= 8 && hour < 20;
  const high = ['10m', '12m', '15m', '17m'].includes(band);
  if (band === '40m') return day ? 0.9 : 0.45;
  if (high) return day ? 0.75 : 0.05;
  return day ? 0.2 : 0.8;
}

const cells = (): BandHourPrediction[] =>
  BAND_ORDER.flatMap((band) =>
    Array.from({ length: 24 }, (_, hour) => ({
      hour,
      band,
      reliability: reliabilityFor(band, hour),
      snr: Math.round(reliabilityFor(band, hour) * 40),
      takeoffAngleDeg: 12,
    }))
  );

export const SPACE_WEATHER: SpaceWeather = {
  f107: 142,
  observedSsn: 88,
  kp: 2,
  kpMax24h: 3,
  effectiveSsn: 91,
  observedAt: '2026-08-05T00:00:00Z',
};

/**
 * One prediction. `to` is null for a survey, which is what the application
 * opens on: no destination chosen, so each cell is the share of directions
 * reachable rather than the chance of one contact.
 */
export function prediction(to: Endpoint | null = null): PredictionResponse {
  return {
    prediction: {
      from: GREENWICH,
      to,
      distanceKm: to ? 8 : null,
      bearingDeg: to ? 271 : null,
      ssn: 91,
      requiredSnrDb: 24,
      basis: 'nowcast',
      month: 8,
      year: 2026,
      date: '2026-08-05',
      mufByHour: Array.from(
        { length: 24 },
        (_, hour) => hour >= 8 && hour < 20 ? 18.4 : 9.2,
      ),
      window: {
        fotByHour: Array.from({ length: 24 }, () => 14.2),
        hpfByHour: Array.from({ length: 24 }, () => 21.2),
        lufByHour: Array.from({ length: 24 }, () => 4.1),
      },
      cells: cells(),
    },
    spaceWeather: SPACE_WEATHER,
  };
}

/** Every band closed at every hour, which is a true answer on a long path. */
export function allClosed(): PredictionResponse {
  const answer = prediction();
  return {
    ...answer,
    prediction: {
      ...answer.prediction,
      cells: answer.prediction.cells.map((cell) => ({
        ...cell,
        reliability: 0,
        snr: -20,
      })),
    },
  };
}

/** What the coverage map asks for. Empty is drawable and is not an error. */
const COVERAGE = { cells: [], lonStep: 22.5, latStep: 15 };

/**
 * Answers every call the application makes, with no network reached.
 *
 * `overrides` replaces the answer for one path. An entry of `'fail'` makes
 * that call fail the way an unreachable server does, which is a state the
 * application draws on purpose.
 */
export async function stubApi(
  page: Page,
  overrides: Partial<Record<string, unknown | 'fail'>> = {},
): Promise<void> {
  const answers: Record<string, unknown> = {
    '/api/prediction': prediction(LONDON),
    '/api/survey': prediction(null),
    '/api/forecast': [],
    '/api/spaceweather': SPACE_WEATHER,
    '/api/ionosonde': null,
    '/api/coverage': COVERAGE,
    '/api/coverage/fine': COVERAGE,
    '/api/coverage/patch': null,
    ...overrides,
  };

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const answer = answers[path];

    if (answer === 'fail') return route.abort('connectionrefused');

    // A path with no answer here is a call the application makes and these
    // fixtures do not know about. Failing it is louder than an empty body,
    // which several screens would draw as an ordinary empty state.
    if (answer === undefined) {
      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ error: `no fixture for ${path}` }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(answer),
    });
  });
}

/**
 * Opens the application past its first run, at a fixed hour.
 *
 * The first launch asks where the operator is transmitting from, and every
 * test after that one would have to answer it. Writing what the store
 * persists is the same state a real first run leaves behind: see
 * `usePathStore.ts`, which holds the key and the version.
 *
 * The hour is fixed because the grid reads the clock. Without it a test
 * that passes at noon fails at midnight.
 */
interface OpenOptions {
  hour?: number;
  to?: Endpoint | null;
}

export async function openApp(
  page: Page,
  options: OpenOptions = {},
): Promise<void> {
  const { hour = 12, to = null } = options;

  const stored = JSON.stringify({
    state: { from: GREENWICH, to, band: '40m', ready: true },
    version: 3,
  });

  // The function is serialised into the page, so everything it reads has to
  // arrive as its argument.
  await page.addInitScript((seed: { hour: number; stored: string; }) => {
    window.localStorage.setItem('hfcast.path', seed.stored);
  }, { hour, stored });

  // Every clock in the application reads UTC, so setting the time fixes the
  // hour the grid opens on and which column is "now". Without it a test that
  // passes at noon fails at midnight.
  //
  // The clock is started here and then left to run. A frozen one also stops
  // the launch screen, which holds itself up for a minimum time and measures
  // that with the clock: it never finishes, and every test behind it waits
  // for a screen that will not go away.
  await page.clock.install({
    time: new Date(Date.UTC(2026, 7, 5, hour, 0, 0)),
  });
  await page.clock.resume();

  await page.goto('/');
}

/**
 * The `test` every spec imports, in place of Playwright's own.
 *
 * Every test starts behind the stubbed server — no spec repeats that —
 * and gets `open` to finish the launch: `await open()`, or
 * `await open({ hour: 12 })`. A test that needs a different answer
 * still calls `stubApi(page, overrides)` before opening: `page.route`
 * takes the last handler added, so the override sits over the stubs
 * this fixture already laid down.
 *
 * `open` returns a screen that is ready to read: skeleton blocks stand
 * in for the forecast until the first answer settles, and nothing below
 * the header may be read before they leave — an assertion that
 * something is hidden passes vacuously while the real content is not
 * there yet. The wait is generous because a failing query holds the
 * skeletons through its retries. A test about the loading state itself
 * calls `openApp` directly, which returns at the moment of arrival.
 */
export const test = base.extend<{
  open: (options?: OpenOptions) => Promise<void>;
}>({
  open: async ({ page }, use) => {
    await stubApi(page);
    await use(async (options) => {
      await openApp(page, options);
      await expect(page.getByLabel('Working out the forecast'))
        .toBeHidden({ timeout: 20_000 });
    });
  },
});

export { expect } from '@playwright/test';
