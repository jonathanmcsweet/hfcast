/**
 * The yield that stopped a job, run in a real browser.
 *
 * What this covers and what it cannot. The fault is that React Native
 * drives `setTimeout` from the screen's frame clock and Android takes
 * that clock away when the activity pauses, so a job computing maps
 * ahead stopped between two strips of its first grid and stayed stopped
 * until the phone was woken (user, 2026-08-12).
 *
 * No browser reproduces that on its own. Chromium throttles timers in a
 * hidden page rather than stopping them, and Playwright switches even
 * that off — it launches with `--disable-background-timer-throttling`.
 * The app's computing path is also unreachable on the web build, which
 * has no engine, so nothing driven through the interface can arrive
 * here.
 *
 * So the platform condition is stated outright instead of waited for: a
 * `setTimeout` that never fires, which is what Android gives with the
 * screen off. The function under test is the shipped one, imported from
 * `src/` and rebuilt inside the page rather than copied — a copy would
 * pass while the app failed. It has no imports of its own, which is why
 * this is possible at all.
 *
 * The real end-to-end test is an Android device with its screen off. See
 * the roadmap: it needs an emulator, and this container has no KVM, no
 * emulator binary and no system image.
 */
import { breathe } from '../../src/data/breathe.ts';
import { expect, stubApi, test } from './fixtures.ts';

/**
 * The shipped function's own source, to be rebuilt inside the page.
 *
 * `toString` gives the compiled body, and the body reaches for nothing
 * outside itself, so the page gets the same code the phone runs.
 */
const SOURCE = breathe.toString();

/** Long enough that a yield which was going to arrive has arrived. */
const LONG_ENOUGH_MS = 2000;

/**
 * Runs the shipped yield in the page, with timers dead as Android leaves
 * them, and says whether it finished or stopped there.
 */
async function yieldWithDeadTimers(
  page: import('@playwright/test').Page,
  active: boolean,
): Promise<'finished' | 'stuck'> {
  return await page.evaluate(
    async ({ source, active, waitMs }) => {
      const breathe = new Function(`return ${source}`)() as (
        on: boolean,
      ) => Promise<void>;

      // Android with the screen off, exactly: a timer that is accepted
      // and never fires. Kept aside so the test itself can still wait.
      const realSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout;
      try {
        return await Promise.race([
          breathe(active).then(() => 'finished' as const),
          new Promise<'stuck'>((settle) =>
            realSetTimeout(() => settle('stuck'), waitMs)
          ),
        ]);
      } finally {
        globalThis.setTimeout = realSetTimeout;
      }
    },
    { source: SOURCE, active, waitMs: LONG_ENOUGH_MS },
  );
}

test.describe('computing on with no screen to draw to', () => {
  test('carries on when no timer will ever fire', async ({ page }) => {
    await stubApi(page);
    await page.goto('/');

    // The state a job computing maps ahead spends its life in. Before
    // the fix this waited on a timer that Android had switched off, and
    // the grid stopped between two of its sixteen strips.
    expect(await yieldWithDeadTimers(page, false)).toBe('finished');
  });

  test('still yields to the screen when there is one', async ({ page }) => {
    await stubApi(page);
    await page.goto('/');

    // The other half, and the reason the branch cannot simply be
    // deleted. On screen it has to hand the frame back, or packing a
    // 34,560 point grid stops the interface answering for the whole of
    // it. With timers dead that shows up as never finishing, which is
    // what a real yield looks like from here.
    expect(await yieldWithDeadTimers(page, true)).toBe('stuck');
  });
});
