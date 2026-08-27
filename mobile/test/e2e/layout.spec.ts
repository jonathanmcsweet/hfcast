/**
 * Where the band grid sits relative to the map card.
 *
 * `isWideLayout` decides it and `test/rotation.test.ts` holds the number.
 * What that cannot show is that the two really are drawn side by side,
 * because a column that renders in the wrong order still passes a unit
 * test. So this reads the boxes off the page.
 *
 * The `tablet` project runs at 1138 points across, which is past the line,
 * and `phone` at 412, which is not. One spec therefore covers both by
 * asking which project it is in.
 */
import { expect, test } from './fixtures.ts';

test.describe('the map card and the band grid', () => {
  test(
    'sit side by side only where there is room',
    async ({ page, open }, testInfo) => {
      await open();

      // Either label, because the slot holds the same box whether the grid
      // has arrived or is still coming, and this is about where it sits.
      const map = page
        .getByLabel(/Coverage map|Working out where this band reaches/i)
        .first();
      const bands = page.getByText(/All bands, every direction/i).first();
      await expect(map).toBeVisible();
      await expect(bands).toBeVisible();

      const m = await map.boundingBox();
      const b = await bands.boundingBox();
      expect(m, 'the map has no box').not.toBeNull();
      expect(b, 'the band grid has no box').not.toBeNull();
      if (!m || !b) return;

      if (testInfo.project.name === 'tablet') {
        // Beside: the map ends before the heading starts across the page,
        // and the heading begins before the map ends down it. The heading
        // is one line at the top of its own column, so it is not expected
        // to reach as far down as the map does; only that it does not sit
        // below the map entirely, which is what stacking would mean.
        expect(m.x + m.width).toBeLessThanOrEqual(b.x + 1);
        expect(b.y).toBeLessThan(m.y + m.height);
      } else {
        // Stacked: the grid begins below the map.
        expect(b.y).toBeGreaterThanOrEqual(m.y + m.height - 1);
      }
    },
  );
});
