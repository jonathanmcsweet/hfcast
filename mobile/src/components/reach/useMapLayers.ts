import { useCallback, useState } from 'react';

import { useCoverage, useCoveragePatch, useFineGlobe } from '../../api/queries';
import { gridPoints } from '../../data/cellField';
import { patchGrid } from '../../data/coveragePatch';
import { FINE_LAT_STEP } from '../../data/fineGlobe';
import { answering } from '../../data/mapLayers';
import { anyNvis, nvisReachKm } from '../../data/quality';
import type {
  BandKey,
  CoveragePoint,
  Endpoint,
  MapRegion,
} from '../../data/types';
import { useShownFor } from '../../hooks/useShownFor';

/**
 * The map's answers: which layers are on screen, what they say, and
 * whether anything is still coming.
 *
 * Four queries, gated against each other, and the readings taken out of
 * whichever grid holds the station. That is the whole of what the card
 * had to know before it could draw one square, and none of it is about
 * layout, so it is here and the card is the picture.
 */

/**
 * The shortest time the map's progress bar stays on screen.
 *
 * The bar appears the moment any of the map's layers starts, and this is
 * the floor under how long it is visible. Long enough to be seen and read
 * as feedback; short enough that a coarse run of 40 ms is not followed by
 * a bar sitting on a finished map.
 */
const MAP_BUSY_MIN_MS = 500;

/**
 * Which grid the map is drawn from, in words.
 *
 * The map shows coarse squares and fine ones the same way — as squares —
 * so a reader looking at a coarse map cannot tell whether the fine one
 * is still coming or has arrived and covers only the area around the
 * station. The progress bar above says that something is happening;
 * this says what the map currently is.
 *
 * Null where there is nothing to say, which is a map with no detail
 * layer of any kind on it and one still coming.
 */
const detailKey = (hasFine: boolean, hasPatch: boolean): string | null => {
  if (hasFine) return 'reach.detailWorld';
  return hasPatch ? 'reach.detailNear' : null;
};

export function useMapLayers(from: Endpoint, band: BandKey, hour: number) {
  // What the map is showing, so the fine grid follows the view rather
  // than staying around the station. Held here rather than inside the
  // map because it is the queries that need it.
  const [region, setRegion] = useState<MapRegion | null>(null);
  // Stable, so reporting the region does not rebuild the effect that
  // reports it.
  const onRegion = useCallback(
    (next: MapRegion | null) =>
      setRegion((prev) =>
        // The same values keep the old object. The map re-reports its
        // region whenever its geometry rebuilds — a patch arriving, the
        // hour changing — and each report is a fresh object; passed on
        // as-is, every one would restart the settle timer downstream for
        // a view that had not moved.
        prev !== null && next !== null
          && prev.lat === next.lat
          && prev.lon === next.lon
          && prev.halfLatDeg === next.halfLatDeg
          ? prev
          : next
      ),
    [],
  );

  const { data: coverage, error, isFetching: coarseRunning } = useCoverage(
    from,
    band,
    hour,
  );
  // Never awaited and never blocking: the map is drawn from the coarse
  // answer above and this fills in behind it. Its own failure is silent,
  // because nothing on the screen depends on it. Asked once per band and
  // hour, with nothing about the view in its key, so panning and zooming
  // never ask again.
  const { data: fineData, isFetching: fineRunning } = useFineGlobe(
    from,
    band,
    hour,
  );
  // The coarse grid is the cheapest of the three and settles first, so
  // it decides which band and hour the map is showing. The other two are
  // drawn only where they agree with it — see `answering`.
  const fine = answering(fineData, coverage);
  // The viewport patch is only worth running where it can still buy
  // detail the globe does not hold — below the globe's own step, at the
  // deepest zoom. With a globe present and the view above that step, the
  // two would answer the same question and the second run would change
  // nothing on the screen.
  const zoomedPastGlobe = region !== null
    && (patchGrid(region.lat, region.lon, region.halfLatDeg)?.latStep ?? 1)
      < FINE_LAT_STEP;
  const { data: patchData, isFetching: patchRunning } = useCoveragePatch(
    from,
    band,
    hour,
    region,
    !fine || zoomedPastGlobe,
  );
  const patch = answering(patchData, coverage);

  // The sentence under the map describes the station — how far ITS
  // near-vertical region reaches — so its data must not follow the view:
  // panned to the far side of the world, the patch above holds no point
  // steep from here, and the sentence would vanish while the fact it
  // states had not changed. At the default view this is the same query
  // as the map's, so it costs nothing until the reader pans away.
  //
  // Asked only where there is no whole-world fine grid. That grid runs
  // at 1.25 by 1.5 degrees on the world lattice, which is the rung this
  // patch settles on at the default view and the same lattice, so the
  // points around the station coincide and the answer is the same one.
  // Ungated, it defeated the gate on the map's own patch above: the
  // layer was held back to save a run, and then the run happened here.
  const { data: homePatchData } = useCoveragePatch(
    from,
    band,
    hour,
    null,
    !fine,
  );
  // Guarded like the map's layers, and for the same reason read as a
  // sentence rather than seen as a colour: "80m reaches out to about
  // 78 mi" is wrong in a way nobody can catch if the number is 40m's.
  const homePatch = answering(homePatchData, coverage);
  // The station's grid, whichever holds it. Both halves are already
  // checked against the coarse map, so either is about the band and the
  // hour on screen. A function rather than a value because `gridPoints`
  // is a generator: the two readings below need one each.
  const homeGrid = (): Iterable<CoveragePoint> | null =>
    fine ? gridPoints(fine) : homePatch?.points ?? null;

  // Whether the map on screen is behind the band selected above it.
  //
  // Not the same question as "is a query running". The coarse map is
  // held while its replacement computes — deliberately, so a band change
  // does not blank the map — and for the first moments after a tap
  // nothing has started yet, because the hour settles before any of
  // these queries are keyed. In both windows the drawn map answers the
  // previous band while the sentence above it names the new one, and
  // that gap is what a reader reports as a wrong map.
  const behind = coverage !== undefined && coverage.band !== band;
  // Every layer, not the fine grid alone. The layers are gated against
  // one another — the patch stands down once the fine grid is there, and
  // the fine grid needs a canvas — so at any moment some of these queries
  // are not running by design. A bar watching one of them marked nothing
  // at all whenever that was the quiet one, and a band change recomputed
  // the whole coarse map in silence (user, 2026-08-01).
  const working = behind || coarseRunning || fineRunning || patchRunning;
  const busy = useShownFor(working, MAP_BUSY_MIN_MS);

  // How far the near-vertical region reaches, from the fine grid. The
  // shading shows its shape and this is its size, which a shape cannot
  // give — and the difference between "the next county" and "the next
  // state" is the whole of what an operator wants from it.
  const nvisGrid = homeGrid();
  // Whether the legend explains the stipple. Its own iterator, for the
  // reason `homeGrid` is a function.
  const legendGrid = homeGrid();

  return {
    /** The coarse answer, which is what the sentences are about. */
    coverage,
    // Nothing is drawn from a failed run. The card keeps its sentences,
    // which come from the prediction rather than from here.
    drawn: error ? null : coverage,
    fine: fine ?? null,
    patch: patch ?? null,
    onRegion,
    busy,
    // What the bar is waiting for, in words, for a reader who cannot see
    // it. Recomputing the map and adding detail to one already drawn are
    // different waits, and the coarse one is the only one that changes
    // what the map says.
    busyKey: behind || coarseRunning
      ? 'reach.mapUpdating'
      : 'reach.mapSharpening',
    detail: detailKey(Boolean(fine), Boolean(patch)),
    nvisKm: nvisGrid === null ? null : nvisReachKm(from, nvisGrid),
    // The band the figures above came out of, for the sentences below.
    // Never the selector's, which runs ahead of every grid.
    nvisBand: fine?.band ?? homePatch?.band ?? null,
    hasNvis: legendGrid !== null && anyNvis(legendGrid),
  };
}
