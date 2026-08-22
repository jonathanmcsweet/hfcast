/**
 * `src/render/available.ts` as the legacy build sees it.
 *
 * `tools/build-android.sh` copies `legacy/render/` over `src/render/`
 * for the legacy build, which draws the cell buckets as SVG paths.
 * Saying so here is what sends `CoverageGlobe` down that path, and what
 * keeps the whole-world fine grid from being asked for, since SVG cannot
 * hold 34,560 elements.
 *
 * The local `cell-canvas` module would work here — it uses nothing newer
 * than Android 5.0 and `legacy/modules/cell-canvas/` already carries its
 * gradle file. Left off until the legacy build has been tested on a
 * device, which is the same reason it is kept off F-Droid.
 */
export const hasCanvas = false;
