/**
 * The forecast model choice, end to end.
 *
 * The chips in the preferences modal change which model the server is
 * asked for: the classic engine by silence, the new one by
 * `engine=truecast`. The request is the observable that matters — a
 * switch that moved only its own highlight would look the same on screen.
 *
 * The new model is the default, so the silence is reached by picking the
 * classic chip rather than by doing nothing.
 */
import { expect, test } from './fixtures.ts';

/** Opens the preferences modal from the settings menu. */
async function openPreferences(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
}

test.describe('the forecast model choice', () => {
  test('offers both models and asks the server for the one picked', async ({ page, open }) => {
    // Every prediction request is inspected for the model it asks for,
    // from before the first one. The stubs still answer; this only
    // watches.
    const asked: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/survey')) {
        asked.push(url.searchParams.get('engine') ?? 'absent');
      }
    });

    await open();

    // The default names the new model, which is what answers unless
    // somebody chooses otherwise.
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(asked[0]).toBe('truecast');

    await openPreferences(page);
    await expect(page.getByText('Forecast model')).toBeVisible();

    // Both chips are reachable by their accessible names.
    await expect(page.getByRole('button', { name: 'Truecast (new)' }))
      .toBeVisible();
    await page.getByRole('button', { name: 'VOACAP (classic)' }).click();
    await page.getByRole('button', { name: 'Close preferences' }).click();

    // The switch re-keys the query, so a new request follows without a
    // reload, and the classic choice names no model at all: the request
    // shape every old server understands.
    await expect.poll(() => asked.includes('absent')).toBe(true);
  });
});
