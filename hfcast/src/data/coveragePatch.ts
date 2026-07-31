/**
 * The fine grid drawn around the operator, on top of the coarse one.
 *
 * The whole-world map runs 15 by 22.5 degree cells. Near 40 degrees north
 * one of those is about 1,600 by 1,900 km, so everything a low band does
 * close to home happens inside a single cell and cannot be seen: 40m at
 * midday works by near-vertical incidence out to a few hundred kilometres
 * and then stops, and the coarse map draws that as one square either
 * coloured or not. This is a sampling limit rather than a drawing one, so
 * the answer is to run more points where the question is, not to smooth
 * the ones already run.
 *
 * The same step over the whole globe would be about a hundred times the
 * work. Over one region it is a few hundred points, and the engine takes a
 * rectangle for exactly this.
 *
 * These numbers are the server's too — `server/src/coveragePatch.ts` — and
 * `server/test/shared-with-app.test.ts` pins the two together.
 */

/**
 * Cell size in degrees.
 *
 * About 139 km north to south and, at 40 degrees, about 128 km east to
 * west — so a 500 km near-vertical footprint is seven or eight cells
 * across rather than a fraction of one.
 *
 * Both divide the world evenly, 144 rows and 240 columns, which is what
 * makes the patch a window on the same lattice the coarse grid uses: its
 * cells line up with the coarse cells under them instead of straddling
 * them.
 */
export const PATCH_LAT_STEP = 1.25;
export const PATCH_LON_STEP = 1.5;

/**
 * How far the patch reaches north and south of the station, in degrees.
 *
 * About 1,100 km, which is twice what the near-vertical region needs. The
 * margin is deliberate: the interesting edge is where that region ends,
 * and an edge drawn at the edge of the map cannot be seen to be an edge.
 */
export const PATCH_HALF_LAT_DEG = 10;

/**
 * The widest the patch is allowed to get in longitude.
 *
 * Meridians converge, so holding the width in kilometres means widening
 * it in degrees as the station moves toward a pole — and without a limit
 * that runs away: at 85 degrees north it would ask for 115 degrees of
 * longitude on each side, which is most of the hemisphere and thousands
 * of points. Past about 70 degrees the patch is therefore narrower in
 * kilometres than it is tall. The near-vertical region is still covered,
 * because the latitude range alone reaches 1,100 km.
 */
export const PATCH_MAX_HALF_LON_DEG = 30;

/**
 * The narrowest patch worth running, in degrees each side.
 *
 * Two cells. Below that the rectangle is thinner than the shape it is
 * meant to show, so it costs an engine run to draw a stripe.
 */
export const PATCH_MIN_HALF_LON_DEG = 2 * PATCH_LON_STEP;

/** The rectangle the engine is asked for, in degrees. */
export interface PatchBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

/**
 * The rectangle around a station, or null within a few degrees of the
 * antimeridian.
 *
 * The engine counts a rectangle's points eastward from its western edge,
 * so one running from 170 to -170 is not something it can express, and it
 * refuses rather than guessing. Near the dateline the rectangle is
 * therefore narrowed until it fits — narrowed on **both** sides, so it
 * stays centred on the station. Trimming only the side that overran would
 * move the detail off to one side of the operator and read as though the
 * band went further one way than the other.
 *
 * A narrowed patch shows less, and shows nothing false: the coarse map is
 * still drawn underneath it everywhere, so its edge reads the same way
 * the edge it has everywhere else does. Inside a few degrees of the
 * dateline there is not enough left to be worth a run, and the coarse map
 * answers alone.
 *
 * The fix is a rectangle stated in kilometres, which has no meridian in
 * it; the engine has that projection and does not yet offer it over JSON.
 */
export function patchBounds(lat: number, lon: number): PatchBounds | null {
  const wanted = Math.min(
    PATCH_MAX_HALF_LON_DEG,
    PATCH_HALF_LAT_DEG / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6),
  );
  const halfLon = Math.min(wanted, 180 - Math.abs(lon));
  if (halfLon < PATCH_MIN_HALF_LON_DEG) return null;
  const lonMin = lon - halfLon;
  const lonMax = lon + halfLon;

  return {
    // Clamped at the poles, where the rectangle asks for latitudes that
    // do not exist. The engine clamps too; doing it here as well keeps
    // the request describing something real.
    latMin: Math.max(-90, lat - PATCH_HALF_LAT_DEG),
    latMax: Math.min(90, lat + PATCH_HALF_LAT_DEG),
    lonMin,
    lonMax,
  };
}
