import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { answering } from '../src/data/mapLayers.ts';

/**
 * One band and one hour on the map at a time.
 *
 * The map draws three layers over one another, each from its own query
 * with its own timing, and all three are held across a change so the
 * old map stays up instead of blanking. Holding is right. Holding some
 * layers and not others is not: it draws half of one band over half of
 * another, and both halves look like ordinary map.
 *
 * The case that found this: 80m reaches almost nothing, so its patch is
 * a black rectangle, and it came back from the cache at once while 40m's
 * purple fine grid was still underneath.
 */

const coarse = { band: '40m' as const, hour: 3 };

describe('drawing one band and one hour at a time', () => {
  it('draws a layer that answers the same question', () => {
    const fine = { band: '40m' as const, hour: 3, nx: 288 };
    assert.equal(answering(fine, coarse), fine);
  });

  it('refuses a layer left over from another band', () => {
    // The reported fault, in the numbers that produced it.
    const patch80 = { band: '80m' as const, hour: 3 };
    assert.equal(answering(patch80, coarse), null);
  });

  it('refuses a layer left over from another hour', () => {
    assert.equal(answering({ band: '40m' as const, hour: 4 }, coarse), null);
  });

  it('draws nothing extra before the coarse grid has landed', () => {
    // Nothing says which question the map is showing yet, so a held
    // layer cannot be known to answer it.
    const fine = { band: '40m' as const, hour: 3 };
    assert.equal(answering(fine, undefined), null);
    assert.equal(answering(fine, null), null);
  });

  it('has nothing to draw when the layer is absent', () => {
    // The patch is null near the antimeridian, where no rectangle can be
    // asked for, and undefined before it has ever run.
    assert.equal(answering(undefined, coarse), null);
    assert.equal(answering(null, coarse), null);
  });

  it('keeps every layer when they agree, however old they are', () => {
    // Holding still works. A reader who changes band should keep seeing
    // the previous map until the new one is ready — all of it, not the
    // parts that happened to arrive.
    const held = { band: '20m' as const, hour: 11 };
    const heldFine = { band: '20m' as const, hour: 11, nx: 288 };
    const heldPatch = { band: '20m' as const, hour: 11, latStep: 0.25 };
    assert.equal(answering(heldFine, held), heldFine);
    assert.equal(answering(heldPatch, held), heldPatch);
  });
});
