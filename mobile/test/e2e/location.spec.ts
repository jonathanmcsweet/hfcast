/**
 * The path chooser's frame.
 *
 * Material takes a search view full screen below the compact breakpoint,
 * because a results list has no length the layout can plan for. This pane
 * was a fixed 560pt card at every width, which is where the unreachable
 * rows came from (`LocationPicker.tsx`, the note on `styles.list`).
 *
 * Locators are accessible names, as everywhere in this directory.
 */
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.ts';

const pathButton = (page: Page) =>
  page.getByRole('button', { name: /Transmitting from Greenwich/i });

/** The search field, which sits across the frame's content. */
const searchBox = (page: Page) =>
  page.getByPlaceholder('Town, coordinates, grid square');

test.describe('the path chooser', () => {
  test('opens with a back arrow, not a cross', async ({ page, open: launch }) => {
    await launch();
    await pathButton(page).click();

    await expect(page.getByText('Choose a path')).toBeVisible();

    // Back, because choosing a place applies it at once. A cross would
    // promise there is something here to discard. `exact`, or "Close"
    // also matches every band the grid calls "closed".
    await expect(page.getByRole('button', { name: 'Back', exact: true }))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Close', exact: true }))
      .toHaveCount(0);

    // Swapping is something the screen offers, so it stays in the bar.
    await expect(
      page.getByRole('button', { name: 'Swap the two ends of the path' }),
    ).toBeVisible();
  });

  test(
    'reaches the screen edge on a phone, stays a card on a tablet',
    async ({ page, open: launch }, info) => {
      await launch();
      await pathButton(page).click();
      await expect(searchBox(page)).toBeVisible();

      const viewport = page.viewportSize();
      const box = await searchBox(page).boundingBox();
      if (viewport === null || box === null) {
        throw new Error(
          'nothing to measure',
        );
      }

      // How much screen is left beside the pane. A full-screen dialog
      // leaves only its own padding; a card leaves the page it sits on.
      // Measured rather than the pane's width, because a phone's width and
      // a tablet card's width are similar numbers while the gap is not.
      const margin = (viewport.width - (box.x + box.width)) / viewport.width;
      if (info.project.name === 'phone') {
        expect(margin).toBeLessThan(0.15);
      } else {
        expect(margin).toBeGreaterThan(0.2);
      }
    },
  );

  test('leaves by the back arrow', async ({ page, open: launch }) => {
    await launch();
    await pathButton(page).click();
    await expect(page.getByText('Choose a path')).toBeVisible();

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText('Choose a path')).toHaveCount(0);
  });
});
