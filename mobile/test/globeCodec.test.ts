import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ANGLE_STEP_DEG,
  decodeGlobe,
  encodeGlobe,
  FORMAT_VERSION,
  globeFileBytes,
  HEADER_BYTES,
  RELIABILITY_STEP,
} from '../src/data/globeCodec.ts';
import { qualityFor } from '../src/data/quality.ts';
import type { FineGlobe } from '../src/data/types.ts';

/**
 * A stored grid is read by a build that did not write it, from a file
 * that may be truncated, foreign or old. These tests hold both halves of
 * that: that a grid survives the round trip closely enough to draw the
 * same map, and that everything else is refused rather than read.
 */

/** A grid shaped like the real one, with values spread over both ranges. */
function gridOf(nx: number, ny: number): FineGlobe {
  const points = nx * ny;
  const reliability = new Float32Array(points);
  const takeoffAngleDeg = new Float32Array(points);
  for (let i = 0; i < points; i += 1) {
    reliability[i] = (i % 1001) / 1000;
    takeoffAngleDeg[i] = ((i % 91) * 90) / 90;
  }
  return {
    band: '20m',
    hour: 18,
    latMin: -89.375,
    lonMin: -180,
    latStep: 1.25,
    lonStep: 1.5,
    nx,
    ny,
    reliability,
    takeoffAngleDeg,
  };
}

describe('a grid that goes to bytes and back', () => {
  const original = gridOf(240, 144);
  const returned = decodeGlobe(encodeGlobe(original));

  it('keeps the lattice exactly', () => {
    // Every one of these places a cell on the map. A byte lost here
    // draws the whole world in the wrong place, so none of them is
    // quantised and all of them must come back unchanged.
    assert.equal(returned.nx, original.nx);
    assert.equal(returned.ny, original.ny);
    assert.equal(returned.latMin, original.latMin);
    assert.equal(returned.lonMin, original.lonMin);
    assert.equal(returned.latStep, original.latStep);
    assert.equal(returned.lonStep, original.lonStep);
  });

  it('keeps the band and the hour it was computed for', () => {
    assert.equal(returned.band, original.band);
    assert.equal(returned.hour, original.hour);
  });

  it('keeps every reliability within one step', () => {
    // A loop rather than a functional form: this compares two typed
    // arrays of 34,560 entries, and the point is the worst entry.
    let worst = 0;
    for (let i = 0; i < original.reliability.length; i += 1) {
      const off = Math.abs(
        (returned.reliability[i] as number)
          - (original.reliability[i] as number),
      );
      if (off > worst) worst = off;
    }
    assert.ok(
      worst <= RELIABILITY_STEP,
      `worst reliability error was ${worst}`,
    );
  });

  it('keeps every take-off angle within one step', () => {
    let worst = 0;
    for (let i = 0; i < original.takeoffAngleDeg.length; i += 1) {
      const off = Math.abs(
        (returned.takeoffAngleDeg[i] as number)
          - (original.takeoffAngleDeg[i] as number),
      );
      if (off > worst) worst = off;
    }
    assert.ok(worst <= ANGLE_STEP_DEG, `worst angle error was ${worst}`);
  });
});

describe('what the stored form costs', () => {
  it('is a quarter of what the grid costs in memory', () => {
    const grid = gridOf(240, 144);
    const inMemory = grid.reliability.byteLength
      + grid.takeoffAngleDeg.byteLength;
    const onDisk = encodeGlobe(grid).length;
    assert.equal(onDisk, globeFileBytes(240 * 144));
    assert.ok(
      onDisk < inMemory / 3.9,
      `${onDisk} bytes against ${inMemory} in memory`,
    );
  });

  it('says the real fine grid is about 67 KB', () => {
    // 34,560 points is the whole-world fine grid. This number is what
    // the settings screen multiplies to estimate a whole year, so it is
    // written down here rather than only in a comment.
    assert.equal(globeFileBytes(34560), HEADER_BYTES + 69120);
  });
});

describe('a missing take-off angle', () => {
  it('comes back missing rather than as an angle', () => {
    // `isNvis` asks whether the angle is at least 60 degrees. Any real
    // number answers that question, so a point the engine gave no angle
    // for has to come back as NaN and not as zero.
    const grid = gridOf(4, 2);
    grid.takeoffAngleDeg[3] = Number.NaN;
    const returned = decodeGlobe(encodeGlobe(grid));
    assert.ok(Number.isNaN(returned.takeoffAngleDeg[3] as number));
    assert.ok(!Number.isNaN(returned.takeoffAngleDeg[2] as number));
  });
});

describe('reliability at the colour boundaries', () => {
  it('changes the colour of a cell only next to a boundary', () => {
    // The documented cost of one byte a value. A cell can cross a
    // boundary, but only one within a step of it — the map cannot gain
    // a patch of the wrong colour somewhere in the middle of a band.
    const steps = 4000;
    const points = steps + 1;
    const grid = gridOf(points, 1);
    for (let i = 0; i <= steps; i += 1) grid.reliability[i] = i / steps;
    const returned = decodeGlobe(encodeGlobe(grid));

    for (let i = 0; i <= steps; i += 1) {
      const was = grid.reliability[i] as number;
      const now = returned.reliability[i] as number;
      if (qualityFor(was) === qualityFor(now)) continue;
      const boundary = [0.15, 0.4, 0.7].some(
        (edge) => Math.abs(was - edge) <= RELIABILITY_STEP,
      );
      assert.ok(
        boundary,
        `${was} became ${now} and changed colour away from a boundary`,
      );
    }
  });
});

describe('bytes that are not a grid this build can read', () => {
  const good = encodeGlobe(gridOf(8, 4));

  it('refuses a file that is not ours', () => {
    const foreign = Uint8Array.from(good);
    foreign[0] = 0x50;
    assert.throws(() => decodeGlobe(foreign), /not a stored grid/);
  });

  it('refuses a version it does not know', () => {
    const later = Uint8Array.from(good);
    new DataView(later.buffer).setUint16(4, FORMAT_VERSION + 1, true);
    assert.throws(() => decodeGlobe(later), /version/);
  });

  it('refuses a half-written file', () => {
    // What an interrupted write leaves behind. It has to read as "there
    // is no grid here" rather than as a grid of the wrong size.
    assert.throws(
      () => decodeGlobe(good.subarray(0, good.length - 40)),
      /needs/,
    );
  });

  it('refuses bytes too short to hold a header', () => {
    assert.throws(() => decodeGlobe(new Uint8Array(8)), /shorter/);
  });

  it('refuses a band name it does not know', () => {
    const odd = Uint8Array.from(good);
    odd.set(Uint8Array.from('99m ', (each) => each.charCodeAt(0)), 12);
    assert.throws(() => decodeGlobe(odd), /band/);
  });
});

describe('a grid that does not describe itself', () => {
  it('is refused rather than written', () => {
    // A grid whose arrays are not `nx * ny` long is already wrong in
    // memory. Writing it would leave a file that reads back as a map
    // with every cell displaced, which looks ordinary and is not.
    const grid = gridOf(8, 4);
    const short = { ...grid, reliability: new Float32Array(10) };
    assert.throws(() => encodeGlobe(short), /carries/);
  });

  it('is refused when the hour is not one', () => {
    const grid = { ...gridOf(4, 2), hour: 24 };
    assert.throws(() => encodeGlobe(grid), /not an hour/);
  });
});

describe('values outside their range', () => {
  it('are brought back into it rather than wrapping', () => {
    // A reliability of 1.2 stored in one byte would wrap to near zero
    // and draw a working path as a closed one.
    const grid = gridOf(4, 2);
    grid.reliability[0] = 1.4;
    grid.reliability[1] = -0.3;
    grid.takeoffAngleDeg[0] = 120;
    const returned = decodeGlobe(encodeGlobe(grid));
    assert.equal(returned.reliability[0], 1);
    assert.equal(returned.reliability[1], 0);
    assert.equal(returned.takeoffAngleDeg[0], 90);
  });
});
