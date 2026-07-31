import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cellField, nvisPoints } from '../src/data/cellField.ts';
import { projector, toScreen, viewTransform } from '../src/data/projection.ts';
import type { CoveragePoint } from '../src/data/types.ts';

const SIZE = 322;
const p = projector(-80.4, 27.6, SIZE);

const point = (
  lat: number,
  lon: number,
  reliability: number,
  takeoffAngleDeg = 20,
): CoveragePoint => ({ lat, lon, reliability, takeoffAngleDeg });

describe('the transform the two renderers share', () => {
  // The failure this guards against is not a wrong number, it is two
  // right numbers that disagree: the canvas draws the cells and the SVG
  // draws the coastlines, so a mismatch puts land in the wrong place
  // rather than showing an obvious fault.
  it('puts a point on the same pixel through the viewBox and the matrix', () => {
    const views = [
      { scale: 1, cxF: 0.5, cyF: 0.5 },
      { scale: 4, cxF: 0.32, cyF: 0.71 },
      { scale: 30, cxF: 0.5, cyF: 0.5 },
      { scale: 12.5, cxF: 0.9, cyF: 0.1 },
    ];

    for (const view of views) {
      const t = viewTransform(view, SIZE);
      const [minX, minY, w] = t.viewBox.split(' ').map(Number) as [
        number,
        number,
        number,
        number,
      ];

      for (const [x, y] of [[0, 0], [161, 161], [300, 12], [45.5, 288.25]]) {
        // What SVG does with a viewBox: shift by the window's origin,
        // then scale the window up to the element.
        const svgX = ((x as number) - minX) * (SIZE / w);
        const svgY = ((y as number) - minY) * (SIZE / w);
        const [skiaX, skiaY] = toScreen(t, x as number, y as number);

        // Exact but for floating point. Both forms are derived from the
        // same rounded window, so the rounding cannot separate them —
        // which is the whole point, and was not true of the first
        // version of this function.
        const tolerance = 1e-9;
        assert.ok(
          Math.abs(svgX - skiaX) <= tolerance,
          `x at scale ${view.scale}: svg ${svgX}, skia ${skiaX}`,
        );
        assert.ok(
          Math.abs(svgY - skiaY) <= tolerance,
          `y at scale ${view.scale}: svg ${svgY}, skia ${skiaY}`,
        );
      }
    }
  });

  it('shows the whole disc at the minimum scale', () => {
    const t = viewTransform({ scale: 1, cxF: 0.5, cyF: 0.5 }, SIZE);
    assert.equal(t.viewBox, '0.00 0.00 322.00 322.00');
    assert.deepEqual(toScreen(t, 0, 0), [0, 0]);
    assert.deepEqual(toScreen(t, SIZE, SIZE), [SIZE, SIZE]);
  });
});

describe('bucketing cells for a renderer', () => {
  it('gives one path per quality, not one per cell', () => {
    const field = cellField(
      p,
      [
        point(27.5, -80.5, 0.9),
        point(27.5, -79.0, 0.85),
        point(26.0, -80.5, 0.5),
        point(26.0, -79.0, 0.02),
      ],
      1.5,
      1.25,
      true,
    );

    assert.deepEqual(
      [...field.buckets.map((b) => b.quality)].sort(),
      ['closed', 'patchy', 'reliable'],
    );

    // The two reliable cells share one path, as two closed subpaths.
    const reliable = field.buckets.find((b) => b.quality === 'reliable');
    assert.ok(reliable);
    assert.equal((reliable.d.match(/Z/g) ?? []).length, 2);
    assert.equal((reliable.d.match(/M/g) ?? []).length, 2);
  });

  it('leaves closed cells out of the box the Fit control frames', () => {
    // Fit answers "where does this band reach", so a closed cell far
    // from the rest must not stretch the frame toward it.
    const near = cellField(p, [point(27.5, -80.5, 0.9)], 1.5, 1.25, true);
    const withFarClosed = cellField(
      p,
      [point(27.5, -80.5, 0.9), point(-40, 120, 0.0)],
      1.5,
      1.25,
      true,
    );
    assert.deepEqual(withFarClosed.reachBox, near.reachBox);
  });

  it('reports no box when the band reaches nowhere', () => {
    const field = cellField(p, [point(27.5, -80.5, 0.01)], 1.5, 1.25, true);
    assert.equal(field.reachBox, null);
    // The cells are still drawn — closed is an answer, not an absence.
    assert.equal(field.buckets.length, 1);
  });

  it('never sets a box for a grid told not to count', () => {
    const field = cellField(p, [point(27.5, -80.5, 0.9)], 1.5, 1.25, false);
    assert.equal(field.reachBox, null);
  });
});

describe('the near-vertical stipple', () => {
  it('marks steep working paths and nothing else', () => {
    const dots = nvisPoints(p, [
      point(27.5, -80.5, 0.9, 80),
      point(27.5, -79.0, 0.9, 20),
      point(26.0, -80.5, 0.01, 80),
    ]);
    assert.equal(dots.length, 1);
  });
});
