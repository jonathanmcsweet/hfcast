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
 * This mirrors `app/src/data/coveragePatch.ts`, and
 * `test/shared-with-app.test.ts` pins the two together. The reason they
 * are copies rather than one module is in that file.
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
 * The cell sizes a patch may use, coarsest first.
 *
 * Every rung divides the world evenly *and* divides a coarse cell evenly,
 * so whichever is chosen the fine cells nest inside the coarse ones under
 * them rather than lying across their edges. The first rung is the coarse
 * grid itself, which is the floor: a patch is never coarser than the map
 * it is drawn over.
 */
export const PATCH_STEPS: readonly (readonly [number, number])[] = [
  [15, 22.5],
  [7.5, 11.25],
  [5, 7.5],
  [2.5, 3.75],
  [PATCH_LAT_STEP, PATCH_LON_STEP],
  [0.625, 0.75],
];

/**
 * The most points a patch may ask for.
 *
 * This is the whole cost control, and it is a count rather than a step
 * because the rectangle changes size with the zoom: hold the count and
 * the run costs the same wherever the reader is looking. Measured at
 * 0.173 ms a point on this desktop, so 700 is about 120 ms there and
 * something under half a second on a phone — slow enough to be worth
 * running behind the coarse map, fast enough to follow a pan.
 */
export const MAX_PATCH_POINTS = 700;

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
export function patchBounds(
  lat: number,
  lon: number,
  halfLatDeg: number = PATCH_HALF_LAT_DEG,
): PatchBounds | null {
  // Never wider than the fixed rectangle, however far out the reader is
  // zoomed. Sized to the whole visible region instead, the rectangle at a
  // whole-globe view would be the world, the budget below would answer
  // with the coarse step, and the patch would be the map it is drawn over.
  const halfLat = Math.min(halfLatDeg, PATCH_HALF_LAT_DEG);
  const wanted = Math.min(
    PATCH_MAX_HALF_LON_DEG,
    halfLat / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6),
  );
  const halfLon = Math.min(wanted, 180 - Math.abs(lon));
  // The floor applies to what the dateline took away, not to what was
  // asked for. A reader zoomed right in wants a small rectangle and
  // should get one; a station beside the dateline asked for a large one
  // and cannot have it, and that is the case worth refusing.
  if (halfLon < Math.min(wanted, PATCH_MIN_HALF_LON_DEG)) return null;
  const lonMin = lon - halfLon;
  const lonMax = lon + halfLon;

  return {
    // Clamped at the poles, where the rectangle asks for latitudes that
    // do not exist. The engine clamps too; doing it here as well keeps
    // the request describing something real.
    latMin: Math.max(-90, lat - halfLat),
    latMax: Math.min(90, lat + halfLat),
    lonMin,
    lonMax,
  };
}

/** A rectangle and the cell size chosen to cover it. */
export interface PatchGrid extends PatchBounds {
  latStep: number;
  lonStep: number;
}

/**
 * Which cell of the world lattice a degree falls in, as a fraction.
 *
 * The engine divides an axis into whole cells from the far edge and puts
 * a point in the middle of each, so cell `i` is centred at
 * `edge + (i + 0.5) * step`. Every step this file offers divides its
 * axis evenly, so the cell width is the step.
 */
const cellIndex = (deg: number, step: number, edge: number) =>
  (deg - edge) / step - 0.5;

const cellCentre = (i: number, step: number, edge: number) =>
  edge + (i + 0.5) * step;

/**
 * The first and last cell of an axis a rectangle covers.
 *
 * The same arithmetic the engine does, so the answer describes the grid
 * that will run rather than the one that was asked for. Two things come
 * out of that: the request says what it means, and a view panned by less
 * than one cell produces the identical rectangle — which is what lets
 * the answer be cached against the view instead of refetched at every
 * pixel of a drag.
 */
const cellRange = (
  lo: number,
  hi: number,
  step: number,
  edge: number,
  span: number,
) => {
  const bands = Math.round(span / step);
  const first = Math.max(0, Math.ceil(cellIndex(lo, step, edge)));
  const last = Math.min(bands - 1, Math.floor(cellIndex(hi, step, edge)));
  return { first, last };
};

/**
 * The rectangle to run, and how finely, for a reader looking at
 * `lat`/`lon` with `halfLatDeg` of latitude visible either side.
 *
 * The centre is where the map is pointed rather than where the station
 * is, so panning at a zoom moves the detail to what is on screen. At the
 * default whole-globe view the two are the same place, because the
 * projection is centred on the station, so nothing changes there.
 *
 * The step is the finest rung whose point count fits the budget. That is
 * what keeps the cost flat: a smaller rectangle buys a finer grid rather
 * than a cheaper run. Null where there is no rectangle to ask for — see
 * `patchBounds`.
 */
export function patchGrid(
  lat: number,
  lon: number,
  halfLatDeg: number = PATCH_HALF_LAT_DEG,
): PatchGrid | null {
  const bounds = patchBounds(lat, lon, halfLatDeg);
  if (bounds === null) return null;

  const rows = (latStep: number) =>
    Math.ceil((bounds.latMax - bounds.latMin) / latStep);
  const columns = (lonStep: number) =>
    Math.ceil((bounds.lonMax - bounds.lonMin) / lonStep);

  // Coarsest first, so the last one that fits is the finest that fits.
  // The first rung is the coarse grid itself and always fits, which is
  // what makes this total rather than an option.
  const chosen = PATCH_STEPS.reduce<readonly [number, number]>(
    (best, step) =>
      rows(step[0]) * columns(step[1]) <= MAX_PATCH_POINTS ? step : best,
    PATCH_STEPS[0] as readonly [number, number],
  );
  const [latStep, lonStep] = chosen;

  const down = cellRange(bounds.latMin, bounds.latMax, latStep, -90, 180);
  const across = cellRange(bounds.lonMin, bounds.lonMax, lonStep, -180, 360);

  // `Grid::point` in the engine divides by the number of points less one,
  // so a single-point axis is a division by zero rather than a small
  // answer and the request is refused. Caught here so a doomed one is
  // never sent.
  if (down.last - down.first < 1 || across.last - across.first < 1) return null;

  return {
    latMin: cellCentre(down.first, latStep, -90),
    latMax: cellCentre(down.last, latStep, -90),
    lonMin: cellCentre(across.first, lonStep, -180),
    lonMax: cellCentre(across.last, lonStep, -180),
    latStep,
    lonStep,
  };
}

/**
 * The four edges to send the engine for a grid, in degrees.
 *
 * A quarter of a cell outside the first and last point rather than on
 * them. The engine rounds the near edge up to the next cell and the far
 * edge down to the previous one, so an edge sitting exactly on a point
 * is decided by the last bit of a division — a hair the wrong way and
 * the row is dropped. A quarter cell is far enough from both neighbours
 * that no rounding reaches them.
 *
 * The same reasoning, and the same number, as the strips the server cuts
 * a large grid into.
 */
export function patchRequestBounds(grid: PatchGrid): PatchBounds {
  return {
    latMin: grid.latMin - grid.latStep / 4,
    latMax: grid.latMax + grid.latStep / 4,
    lonMin: grid.lonMin - grid.lonStep / 4,
    lonMax: grid.lonMax + grid.lonStep / 4,
  };
}

/**
 * A short stable name for a grid, for use as a cache key.
 *
 * Two views that produce the same grid produce the same string, which is
 * the whole point: panning within one cell, or zooming without crossing
 * a rung of the step ladder, must not spend an engine run to receive the
 * answer already held.
 */
export const patchKey = (grid: PatchGrid | null): string =>
  grid === null ? 'none' : [
    grid.latMin,
    grid.latMax,
    grid.lonMin,
    grid.lonMax,
    grid.latStep,
    grid.lonStep,
  ].join(',');
