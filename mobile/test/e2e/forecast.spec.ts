/**
 * What the web build draws, and what it does when an answer is missing.
 *
 * These run the exported application in a browser with the prediction
 * server replaced by fixtures. The `test` comes from `fixtures.ts` too:
 * every test starts behind the stubbed server, and `open` finishes the
 * launch. See that file for what the stubs do and do not cover.
 *
 * Every locator here is an accessible name or a role. That is how a screen
 * reader finds the same control, so a test that cannot find something is
 * also telling us a reader could not. Nothing is found by test id.
 */
import { allClosed, expect, prediction, stubApi, test } from './fixtures.ts';

test.describe('the forecast screen', () => {
  test('draws a forecast for the default location', async ({ page, open }) => {
    await open();

    // The header names where the forecast is from, and offers to change it.
    await expect(
      page.getByRole('button', { name: /Transmitting from Greenwich/i }),
    ).toBeVisible();

    // The loading state is replaced rather than left behind it.
    await expect(page.getByText('Working out the forecast')).toBeHidden();
    await expect(page.getByText('No forecast available')).toBeHidden();
  });

  test('shows the sun readings that drove the run', async ({ page, open }) => {
    await open();

    // The card is closed until it is asked for: the forecast is the answer,
    // and the readings behind it are the detail.
    await expect(page.getByText('Solar flux')).toBeHidden();

    await page.getByRole('button', { name: /The sun today/ }).click();

    await expect(page.getByText('Solar flux')).toBeVisible();
    await expect(page.getByText('142', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('K index')).toBeVisible();
  });

  test('says so when no band reaches at any hour', async ({ page, open }) => {
    // A grid of identical closed cells is a true answer that looks like a
    // failed one, so the application says it in words as well.
    await stubApi(page, { '/api/survey': allClosed() });
    await open();

    await expect(page.getByText(/No band reaches/i)).toBeVisible();
  });
});

test.describe('the band selector', () => {
  test('offers every band and changes what is shown', async ({ page, open }) => {
    await open();

    const fortyMetres = page.getByRole('button', { name: 'Show 40m' });
    const twentyMetres = page.getByRole('button', { name: 'Show 20m' });

    await expect(fortyMetres).toBeVisible();
    await expect(twentyMetres).toBeVisible();

    // The application opens on 40m. Choosing another must move what the
    // rest of the screen reports, which is the whole purpose of the chips.
    await twentyMetres.click();
    await expect(page.getByText(/^20m/).first()).toBeVisible();
  });
});

test.describe('the hour control', () => {
  test('is reachable by its accessible name', async ({ page, open }) => {
    await open({ hour: 12 });

    await expect(page.getByLabel('Hour of day, UTC')).toBeVisible();
  });
});

test.describe('the grid', () => {
  test('can be read as a table instead', async ({ page, open }) => {
    // The table is the alternative for a reader who cannot use the drawn
    // grid, so it has to be reachable and it has to hold the bands.
    await open();

    await page.getByRole('button', { name: 'Show as table' }).click();

    await expect(page.getByText('Band').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show as grid' }))
      .toBeVisible();
  });
});

test.describe('when the server does not answer', () => {
  test('shows the error screen and offers to try again', async ({ page, open }) => {
    await stubApi(page, { '/api/survey': 'fail', '/api/prediction': 'fail' });
    await open();

    await expect(page.getByText('No forecast available')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    // The station can still be set up from here, because none of it needs
    // the server.
    await expect(page.getByRole('button', { name: 'Set up your radio' }))
      .toBeVisible();
  });

  test('recovers when the server comes back', async ({ page, open }) => {
    await stubApi(page, { '/api/survey': 'fail' });
    await open();
    await expect(page.getByText('No forecast available')).toBeVisible();

    // The same route, answering this time. `page.route` takes the last
    // handler added, so this replaces the failure.
    await stubApi(page, { '/api/survey': prediction(null) });
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByText('No forecast available')).toBeHidden();
  });

  test('marks the forecast offline when only the readings fail', async ({ page, open }) => {
    // The forecast still arrives; only the live conditions are missing.
    // That costs accuracy, not the answer, and the chip is what says so.
    await stubApi(page, { '/api/spaceweather': 'fail' });
    await open();

    await expect(page.getByText('No forecast available')).toBeHidden();
    // `open` returns when the forecast settles, but the chip waits for
    // the readings query to give up, and that retries first. On a busy
    // machine — every spec runs at once — the retry outlives the
    // default expectation, so wait the way the app actually behaves.
    await expect(page.getByLabel('Saved forecast'))
      .toBeVisible({ timeout: 20_000 });
  });
});
