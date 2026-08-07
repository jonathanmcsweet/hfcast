import { useMemo } from 'react';

import land from '../../assets/land.json';
import { cellField, gridPoints, nvisPoints } from '../../data/cellField';
import {
  circleAround,
  discRing,
  EARTH_KM,
  greatCircle,
  gridOutline,
  isNight,
  nightIsInside,
  opposedTo,
  pathOf,
  projector,
  projectRing,
  subsolarPoint,
} from '../../data/projection';
import type {
  Coverage,
  CoveragePatch,
  Endpoint,
  FineGlobe,
} from '../../data/types';

/**
 * Everything the globe draws, as geometry.
 *
 * Split out of `CoverageGlobe` because it is the expensive half and it is
 * the half with nothing React about it: given a projection and the
 * answers, these are pure functions producing path strings. What is left
 * in the component is layout, controls and paint.
 *
 * The split is in two memos, and that is the point of it rather than a
 * tidying. The cells are the costly part — a whole-world fine grid is
 * 34,560 rings projected and written out as path text, measured at 141 ms
 * on a desktop — and the hour slider reports every value it passes
 * through. Only the terminator moves with the hour, and it is one ring of
 * a few hundred points, so it is cheap enough to rebuild on every frame of
 * a drag while the cells are not.
 *
 * The band and the settled hour still rebuild the cells, through
 * `coverage`, `patch` and `fine` — new answers are new objects. That is
 * the rebuild that has to happen.
 */

/** Dashed rings, in kilometres. The spacing operators think in. */
const RING_KM = [1000, 2000, 4000, 8000, 12000];

const RINGS = land as [number, number][][];

export function useGlobeGeometry(
  from: Endpoint,
  to: Endpoint | null,
  size: number,
  hour: number,
  coverage: Coverage | null | undefined,
  patch: CoveragePatch | null | undefined,
  fine: FineGlobe | null | undefined,
) {
  const p = useMemo(
    () => projector(from.lon, from.lat, size),
    [from.lon, from.lat, size],
  );

  const cells = useMemo(() => {
    // The cells, as one path per quality. The geometry and the bucketing
    // live in `cellField` because the canvas and the SVG fallback both
    // draw from them and must not be able to disagree.
    //
    // The fine grid replaces the coarse one outright when it is there.
    // Both answer the same question over the same world, so drawing the
    // coarse cells underneath would only show through the gaps of a
    // better answer. This is the progressive paint: the coarse map is
    // drawn from the first answer and swapped for the fine one when it
    // arrives, with nothing in between.
    const coarse = fine
      ? cellField(p, gridPoints(fine), fine.lonStep, fine.latStep, true)
      : cellField(
        p,
        coverage?.points ?? [],
        coverage?.lonStep ?? 22.5,
        coverage?.latStep ?? 15,
        true,
      );
    const reachBox = coarse.reachBox;

    // The fine grid, drawn the same way and over the top. It covers a
    // rectangle a few cells wide near the centre, so at a whole-globe
    // view it is a smudge; it is worth drawing anyway, because zooming in
    // is what the controls are for and the sentence under the map carries
    // the same fact for anyone who cannot.
    //
    // Deliberately left out of `reachBox` — the last argument — because
    // the Fit button frames where the band reaches and the patch is a
    // region rather than an answer about reach. Counting it would pull
    // the frame toward home on every band, whatever the band did.
    const patchField = cellField(
      p,
      patch?.points ?? [],
      patch?.lonStep ?? 1.5,
      patch?.latStep ?? 1.25,
      false,
    );

    // An opaque backing under the fine cells.
    //
    // Every cell on this map is drawn with some transparency — 0.6 for a
    // closed one — so a fine cell laid straight over a coarse one shows
    // the coarse colour through it, and the coarse cell's edges stay
    // visible across the region. That is worst exactly where the two
    // disagree, which is the whole reason the fine grid is run.
    //
    // Filling the rectangle with the disc's own colour first puts the
    // fine cells on the same background the coarse cells have, so the
    // same reliability is the same colour whichever grid drew it and the
    // legend means one thing.
    //
    // The patch is centred on the operator and the projection is centred
    // on the operator, so this rectangle is always at the middle of the
    // disc and never near the rim where a ring breaks into runs. The
    // check is here because "always" is a claim about two things staying
    // in step, not about this function.
    const patchOutline = patch
      ? projectRing(
        p,
        (() => {
          const ring = gridOutline(patch, patch.lonStep, patch.latStep);
          return [...ring, ring[0] as [number, number]];
        })(),
      )
      : [];
    const patchBacking = patchOutline.length === 1 && patchOutline[0]
      ? pathOf(patchOutline[0], true)
      : '';

    // The stipple follows whichever grid carries take-off angles for the
    // region: the fine globe when there is one, the patch otherwise.
    // Steep paths are short ones, so this is a small cluster near the
    // station either way, however many points were scanned to find it.
    const nvisDots = fine
      ? nvisPoints(p, gridPoints(fine))
      : nvisPoints(p, patch?.points ?? []);

    const coast = RINGS.flatMap((ring) =>
      projectRing(p, ring).map((run) => pathOf(run))
    );

    const distanceRings = RING_KM.map((km) => ({ km, r: km * p.pxPerKm }));

    const home = p.project(from.lon, from.lat);
    const target = to ? p.project(to.lon, to.lat) : null;
    const path = to
      ? projectRing(p, greatCircle(from.lon, from.lat, to.lon, to.lat))
        .map((run) => pathOf(run))
      : [];

    return {
      coarse: coarse.buckets,
      patchCells: patchField.buckets,
      patchBacking,
      nvisDots,
      coast,
      distanceRings,
      home,
      target,
      path,
      reachBox,
    };
  }, [p, coverage, patch, fine, from.lat, from.lon, to]);

  // The terminator, which is the only geometry the hour moves. Cheap —
  // one ring of a few hundred points — so the slider may rebuild it on
  // every value it reports.
  const night = useMemo(() => {
    // Night is the cap centred on the antisolar point — the place where it
    // is local midnight — bounded by the great circle a quarter of the way
    // round the earth from it, which is the terminator.
    const now = new Date();
    now.setUTCHours(hour, 0, 0, 0);
    const [sunLon, sunLat] = subsolarPoint(now);
    const antiLon = ((sunLon + 180 + 540) % 360) - 180;
    const nightRuns = projectRing(
      p,
      circleAround(antiLon, -sunLat, (Math.PI / 2) * EARTH_KM),
    );
    // One closed curve is the normal case. It only breaks into pieces when
    // the terminator passes within half a degree of the point opposite the
    // operator, and a broken curve cannot be filled — that is drawn as a
    // line alone rather than as a guess.
    const terminator = nightRuns.length === 1 ? nightRuns[0] : undefined;
    const nightInside = terminator === undefined
      ? true
      : nightIsInside(
        terminator,
        p.cx,
        p.cy,
        isNight(from.lon, from.lat, now),
      );
    // When night is the outer region, the fill is the whole disc with the
    // lit part cut out of it. The two rings are wound opposite ways so the
    // cut works under either fill rule.
    const nightFill = terminator === undefined
      ? ''
      : nightInside
      ? pathOf(terminator, true)
      : (() => {
        const rim = discRing(p.cx, p.cy, p.radius);
        return `${pathOf(rim, true)} ${
          pathOf(opposedTo(terminator, rim), true)
        }`;
      })();

    // The dashed edge, already as path text. The component draws paint,
    // not geometry — a closed curve where there is one, and the open runs
    // where the terminator broke into pieces near the far point.
    const nightPaths = nightRuns.map((run) =>
      pathOf(run, terminator !== undefined)
    );

    return { nightPaths, terminator, nightFill };
  }, [p, from.lat, from.lon, hour]);

  // One object, so every reader below is unchanged. Both halves are
  // memoised, so this only rebuilds when one of them does.
  return useMemo(
    () => ({ ...cells, ...night, p }),
    [cells, night, p],
  );
}
