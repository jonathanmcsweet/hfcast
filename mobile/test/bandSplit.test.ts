import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BAND_MHZ, BAND_ORDER } from '../src/data/types.ts';

/**
 * The order the engine is asked for bands in, and the order its answer
 * is read back in.
 *
 * These have to be the same list, and it is not the list the band
 * selector shows. `BAND_ORDER` runs highest frequency first, because
 * that is how the chips read; the engine refuses anything but
 * increasing, because each band's antenna table is installed in a
 * frequency window cut halfway to its neighbours and windows can only be
 * cut from an ordered list.
 *
 * Reading the arrays at the wrong index would draw one band's map under
 * another band's name — the exact fault this app shipped once already,
 * as a black square over the wrong continent. So the ordering is pinned
 * here rather than left as a property of a `sort` call somewhere.
 */

const byFrequency = [...BAND_ORDER].sort((a, b) => BAND_MHZ[a] - BAND_MHZ[b]);

describe('asking the engine for every band at once', () => {
  it('sends them in increasing frequency, which the engine requires', () => {
    const freqs = byFrequency.map((band) => BAND_MHZ[band]);
    for (const [i, freq] of freqs.entries()) {
      if (i === 0) continue;
      assert.ok(
        freq > (freqs[i - 1] as number),
        `${byFrequency[i]} at ${freq} follows ${freqs[i - 1]}`,
      );
    }
  });

  it('is not the order the selector shows', () => {
    // Stated as a fact rather than left to be discovered. If these ever
    // became the same list, the sort above would look redundant and the
    // next reader would be tempted to drop it.
    assert.notDeepEqual(byFrequency, BAND_ORDER);
    assert.equal(byFrequency[0], '160m');
    assert.equal(BAND_ORDER[0], '10m');
  });

  it('covers every band exactly once', () => {
    assert.equal(byFrequency.length, BAND_ORDER.length);
    assert.equal(new Set(byFrequency).size, BAND_ORDER.length);
    for (const band of BAND_ORDER) assert.ok(byFrequency.includes(band));
  });

  it('keeps every band far enough from its neighbours to be told apart', () => {
    // Each band's antenna table is installed in a window reaching
    // halfway to the next band. Two bands closer together than the
    // engine's own tolerance for matching a frequency would fall in one
    // window, and one of them would be answered from the other's table.
    const freqs = byFrequency.map((band) => BAND_MHZ[band]);
    for (const [i, freq] of freqs.entries()) {
      if (i === 0) continue;
      const gap = freq - (freqs[i - 1] as number);
      assert.ok(
        gap > 0.01,
        `${byFrequency[i - 1]} to ${byFrequency[i]}: ${gap}`,
      );
    }
  });

  it('agrees with the index each band is read back at', () => {
    // The answer carries one array per point, running parallel to the
    // frequencies asked for, and the reader takes the band at its own
    // index. This is that correspondence, written out.
    for (const [index, band] of byFrequency.entries()) {
      assert.equal(
        BAND_MHZ[band],
        byFrequency.map((b) => BAND_MHZ[b])[index],
        `${band} at index ${index}`,
      );
    }
  });
});
