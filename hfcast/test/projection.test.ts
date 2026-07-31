import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  angularDistanceDeg,
  cellRing,
  circleAround,
  destination,
  discRing,
  EARTH_KM,
  greatCircle,
  gridOutline,
  isNight,
  nightIsInside,
  opposedTo,
  polygonContains,
  projector,
  projectRing,
  signedArea,
  subsolarPoint,
} from '../src/data/projection.ts';

/**
 * The map is a claim about geometry, and these are the claims.
 *
 * Worth testing rather than eyeballing: a projection that is subtly wrong
 * still looks like a globe. Every check here is a property an operator
 * would act on — a ring that is a real distance, a bearing that is a real
 * angle — so a regression in any of them is a map that lies.
 */

const SIZE = 322;
const LON = -122.33;
const LAT = 47.61;
const CENTRE = SIZE / 2;

describe('the azimuthal equidistant projection', () => {
  const p = projector(LON, LAT, SIZE);

  it('puts the operator at the centre of the disc', () => {
    const home = p.project(LON, LAT);
    assert.ok(home, 'the centre must project');
    assert.ok(Math.abs(home[0] - CENTRE) < 1e-6);
    assert.ok(Math.abs(home[1] - CENTRE) < 1e-6);
  });

  it('keeps distance from the centre to scale at every bearing', () => {
    // The property the whole map rests on. Without it a distance ring is
    // decoration and the shape of the coverage wash means nothing.
    let worst = 0;
    for (const km of [1000, 2000, 4000, 8000, 12000, 19000]) {
      for (let bearing = 0; bearing < 360; bearing += 15) {
        const [lon, lat] = destination(LON, LAT, bearing, km);
        const q = p.project(lon, lat);
        if (q === null) continue;
        const px = Math.hypot(q[0] - CENTRE, q[1] - CENTRE);
        worst = Math.max(worst, Math.abs(px - km * p.pxPerKm));
      }
    }
    assert.ok(worst < 0.01, `worst error ${worst} px`);
  });

  it('preserves bearing from the centre', () => {
    const north = p.project(...destination(LON, LAT, 0, 3000));
    const east = p.project(...destination(LON, LAT, 90, 3000));
    assert.ok(north && east, 'both must be inside the disc');
    assert.ok(Math.abs(north[0] - CENTRE) < 0.01);
    assert.ok(north[1] < CENTRE, 'north is up');
    assert.ok(Math.abs(east[1] - CENTRE) < 0.01);
    assert.ok(east[0] > CENTRE, 'east is right');
  });

  it('clips the antipode rather than smearing it round the rim', () => {
    // The point opposite the operator projects to the entire rim at once.
    // A polygon containing it would wrap the whole circle and paint over
    // the map.
    assert.equal(p.project(LON + 180, -LAT), null);
  });

  it('survives a point at the exact centre without dividing by zero', () => {
    // The scale factor there is 0/0; the limit is 1.
    const home = p.project(LON, LAT);
    assert.ok(home);
    assert.ok(Number.isFinite(home[0]) && Number.isFinite(home[1]));
  });

  it('returns separate runs for a ring that leaves the disc', () => {
    // A coastline that disappears over the far edge and comes back must
    // not be joined by a straight line across the middle of the map.
    const far = Math.PI * EARTH_KM * 0.9999;
    const runs = projectRing(p, [
      destination(LON, LAT, 0, 1000),
      destination(LON, LAT, 0, 3000),
      destination(LON, LAT, 0, far),
      destination(LON, LAT, 180, far),
      destination(LON, LAT, 180, 3000),
      destination(LON, LAT, 180, 1000),
    ]);
    assert.equal(runs.length, 2);
    for (const run of runs) assert.equal(run.length, 2);
  });
});

describe('grid cells', () => {
  it('subdivides every edge rather than joining four corners', () => {
    // A cell 22.5 degrees wide is a curve in this projection. Four corners
    // leave white wedges between neighbours.
    assert.equal(cellRing(0, 0, 22.5, 15).length, 16);
  });

  it('stays inside its own bounds', () => {
    for (const [lon, lat] of cellRing(0, 0, 22.5, 15)) {
      assert.ok(lon >= -11.26 && lon <= 11.26);
      assert.ok(lat >= -7.51 && lat <= 7.51);
    }
  });

  it('clamps a polar cell at the pole instead of folding over it', () => {
    const polar = cellRing(0, 82.5, 22.5, 15);
    for (const [, lat] of polar) assert.ok(lat <= 90);
  });
});

describe('great circles', () => {
  it('starts and ends where it was asked to', () => {
    const gc = greatCircle(LON, LAT, 139.77, 35.68);
    const first = gc.at(0);
    const last = gc.at(-1);
    assert.ok(first && last, 'a path needs both ends');
    assert.ok(Math.abs(first[0] - LON) < 1e-6);
    assert.ok(Math.abs(first[1] - LAT) < 1e-6);
    assert.ok(Math.abs(last[0] - 139.77) < 1e-6);
    assert.ok(Math.abs(last[1] - 35.68) < 1e-6);
  });

  it('arcs north of both ends on a Pacific path', () => {
    // Seattle to Tokyo goes over the Aleutians, not across the middle of
    // the Pacific. A path drawn straight in longitude would be wrong by
    // thousands of kilometres, and wrong about which bands work.
    const gc = greatCircle(LON, LAT, 139.77, 35.68);
    const peak = Math.max(...gc.map(([, lat]) => lat));
    assert.ok(peak > 50, `peak latitude ${peak}`);
  });

  it('handles both ends being the same place', () => {
    assert.deepEqual(greatCircle(LON, LAT, LON, LAT), [[LON, LAT]]);
  });
});

describe('the subsolar point', () => {
  it('is over the prime meridian at noon UTC', () => {
    const [lon] = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 12, 0)));
    assert.ok(Math.abs(lon) < 1, `lon ${lon}`);
  });

  it('is over the antimeridian at midnight UTC', () => {
    const [lon] = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 0, 0)));
    assert.ok(Math.abs(Math.abs(lon) - 180) < 1, `lon ${lon}`);
  });

  it('is over the tropic of Cancer at the June solstice', () => {
    const [, lat] = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 12, 0)));
    assert.ok(lat > 22 && lat < 24, `declination ${lat}`);
  });

  it('is over the tropic of Capricorn at the December solstice', () => {
    const [, lat] = subsolarPoint(new Date(Date.UTC(2026, 11, 21, 12, 0)));
    assert.ok(lat < -22 && lat > -24, `declination ${lat}`);
  });
});

describe('day and night', () => {
  // Atlanta, five hours behind UTC.
  const ATL_LON = -84.39;
  const ATL_LAT = 33.75;
  const at = (hour: number) => new Date(Date.UTC(2026, 6, 29, hour, 0));

  it('measures the angle between two points', () => {
    assert.ok(Math.abs(angularDistanceDeg(0, 0, 0, 90) - 90) < 1e-9);
    assert.ok(Math.abs(angularDistanceDeg(0, 0, 180, 0) - 180) < 1e-9);
    assert.equal(angularDistanceDeg(12, 34, 12, 34), 0);
  });

  it('puts mid-morning in daylight and the small hours in darkness', () => {
    // 15:00 UTC is 10:00 in Atlanta, 09:00 UTC is 04:00.
    assert.equal(isNight(ATL_LON, ATL_LAT, at(15)), false);
    assert.equal(isNight(ATL_LON, ATL_LAT, at(9)), true);
  });

  it('has the far side of the earth in the opposite state', () => {
    for (const hour of [0, 6, 12, 18]) {
      const here = isNight(ATL_LON, ATL_LAT, at(hour));
      const there = isNight(ATL_LON + 180, -ATL_LAT, at(hour));
      assert.notEqual(here, there, `hour ${hour}`);
    }
  });

  it('finds whether a polygon encloses a point', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
    assert.equal(polygonContains(square, 5, 5), true);
    assert.equal(polygonContains(square, 15, 5), false);
    assert.equal(polygonContains(square, 5, -1), false);
  });

  it('shades the dark side rather than the lit one', () => {
    // The bug this guards against: the terminator is a closed curve, and
    // which side of it is dark flips through the day. Filling the inside
    // unconditionally shaded Atlanta in broad daylight.
    const size = 322;
    for (const hour of [0, 3, 6, 9, 12, 15, 18, 21]) {
      const when = at(hour);
      const [sunLon, sunLat] = subsolarPoint(when);
      const antiLon = ((sunLon + 180 + 540) % 360) - 180;
      const p = projector(ATL_LON, ATL_LAT, size);
      const runs = projectRing(
        p,
        circleAround(antiLon, -sunLat, (Math.PI / 2) * EARTH_KM),
      );
      const terminator = runs[0];
      assert.ok(terminator, `hour ${hour}: the terminator must project`);
      assert.equal(runs.length, 1, `hour ${hour}: one closed curve`);

      const dark = isNight(ATL_LON, ATL_LAT, when);
      const inside = nightIsInside(terminator, p.cx, p.cy, dark);
      // Whatever the geometry, the region that gets shaded must be the one
      // the operator is in exactly when it is dark where they are.
      const centreGetsShaded = inside === polygonContains(
        terminator,
        p.cx,
        p.cy,
      );
      assert.equal(centreGetsShaded, dark, `hour ${hour}`);
    }
  });
});

describe('cutting one shape out of another', () => {
  it('winds the two rings in opposite directions', () => {
    // The night fill is the disc with the lit part removed. Under the
    // non-zero rule that only makes a hole if the two rings wind opposite
    // ways; under even-odd it works either way. Doing it here means the
    // map does not depend on which rule the renderer applies.
    const rim = discRing(100, 100, 50);
    const inner = discRing(100, 100, 20);
    const cut = opposedTo(inner, rim);
    assert.notEqual(Math.sign(signedArea(cut)), Math.sign(signedArea(rim)));
  });

  it('leaves a ring alone when it already opposes', () => {
    const rim = discRing(0, 0, 10);
    const already = [...discRing(0, 0, 4)].reverse();
    assert.deepEqual(opposedTo(already, rim), already);
  });

  it('gives the rim a non-zero area', () => {
    assert.ok(Math.abs(signedArea(discRing(0, 0, 10))) > 300);
  });
});

describe('the outline round a whole grid of cells', () => {
  // The fine grid is drawn over the coarse one, and every cell on this
  // map is partly transparent, so the region has to be cleared first or
  // the coarse colours show through. That backing is this outline, and if
  // it is half a step small a hairline of coarse colour is left round the
  // edge — which is exactly what the fine grid was run to replace.
  const bounds = {
    lonMin: -117.75,
    lonMax: -92.25,
    latMin: 30.625,
    latMax: 49.375,
  };
  const lonStep = 1.5;
  const latStep = 1.25;

  it('reaches the outer edge of the outermost cells', () => {
    const ring = gridOutline(bounds, lonStep, latStep);
    const lons = ring.map(([lon]) => lon);
    const lats = ring.map(([, lat]) => lat);
    // The bounds name the first and last point; a cell round a point
    // reaches half a step further.
    assert.equal(Math.min(...lons), bounds.lonMin - lonStep / 2);
    assert.equal(Math.max(...lons), bounds.lonMax + lonStep / 2);
    assert.equal(Math.min(...lats), bounds.latMin - latStep / 2);
    assert.equal(Math.max(...lats), bounds.latMax + latStep / 2);
  });

  it('covers every cell the grid holds and no more', () => {
    // Walked against the cells themselves rather than against the
    // arithmetic above, so the two cannot be wrong the same way.
    const ring = gridOutline(bounds, lonStep, latStep);
    const lons = ring.map(([lon]) => lon);
    const lats = ring.map(([, lat]) => lat);
    for (let lat = bounds.latMin; lat <= bounds.latMax + 1e-9; lat += latStep) {
      for (
        let lon = bounds.lonMin;
        lon <= bounds.lonMax + 1e-9;
        lon += lonStep
      ) {
        for (
          const [cornerLon, cornerLat] of cellRing(lon, lat, lonStep, latStep)
        ) {
          assert.ok(
            cornerLon >= Math.min(...lons) - 1e-9,
            `${cornerLon} is west of the outline`,
          );
          assert.ok(
            cornerLon <= Math.max(...lons) + 1e-9,
            `${cornerLon} is east of the outline`,
          );
          assert.ok(
            cornerLat >= Math.min(...lats) - 1e-9,
            `${cornerLat} is south of the outline`,
          );
          assert.ok(
            cornerLat <= Math.max(...lats) + 1e-9,
            `${cornerLat} is north of the outline`,
          );
        }
      }
    }
  });

  it('subdivides its edges more finely than one cell does', () => {
    // An edge many cells long needs more segments to stay a curve, or the
    // backing cuts corners the cells on top of it do not.
    assert.ok(
      gridOutline(bounds, lonStep, latStep).length
        > cellRing(0, 0, 22.5, 15).length,
    );
  });
});
