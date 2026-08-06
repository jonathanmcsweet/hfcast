import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text, useTheme } from 'react-native-paper';
import { useCoverage, useCoveragePatch, useFineGlobe } from '../api/queries';
import { patchGrid } from '../data/coveragePatch';
import { FINE_LAT_STEP } from '../data/fineGlobe';
import { answering } from '../data/mapLayers';
import { anyNvis, isNvis, nvisReachKm, qualityFor } from '../data/quality';
import { cellFor } from '../data/selectors';
import type { BandKey, MapRegion, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { useShownFor } from '../hooks/useShownFor';
import { numeric, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import { Card, Inset } from './Card';
import CoverageGlobe from './CoverageGlobe';
import HourSlider from './HourSlider';
import MapLegend from './MapLegend';
import QualityChip from './QualityChip';

interface Props {
  prediction: PathPrediction;
  band: BandKey;
  hour: number;
  /** The hour the slider's track starts at. See `src/data/timeline.ts`. */
  anchor: number;
  /** When the live readings were pulled, for the clock. See `HourSlider`. */
  liveAt?: number | null;
  /** The clock, epoch ms. */
  nowMs: number;
  onHourChange: (hour: number) => void;
}

/**
 * The tallest the map is allowed to be.
 *
 * The cap exists to keep the card above the fold: on a 1280x800 tablet in
 * landscape the whole answer — readout, map and clock — has to fit the
 * first screen, and the map is the only part that can give.
 *
 * It was 322, which was narrower than the card on an ordinary phone, so
 * the map sat inset from the readout above it and the sides did not line
 * up (user, 2026-08-01). A Pixel 8 gives the card 347 points of inside
 * width, and a large phone about 366, so this covers both and the map
 * fills the card on either.
 *
 * The room came from the headline this card used to carry. Removing it
 * gave back its two lines and the gap under them, which is close to the
 * 58 points added here — so the fold is where it was.
 */
const MAX_MAP = 380;

/**
 * The top of the screen: the answer in one sentence, then the clock that
 * moves it.
 *
 * The globe is the point of it. A reliability figure for one path answers
 * "will this work"; the map answers "who can hear me", which is the question
 * an operator actually starts from, and it makes the shape of the ionosphere
 * visible instead of asking anybody to imagine it.
 */
/**
 * The shortest time the map's progress bar stays on screen.
 *
 * The bar appears the moment any of the map's three layers starts, and
 * this is the floor under how long it is visible. Long enough to be seen
 * and read as feedback; short enough that a coarse run of 40 ms is not
 * followed by a bar sitting on a finished map.
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
 * It used to have a third thing to say — that this device had been
 * measured and judged too slow to be given the fine grid at all. Every
 * device runs it now (user, 2026-08-01), so that sentence describes
 * nothing and the two that name a state of the wait describe everything.
 *
 * Null where there is nothing to say, which is a map with no detail
 * layer of any kind on it and one still coming.
 */
const detailKey = (hasFine: boolean, hasPatch: boolean): string | null => {
  if (hasFine) return 'reach.detailWorld';
  return hasPatch ? 'reach.detailNear' : null;
};

export default function ReachCard({
  prediction,
  band,
  hour,
  anchor,
  liveAt,
  nowMs,
  onHourChange,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  const [width, setWidth] = useState(0);
  // Square, because the projection is a disc. The slot is measured rather
  // than assumed, so the same card works in a phone's column and a
  // tablet's.
  const mapSize = Math.min(width, MAX_MAP);
  // What the map is showing, so the fine grid follows the view rather
  // than staying around the station. Held here rather than inside the
  // map because it is the query that needs it, and the query lives here.
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
    prediction.from,
    band,
    hour,
  );
  // Never awaited and never blocking: the map is drawn from the coarse
  // answer above and this fills in behind it. Its own failure is silent,
  // because nothing on the screen depends on it.
  // The whole-world fine grid. Asked once per band and hour, with
  // nothing about the view in its key, so panning and zooming never ask
  // again. It replaces the coarse cells when it lands.
  const { data: fineData, isFetching: fineRunning } = useFineGlobe(
    prediction.from,
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
    prediction.from,
    band,
    hour,
    region,
    !fine || zoomedPastGlobe,
  );
  const patch = answering(patchData, coverage);
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
  // Every layer, not the fine grid alone. On a device that the gate
  // refuses the fine grid is never asked for, so a bar watching only
  // that query marked nothing at all — a band change recomputed the
  // whole coarse map in silence (user, 2026-08-01).
  const working = behind || coarseRunning || fineRunning || patchRunning;
  const busy = useShownFor(working, MAP_BUSY_MIN_MS);
  // What the bar is waiting for, in words, for a reader who cannot see
  // it. Recomputing the map and adding detail to one already drawn are
  // different waits and the coarse one is the only one that changes
  // what the map says.
  const busyKey = behind || coarseRunning
    ? 'reach.mapUpdating'
    : 'reach.mapSharpening';
  // The sentence under the map describes the station — how far ITS
  // near-vertical region reaches — so its data must not follow the view:
  // panned to the far side of the world, the patch above holds no point
  // steep from here, and the sentence would vanish while the fact it
  // states had not changed. At the default view this is the same query
  // as the map's, so it costs nothing until the reader pans away.
  const { data: homePatchData } = useCoveragePatch(prediction.from, band, hour);
  // Guarded like the map's layers, and for the same reason read as a
  // sentence rather than seen as a colour: "80m reaches out to about
  // 78 mi" is wrong in a way nobody can catch if the number is 40m's.
  const homePatch = answering(homePatchData, coverage);
  const detail = detailKey(Boolean(fine), Boolean(patch));

  // Null for a survey, where the card answers "how much of the world" rather
  // than "will this reach one place".
  const destination = prediction.to;

  const cell = cellFor(prediction, band, hour);
  const reliability = cell?.reliability ?? 0;
  const quality = qualityFor(reliability);
  const nvis = cell
    ? isNvis(cell.takeoffAngleDeg, cell.reliability)
    : false;

  // How far the near-vertical region reaches, from the fine grid. The
  // shading shows its shape and this is its size, which a shape cannot
  // give — and the difference between "the next county" and "the next
  // state" is the whole of what an operator wants from it.
  const nvisKm = homePatch
    ? nvisReachKm(prediction.from, homePatch.points)
    : null;

  return (
    <Card>
      {
        /* No headline and no caption. They asked "Where can I reach?"
           and named the destination, and the sentence directly below
           answers both — it carries the band, the hour, the place and
           the chance of contact, with a destination set or without one.
           The question and its answer were stacked, and only the answer
           held a figure (user, 2026-08-01).

           Nothing takes over as a heading. The app's heading is the
           fixed block at the top, and no component here sets
           `accessibilityRole="header"`, so there is no heading list for
           this card to fall out of. */
      }
      <Inset>
        <View style={styles.readoutRow}>
          <Text
            style={[typography.answer, numeric, styles.sentence, {
              color: ui.ink,
            }]}
          >
            {destination
              ? t('reach.answer', {
                band,
                place: destination.label,
                hour: f.utcClock(hour),
                percent: f.percent(reliability),
              })
              : t('reach.answerAnywhere', {
                band,
                hour: f.utcClock(hour),
                percent: f.percent(reliability),
              })}
          </Text>
          <QualityChip quality={quality} large />
        </View>
        {
          /* Without this a beginner reads a working low band at midday over
             a short path as a bug rather than as physics. */
        }
        {nvis
          ? (
            <Text style={[typography.caption, { color: ui.text3 }]}>
              {t('a11y.nvis')}
            </Text>
          )
          : null}
      </Inset>

      <View
        style={styles.mapSlot}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0
          ? (
            <View style={{ width: mapSize, height: mapSize }}>
              <CoverageGlobe
                coverage={error ? null : coverage}
                patch={patch ?? null}
                fine={fine ?? null}
                from={prediction.from}
                to={prediction.to}
                toClosed={destination !== null && quality === 'closed'}
                hour={hour}
                size={mapSize}
                onRegion={onRegion}
              />

              {
                /* The map is being recomputed, or made finer.

                   On the map's own bottom edge (user, 2026-08-01), and
                   positioned rather than stacked, so it takes no height
                   and nothing below it moves as it comes and goes. It
                   spans the map exactly, which is what makes it read as
                   belonging to the map rather than to the card.

                   Below the disc rather than across it: whatever is on
                   screen is already a correct answer to something — the
                   previous band, or this one at a coarser step — so this
                   marks the next answer arriving, not the map being
                   unusable.

                   The bar carries no text, so the label is what a screen
                   reader announces. `accessibilityLiveRegion` says it
                   without moving focus, which matters because the reader
                   may be elsewhere on the card when the grid lands. */
              }
              <View
                style={styles.sharpenRow}
                accessibilityLiveRegion="polite"
                accessibilityLabel={busy ? t(busyKey) : ''}
              >
                {busy
                  ? (
                    <ProgressBar
                      indeterminate
                      color={ui.accent}
                      style={styles.sharpenBar}
                    />
                  )
                  : null}
              </View>
            </View>
          )
          : null}
      </View>

      {
        /* Which grid is on the screen. Placed with the legend rather
           than with the answer above, because it describes how the map
           was drawn and not what it says. */
      }
      {detail
        ? (
          <Text style={[typography.caption, { color: ui.text3 }]}>
            {t(detail, { place: prediction.from.label })}
          </Text>
        )
        : null}

      <MapLegend hasNvis={homePatch ? anyNvis(homePatch.points) : false} />

      {
        /* The map's headline number in words, because a shape is not a
           quantity and the difference between two bands is often a shape
           the eye reads as "about the same". */
      }
      {
        /* Named from the grid the figure came out of, not from the band
           the selector is on. They differ for as long as the map is
           behind — and "160m reaches about 8% of the world" carrying
           40m's number is wrong in a way no reader can catch. */
      }
      {
        /* One sentence when both figures are about the same band, two
           when they are not. The grids arrive separately, so after a
           band change one can still be the old band's for a moment —
           and "40m reaches 4% and out to 247 mi" carrying two bands'
           numbers is wrong in a way no reader can catch. */
      }
      {coverage && homePatch && nvisKm !== null
          && coverage.band === homePatch.band
        ? (
          <Text style={[typography.caption, { color: ui.text3 }]}>
            {t('reach.reachAndNvis', {
              band: coverage.band,
              percent: f.percent(coverage.reach),
              distance: f.distance(nvisKm),
            })}
          </Text>
        )
        : (
          <>
            {coverage
              ? (
                <Text style={[typography.caption, { color: ui.text3 }]}>
                  {t('reach.reachLine', {
                    band: coverage.band,
                    percent: f.percent(coverage.reach),
                  })}
                </Text>
              )
              : null}

            {
              /* The map's other headline, and the one the stipple stands
                 for. Said in words because a distance is a quantity and a
                 pattern of dots is not, and because this is the sentence a
                 reader with no sight of the map still gets. */
            }
            {homePatch === null || nvisKm === null
              ? null
              : (
                <Text style={[typography.caption, { color: ui.text3 }]}>
                  {/* The patch's own band, as for the reach line above. */}
                  {t('reach.nvisReach', {
                    band: homePatch.band,
                    distance: f.distance(nvisKm),
                  })}
                </Text>
              )}
          </>
        )}

      <HourSlider
        hour={hour}
        anchor={anchor}
        liveAt={liveAt}
        nowMs={nowMs}
        onChange={onHourChange}
        place={prediction.from.label}
        lon={prediction.from.lon}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  // Laid over the foot of the map, spanning it exactly. Positioned and
  // not stacked, so it takes no height and the legend and sentences
  // under the map do not move as it comes and goes.
  sharpenRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    justifyContent: 'center',
  },
  sharpenBar: { height: 3 },
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 40,
  },
  sentence: { flex: 1 },
  // Square, because the projection is a disc. Measuring the slot rather
  // than guessing lets the same card work on a phone and a tablet column.
  mapSlot: { alignItems: 'center', justifyContent: 'center' },
});
