import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LAT_STEP, LON_STEP } from '../src/data/coverageGrid.ts';
import {
  MAX_PATCH_POINTS,
  PATCH_HALF_LAT_DEG,
  PATCH_LAT_STEP,
  PATCH_LON_STEP,
  PATCH_MAX_HALF_LON_DEG,
  PATCH_STEPS,
  patchBounds,
  patchGrid,
} from '../src/data/coveragePatch.ts';
import { nvisReachKm } from '../src/data/quality.ts';
import type { CoveragePoint } from '../src/data/types.ts';

/**
 * The fine grid around the operator.
 *
 * It exists because the coarse grid cannot answer a question about the
 * first few hundred kilometres: one of its cells is bigger than that. So
 * what these tests are about is whether the rectangle asked for is the
 * right rectangle — big enough to hold the near-vertical region with room
 * to see its edge, small enough to run, and lined up with the coarse
 * cells rather than straddling them.
 *
 * The engine has its own tests for what it does with the rectangle. This
 * is only about what is asked for.
 */

/** Kilometres in one degree of latitude, near enough for a bound. */
const KM_PER_DEGREE = 111.19;

describe('the fine grid lines up with the coarse one', () => {
  it('divides both axes a whole number of times', () => {
    // What makes a patch cell a window on a coarse cell rather than a
    // rectangle lying across two of them. The engine snaps to bands of
    // the nearest width that divides the world, so a step that did not
    // divide would silently become a different step.
    assert.equal((180 / PATCH_LAT_STEP) % 1, 0);
    assert.equal((360 / PATCH_LON_STEP) % 1, 0);
  });

  it('divides the coarse step a whole number of times too', () => {
    // Stronger than the above, and the thing a reader actually sees: a
    // coarse cell is an exact whole number of fine cells, so the fine
    // grid replaces it rather than cutting across its edges.
    assert.equal((LAT_STEP / PATCH_LAT_STEP) % 1, 0);
    assert.equal((LON_STEP / PATCH_LON_STEP) % 1, 0);
  });

  it('is finer than the coarse grid by enough to be worth running', () => {
    // A patch only slightly finer would cost a second engine run to draw
    // almost the same picture.
    assert.ok(LAT_STEP / PATCH_LAT_STEP >= 8);
    assert.ok(LON_STEP / PATCH_LON_STEP >= 8);
  });
});

describe('the rectangle asked for', () => {
  it('reaches well past the near-vertical region', () => {
    // Near-vertical work runs out somewhere around 500 km. The rectangle
    // has to hold that and then some, because an edge drawn at the edge
    // of the map cannot be seen to be an edge.
    assert.ok(PATCH_HALF_LAT_DEG * KM_PER_DEGREE > 1000);
  });

  it('is about square in kilometres away from the poles', () => {
    // Denver. Ten degrees of latitude is about 1,100 km; ten degrees of
    // longitude there is about 850, so the longitude span is widened.
    const box = patchBounds(39.74, -104.98);
    assert.ok(box);
    const tallKm = (box.latMax - box.latMin) * KM_PER_DEGREE;
    const wideKm = (box.lonMax - box.lonMin) * KM_PER_DEGREE
      * Math.cos((39.74 * Math.PI) / 180);
    assert.ok(
      Math.abs(tallKm - wideKm) / tallKm < 0.05,
      `${Math.round(tallKm)} by ${Math.round(wideKm)} km`,
    );
  });

  it('centres on the station', () => {
    const box = patchBounds(39.74, -104.98);
    assert.ok(box);
    assert.equal((box.latMin + box.latMax) / 2, 39.74);
    assert.ok(Math.abs((box.lonMin + box.lonMax) / 2 - -104.98) < 1e-9);
  });

  it('stops widening before it swallows a hemisphere', () => {
    // Without the cap, 1/cos runs away: at 85 degrees it would ask for
    // 115 degrees of longitude each side, which is thousands of points.
    const box = patchBounds(85, 0);
    assert.ok(box);
    assert.equal(box.lonMax - box.lonMin, 2 * PATCH_MAX_HALF_LON_DEG);
  });

  it('never asks for a latitude that does not exist', () => {
    const box = patchBounds(85, 0);
    assert.ok(box);
    assert.ok(box.latMax <= 90);
    assert.equal(box.latMax, 90);
    assert.equal(box.latMin, 75);
  });

  it('stays inside a few hundred points at any latitude', () => {
    // The cost claim. Each point is a full path prediction, so this is
    // what keeps the second run a fraction of a second rather than a
    // wait the user notices.
    const worst = [0, 20, 40, 60, 70, 80, 89].map((lat) => {
      const box = patchBounds(lat, 0);
      assert.ok(box, `no rectangle at ${lat}`);
      const rows = (box.latMax - box.latMin) / PATCH_LAT_STEP;
      const columns = (box.lonMax - box.lonMin) / PATCH_LON_STEP;
      return Math.ceil(rows) * Math.ceil(columns);
    });
    assert.ok(Math.max(...worst) <= 700, `worst is ${Math.max(...worst)}`);
  });
});

describe('the antimeridian, which no rectangle can cross', () => {
  it('narrows on both sides rather than trimming one', () => {
    // Trimming only the side that overran would move the detail off to
    // one side of the operator, and a reader would take that as the band
    // going further one way than the other.
    const box = patchBounds(0, 172);
    assert.ok(box);
    assert.equal(box.lonMax, 180);
    assert.equal(box.lonMin, 164);
    assert.equal((box.lonMin + box.lonMax) / 2, 172);
  });

  it('never asks for a longitude past the dateline', () => {
    for (let lon = -180; lon <= 180; lon += 1) {
      for (const lat of [0, 45, 80]) {
        const box = patchBounds(lat, lon);
        if (box === null) continue;
        assert.ok(box.lonMin >= -180, `${box.lonMin} at ${lat}, ${lon}`);
        assert.ok(box.lonMax <= 180, `${box.lonMax} at ${lat}, ${lon}`);
      }
    }
  });

  it('gives up only where too little is left to be worth a run', () => {
    // Right on the dateline there is no room; three degrees away there
    // is. Everywhere else has to have a rectangle, or the feature is
    // missing in places nobody would think to check.
    assert.equal(patchBounds(-18, 179), null);
    assert.ok(patchBounds(-18, 176));
    for (let lat = -85; lat <= 85; lat += 5) {
      for (let lon = -175; lon <= 175; lon += 5) {
        assert.ok(patchBounds(lat, lon), `no rectangle at ${lat}, ${lon}`);
      }
    }
  });
});

describe('how far the near-vertical region reaches', () => {
  const from = { lat: 40, lon: -105 };
  const point = (
    lat: number,
    lon: number,
    takeoffAngleDeg: number | null,
    reliability = 0.8,
  ): CoveragePoint => ({ lat, lon, reliability, takeoffAngleDeg });

  it('measures to the furthest steep point that works', () => {
    const km = nvisReachKm(from, [
      point(41, -105, 80),
      point(44, -105, 75),
      // Steep but dead, so it is not a place this band reaches.
      point(48, -105, 70, 0.05),
      // Working but shallow, which is an ordinary hop rather than this.
      point(60, -105, 12),
    ]);
    assert.ok(km !== null);
    // Four degrees of latitude, and nothing beyond it counted.
    assert.ok(Math.abs(km - 4 * KM_PER_DEGREE) < 5, `${km} km`);
  });

  it('answers nothing when the band works no other way', () => {
    // The ordinary case on a high band, and at night on any band. Null
    // rather than zero: zero is a distance and would be drawn as one.
    assert.equal(nvisReachKm(from, [point(41, -105, 20)]), null);
    assert.equal(nvisReachKm(from, []), null);
  });

  it('ignores a point the engine gave no angle for', () => {
    // An older cached answer, or the coarse grid, which does not carry
    // one. Absent is not steep.
    assert.equal(nvisReachKm(from, [point(41, -105, null)]), null);
    assert.equal(
      nvisReachKm(from, [{ lat: 41, lon: -105, reliability: 0.9 }]),
      null,
    );
  });
});

describe('choosing how fine to run', () => {
  const count = (g: NonNullable<ReturnType<typeof patchGrid>>) =>
    Math.ceil((g.latMax - g.latMin) / g.latStep)
    * Math.ceil((g.lonMax - g.lonMin) / g.lonStep);

  it('offers only steps that nest inside a coarse cell', () => {
    // Whichever rung is chosen, the fine cells have to line up with the
    // coarse ones under them rather than lying across their edges.
    for (const [latStep, lonStep] of PATCH_STEPS) {
      assert.equal((180 / latStep) % 1, 0, `${latStep} does not divide 180`);
      assert.equal((360 / lonStep) % 1, 0, `${lonStep} does not divide 360`);
      assert.equal(
        (LAT_STEP / latStep) % 1,
        0,
        `${latStep} does not divide the coarse step`,
      );
      assert.equal(
        (LON_STEP / lonStep) % 1,
        0,
        `${lonStep} does not divide the coarse step`,
      );
    }
  });

  it('lists them coarsest first, which is what the search relies on', () => {
    const lats = PATCH_STEPS.map(([lat]) => lat);
    assert.deepEqual([...lats].sort((a, b) => b - a), lats);
  });

  it('stays inside the budget at every latitude and zoom', () => {
    // The whole cost control. A rectangle that got finer without getting
    // smaller would be the whole-globe run this exists to avoid.
    for (const lat of [0, 20, 40, 60, 75, 85]) {
      for (const half of [10, 8, 6, 4, 2, 1]) {
        const grid = patchGrid(lat, 0, half);
        assert.ok(grid, `no grid at ${lat} with half ${half}`);
        assert.ok(
          count(grid) <= MAX_PATCH_POINTS,
          `${count(grid)} points at ${lat} with half ${half}`,
        );
      }
    }
  });

  it('buys a finer grid with a smaller rectangle rather than a cheaper run', () => {
    // Zooming in shrinks the rectangle, and the step follows it down.
    const wide = patchGrid(40, 0, 10);
    const tight = patchGrid(40, 0, 2);
    assert.ok(wide && tight);
    assert.ok(
      tight.latStep < wide.latStep,
      `${tight.latStep} vs ${wide.latStep}`,
    );
    assert.ok(tight.lonStep < wide.lonStep);
  });

  it('runs the default view at the step the fixed patch always used', () => {
    // The whole-globe view must not change: the projection is centred on
    // the station, so the view centre and the station are the same place.
    const grid = patchGrid(39.74, -104.98);
    assert.ok(grid);
    assert.equal(grid.latStep, PATCH_LAT_STEP);
    assert.equal(grid.lonStep, PATCH_LON_STEP);
    assert.deepEqual(
      {
        latMin: grid.latMin,
        latMax: grid.latMax,
        lonMin: grid.lonMin,
        lonMax: grid.lonMax,
      },
      patchBounds(39.74, -104.98),
    );
  });

  it('is never coarser than the map it is drawn over', () => {
    const grid = patchGrid(0, 0, 10);
    assert.ok(grid);
    assert.ok(grid.latStep <= LAT_STEP);
    assert.ok(grid.lonStep <= LON_STEP);
  });

  it('gives up where the fixed rectangle would', () => {
    assert.equal(patchGrid(-18, 179), null);
  });
});
