/**
 * Choosing, naming and adding a station.
 *
 * The dialog edits a draft of every saved station, so which one it is
 * pointed at is the first thing it has to get right. Picking a saved
 * station and being shown a different one's settings is the failure that
 * matters: nothing on screen says which station the fields belong to
 * except these two, and the reader edits what they are shown.
 *
 * A browser test rather than a mounted one, because the first fault this
 * covered was the browser's own — a list that closed when the field lost
 * focus, which on web happens before a press on the list can land.
 */
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.ts';

const ANTENNA = {
  type: 'isotropic' as const,
  heightM: 10,
  gainDbd: 6,
  beamDeg: 0,
};

/** Two saved stations, the second of them the one in use. */
const SAVED = {
  presets: [
    {
      id: 's1',
      name: 'Home',
      watts: 100,
      mode: 'cw' as const,
      antenna: ANTENNA,
    },
    {
      id: 's2',
      name: 'Field day',
      watts: 5,
      mode: 'ft8' as const,
      antenna: ANTENNA,
    },
  ],
  activeId: 's2',
};

/**
 * Opens the dialog from the strip under the band picker. The mode chip
 * rather than the station name: that one opens a menu first, and this
 * file is about the dialog.
 */
async function openDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Mode:/ }).click();
  await expect(page.getByText('Your radio')).toBeVisible();
}

const picker = (page: Page) =>
  page.getByRole('button', { name: 'Select a station to edit' });

const nameField = (page: Page) =>
  page.getByRole('textbox', { name: 'Name of this station' });

const option = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

const save = (page: Page) => page.getByRole('button', { name: 'Save' });

/** Unlocks the name field, which is read-only until the pencil is used. */
async function unlockName(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Edit the name' }).click();
}

test.describe('the station dialog', () => {
  test('opens on the station in use, named in both fields', async ({ page, open }) => {
    await open({ stations: SAVED });
    await openDialog(page);

    await expect(picker(page)).toContainText('Field day');
    await expect(nameField(page)).toHaveValue('Field day');
  });

  test('picking a saved station shows that station', async ({ page, open }) => {
    await open({ stations: SAVED });
    await openDialog(page);

    await picker(page).click();
    await option(page, 'Home').click();

    // Both, because they are the only two things on screen that say
    // which station the settings below belong to.
    await expect(picker(page)).toContainText('Home');
    await expect(nameField(page)).toHaveValue('Home');
  });

  test('a picked station is the one that is saved', async ({ page, open }) => {
    await open({ stations: SAVED });
    await openDialog(page);

    await picker(page).click();
    await option(page, 'Home').click();
    await save(page).click();

    await expect(page.getByRole('button', { name: 'Station: Home' }))
      .toBeVisible();
  });

  test('the name is read-only until the pencil is pressed', async ({ page, open }) => {
    // A name is what tells two stations apart everywhere else, so it
    // takes a deliberate press to change.
    await open({ stations: SAVED });
    await openDialog(page);

    await expect(nameField(page)).toHaveAttribute('readonly', '');

    await unlockName(page);
    await expect(nameField(page)).not.toHaveAttribute('readonly', '');

    // A key at a time. The field locked itself on the first letter, and
    // `fill` sets the whole value in one go, so it never saw it.
    await nameField(page).fill('');
    await nameField(page).pressSequentially('Summit');
    await expect(picker(page)).toContainText('Summit');

    await save(page).click();
    await expect(page.getByRole('button', { name: 'Station: Summit' }))
      .toBeVisible();
  });

  test('unlocking the name draws the focus outline', async ({ page, open }) => {
    // Paper drops a focus event that arrives while it still holds
    // `editable={false}`, and no second one follows because the element
    // is already the active one. The field took the cursor and the keys
    // and never drew the outline that says so.
    await open({ stations: SAVED });
    await openDialog(page);

    const outline = () =>
      page.locator('input[aria-label="Name of this station"]').evaluate(
        (input) => {
          const box = input.parentElement?.parentElement;
          const drawn = Array.from(box?.children ?? [])
            .map((node) => getComputedStyle(node))
            .find((style) => parseFloat(style.borderTopWidth) > 0);
          return drawn === undefined
            ? 'none'
            : `${drawn.borderTopColor} ${drawn.borderTopWidth}`;
        },
      );

    const resting = await outline();
    await unlockName(page);
    await expect.poll(outline).not.toBe(resting);
  });

  test('adds a station from the list, unnamed and unsaveable', async ({ page, open }) => {
    await open({ stations: SAVED });
    await openDialog(page);

    await picker(page).click();
    await option(page, 'Add a station').click();

    // Empty, and saying why nothing can be saved yet.
    await expect(nameField(page)).toHaveValue('');
    await expect(page.getByText('Every station needs a name.')).toBeVisible();
    await expect(save(page)).toBeDisabled();

    // No pencil needed: it opened itself, and stays open while it is
    // being typed into.
    await nameField(page).pressSequentially('Summit');
    await expect(page.getByText('Every station needs a name.')).toBeHidden();
    await expect(save(page)).toBeEnabled();

    await save(page).click();
    await expect(page.getByRole('button', { name: 'Station: Summit' }))
      .toBeVisible();
  });

  test('a new station copies the settings it was made from', async ({ page, open }) => {
    // A second station is usually the first with one thing different.
    await open({ stations: SAVED });
    await openDialog(page);

    await picker(page).click();
    await option(page, 'Add a station').click();
    await nameField(page).pressSequentially('Summit');
    await save(page).click();

    // Field day transmits FT8 at 5 W, and so does its copy.
    await expect(page.getByRole('button', { name: /^Mode: FT8/ }))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Power: 5 watts' }))
      .toBeVisible();
  });

  test('will not save a name rubbed out', async ({ page, open }) => {
    await open({ stations: SAVED });
    await openDialog(page);

    await unlockName(page);
    await nameField(page).fill('');

    await expect(page.getByText('Every station needs a name.')).toBeVisible();
    await expect(save(page)).toBeDisabled();
  });

  test('says what each field is for', async ({ page, open }) => {
    await open({ stations: SAVED });
    await openDialog(page);

    await expect(page.getByText('Select a station')).toBeVisible();
    await expect(page.getByText('Name', { exact: true })).toBeVisible();
  });
});
