import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cellRing,
  destination,
  EARTH_KM,
  greatCircle,
  projector,
  projectRing,
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
