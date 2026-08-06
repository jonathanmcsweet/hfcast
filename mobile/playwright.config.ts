import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * End-to-end tests for the web build.
 *
 * `test/*.test.ts` runs under Node and tests one unit at a time. These drive
 * the built application in a browser: what it draws, and what it does when
 * an answer does not arrive. The server is replaced by fixtures — see
 * `test/e2e/fixtures.ts` for what that does and does not cover.
 *
 * The tests read `dist/`, which `pnpm web:export` writes. They do not build
 * it: an export takes minutes, and a suite that rebuilt on every run would
 * be too slow to use while working on a test.
 */

// Playwright loads this file as CommonJS, so `__dirname` rather than
// `import.meta`.
const DIST = path.join(__dirname, 'dist', 'index.html');

if (!existsSync(DIST)) {
  // Louder than the server failing to start, which reads as a port problem.
  throw new Error(
    'no web build in dist/. Run `pnpm web:export` first, or `pnpm e2e`, which does both.',
  );
}

/** Not 8787, which is the prediction server's, or 8081, which is Metro's. */
const PORT = 8788;

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',

  // A failing assertion in one spec must not depend on another spec having
  // run, so each gets its own page and they run together.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,

  // The app paints to canvases, and a full parallel run is a dozen
  // browsers sharing one machine. A first paint that takes a second
  // alone takes several together, so every expectation gets twice the
  // default rather than tests growing private extensions one flake at
  // a time.
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    // The app draws to a canvas in places, so a picture is the only useful
    // record of what a failure looked like. CI only: there the picture is
    // all that survives the runner, uploaded as the e2e-results artifact.
    // A local failure has the live browser and the trace viewer, and the
    // pictures would pile up in test-results unread.
    screenshot: process.env.CI ? 'only-on-failure' : 'off',
  },

  // Both sizes, because every screen has to work on both. The application
  // has no desktop layout: a wide browser gets the tablet one.
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['Galaxy Tab S4 landscape'] } },
  ],

  webServer: {
    command: `npx expo serve dist --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
