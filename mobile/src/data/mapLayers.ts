import type { BandKey } from './types';

/** Anything the map draws carries the question it answers. */
export interface Answered {
  band: BandKey;
  hour: number;
}

/**
 * A layer, but only where it answers the question the map is showing.
 *
 * The map draws three layers over one another — the coarse grid, the
 * whole-world fine grid, and the viewport patch — and each is a query of
 * its own with its own timing. All three are held across a band or hour
 * change, so the old map stays on screen instead of blanking while the
 * new one is computed. That is what a reader wants.
 *
 * What a reader does not want is half of one band drawn over half of
 * another, and that is not hypothetical. Any layer already in the cache
 * returns at once while the slowest layer is still being computed, so
 * the patch was the band just chosen and the grid under it was the band
 * before. On 80m, where almost nothing is reachable, that painted a
 * black rectangle over a purple 40m map. Keeping answers for an hour
 * did not cause this — a five-minute cache does it too — but it turned
 * a narrow window into most band changes a reader makes.
 *
 * So a layer is checked against what the map is showing rather than
 * trusted for being present. Holding still works; all three hold
 * together, at one band and one hour, or the newer ones wait.
 */
export const answering = <T extends Answered>(
  layer: T | null | undefined,
  showing: Answered | null | undefined,
): T | null =>
  layer !== null
    && layer !== undefined
    && showing !== null
    && showing !== undefined
    && layer.band === showing.band
    && layer.hour === showing.hour
    ? layer
    : null;
