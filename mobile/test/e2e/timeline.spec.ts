/**
 * The past side of the timeline, driven by a false clock.
 *
 * The track keeps the hours a session watches go by — up to six — and
 * lets the thumb scrub back over them. Time is moved with Playwright's
 * clock, which `open` installs, and the minute tick in `ForecastScreen`
 * is what notices the jump: the same path a real hour takes. As
 * everywhere in these tests, every read is by accessible name or role,
 * so what is asserted is what a screen reader is told.
 */
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.ts';

const HOUR_MS = 3_600_000;

/** The hour control, found the way a screen reader finds it. */
const slider = (page: Page) => page.getByLabel('Hour of day, UTC');

/**
 * Presses one end of the track and waits for the readout to answer.
 *
 * A press outside the thumb's travel is clamped to the nearer end, so
 * this lands on the track's oldest or newest hour with no arithmetic
 * about the thumb's width. The press is retried until the expected
 * readout appears: the control measures its own position lazily on the
 * web, and a press can land while that measure is stale after a layout
 * change. `exact`, because the map's own sentence also names hours.
 */
async function scrubTo(
  page: Page,
  edge: 'start' | 'end',
  readout: string,
): Promise<void> {
  await expect(async () => {
    // The control caches its own left edge and re-measures only on a
    // resize or an in-page scroll. When neither has happened since a
    // layout moved it, every press lands a constant distance off — so
    // ask for the re-measure the way the platform would.
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const box = await slider(page).boundingBox();
    if (!box) throw new Error('the hour control has no box');
    const x = edge === 'start' ? 1 : box.width - 1;
    // The press gets its own short deadline. Without one, a press that
    // finds the control covered — mid-scroll, mid-layout — waits for
    // the whole test's time, and the retry around it never runs.
    await slider(page).click({ position: { x, y: 22 }, timeout: 2_000 });
    await expect(page.getByText(readout, { exact: true }))
      .toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe('the rolling timeline', () => {
  test('fills in behind "now" as hours pass, and scrubs back', async ({ page, open }) => {
    await open({ hour: 12 });

    // At open nothing is past: the track starts at "now".
    await expect(page.getByText('Now · 12:00 · 40M')).toBeVisible();
    await scrubTo(page, 'start', 'Now · 12:00 · 40M');

    // Three hours pass. The selection was on "now", so it follows.
    await page.clock.fastForward(3 * HOUR_MS);
    await expect(page.getByText('Now · 15:00 · 40M')).toBeVisible();

    // The passed hours stayed on the track: its first position is still
    // 12:00, now three hours in the past, and still selectable.
    await scrubTo(page, 'start', '40M at 12:00');
  });

  test('stops the past window at six hours', async ({ page, open }) => {
    await open({ hour: 12 });

    // The screen has to be up before the clock jumps: the minute tick
    // that notices the jump is registered on mount.
    await expect(page.getByText('Now · 12:00 · 40M')).toBeVisible();

    // Half a day passes in one jump. Only the window's six hours are
    // kept, so the track starts at 18:00 rather than at noon.
    await page.clock.fastForward(12 * HOUR_MS);
    await expect(page.getByText('Now · 00:00 · 40M')).toBeVisible();

    await scrubTo(page, 'start', '40M at 18:00');
  });

  test('keeps a moved selection while an hour passes', async ({ page, open }) => {
    await open({ hour: 12 });

    // The reader scrubs to the track's far end: 11:00 tomorrow.
    await scrubTo(page, 'end', '40M at 11:00');

    // An hour passes. A selection the reader placed keeps its hour —
    // only a selection left on "now" follows the clock.
    await page.clock.fastForward(HOUR_MS);
    await expect(page.getByText('40M at 11:00', { exact: true }))
      .toBeVisible();
  });
});
