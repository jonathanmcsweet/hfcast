/**
 * Where the answer sits relative to the map.
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

test.describe('the answer and the map', () => {
  test(
    'sit side by side only where there is room',
    async ({ page, open }, testInfo) => {
      await open();

      // The headline sentence, which is `reach.answerAnywhere` with no
      // destination set. Distinct from the reach line under the map, which
      // ends "of the world at this hour".
      const answer = page.getByText(/of the directions sampled/i).first();
      // Either label, because the slot holds the same box whether the grid
      // has arrived or is still coming, and this is about where it sits.
      const map = page
        .getByLabel(/Coverage map|Working out where this band reaches/i)
        .first();
      await expect(answer).toBeVisible();

      const a = await answer.boundingBox();
      const m = await map.boundingBox();
      expect(a, 'the answer has no box').not.toBeNull();
      expect(m, 'the map has no box').not.toBeNull();
      if (!a || !m) return;

      if (testInfo.project.name === 'tablet') {
        // Beside: the answer ends before the map starts, and the two share
        // a band of the screen vertically.
        expect(a.x + a.width).toBeLessThanOrEqual(m.x + 1);
        expect(a.y).toBeLessThan(m.y + m.height);
        expect(m.y).toBeLessThan(a.y + a.height);
      } else {
        // Stacked: the map begins below the answer.
        expect(m.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
      }
    },
  );
});
