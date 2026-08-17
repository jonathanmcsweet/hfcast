/**
 * The forecast model choice, end to end.
 *
 * The chips live in the preferences modal, and what they change is which
 * model the server is asked for: the classic engine by silence, the new
 * one by `engine=truecast` on the prediction request. The request is the
 * observable that matters — a switch that changed only its own highlight
 * would look exactly the same on screen.
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

    // The default asks for nothing: the classic request shape every old
    // server understands, so no install changes behaviour uninvited.
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(asked[0]).toBe('absent');

    await openPreferences(page);
    await expect(page.getByText('Forecast model')).toBeVisible();

    // Both chips are reachable by their accessible names.
    await expect(page.getByRole('button', { name: 'VOACAP (classic)' }))
      .toBeVisible();
    await page.getByRole('button', { name: 'Truecast (new)' }).click();
    await page.getByRole('button', { name: 'Close preferences' }).click();

    // The switch re-keys the query, so a new request follows without a
    // reload, and it names the new model. Switching back is deliberately
    // not asserted as a request: the classic answer is still cached, and
    // serving it from the cache is the right behaviour.
    await expect.poll(() => asked.includes('truecast')).toBe(true);
  });
});
