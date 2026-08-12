/**
 * The first launch, which no other spec sees.
 *
 * Every other test seeds `ready: true` so it can get to the screen it is
 * about. That left the first launch — the one screen every new reader
 * meets — with no test at all, and a fault lived there: the store holds
 * Greenwich until the question is answered, so the app asked for a
 * forecast of Greenwich, drew it, and then replaced it with the chosen
 * place about two seconds later (user, 2026-08-12).
 *
 * Counting requests rather than reading the screen. The wrong forecast
 * appeared and left again quickly, which is exactly the kind of fault a
 * screen assertion races with and a request count cannot miss.
 */
import { expect, stubApi, test } from './fixtures.ts';

/** Where the app starts before anybody answers. */
const DEFAULT_PLACE = 'Greenwich';

test.describe('the first launch', () => {
  test('asks for no forecast until the reader has said where', async ({ page }) => {
    await stubApi(page);

    const asked: string[] = [];
    // Registered before the page opens, so nothing can slip through
    // while the listener is being attached.
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/prediction') || url.includes('/api/survey')) {
        asked.push(url);
      }
    });

    // No seeded state: this is a device the app has never run on.
    await page.clock.install({
      time: new Date(Date.UTC(2026, 7, 5, 12, 0, 0)),
    });
    await page.clock.resume();
    await page.goto('/');

    // The pane that asks the question has to be the thing on screen.
    await expect(
      page.getByRole('button', { name: /skip/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Long enough that a run started on arrival would have gone out. The
    // fault this covers took about two seconds to show itself.
    await page.waitForTimeout(3000);

    expect(
      asked,
      `a forecast was asked for before the reader chose a place: ${
        asked.join(', ')
      }`,
    ).toEqual([]);
  });

  test('asks only for the place that was chosen', async ({ page }) => {
    await stubApi(page);

    const asked: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/prediction') || url.includes('/api/survey')) {
        asked.push(url);
      }
    });

    await page.clock.install({
      time: new Date(Date.UTC(2026, 7, 5, 12, 0, 0)),
    });
    await page.clock.resume();
    await page.goto('/');

    // Skipping is a real answer and sets the default, which makes it the
    // one path that can be driven without typing a place name. What
    // matters is that the run happens once, after the answer.
    await page.getByRole('button', { name: /skip/i }).first().click();

    await expect
      .poll(() => asked.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(2000);

    // One place, asked for once. Two would mean the default was computed
    // and then thrown away, which is the whole fault.
    const places = new Set(
      asked.map((url) => new URL(url).searchParams.get('fromLabel')),
    );
    expect(
      places.size,
      `asked about more than one place: ${[...places].join(', ')}`,
    ).toBe(1);
    expect([...places][0] ?? DEFAULT_PLACE).toBe(DEFAULT_PLACE);
  });
});
