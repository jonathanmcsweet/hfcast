import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useCoverage, useCoveragePatch } from '../api/queries';
import { anyNvis, isNvis, nvisReachKm, qualityFor } from '../data/quality';
import { cellFor } from '../data/selectors';
import type { BandKey, MapRegion, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
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
  onHourChange: (hour: number) => void;
}

/**
 * The tallest the map is allowed to be.
 *
 * The design's cap, and it exists to keep the card above the fold: on a
 * 1280x800 tablet in landscape the whole answer — headline, readout, map
 * and clock — has to fit the first screen, and the map is the only part
 * that can give.
 */
const MAX_MAP = 322;

/**
 * The top of the screen: the answer in one sentence, then the clock that
 * moves it.
 *
 * The globe is the point of it. A reliability figure for one path answers
 * "will this work"; the map answers "who can hear me", which is the question
 * an operator actually starts from, and it makes the shape of the ionosphere
 * visible instead of asking anybody to imagine it.
 */
export default function ReachCard({
  prediction,
  band,
  hour,
  onHourChange,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  const [width, setWidth] = useState(0);
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
  const { data: coverage, error } = useCoverage(prediction.from, band, hour);
  // Never awaited and never blocking: the map is drawn from the coarse
  // answer above and this fills in behind it. Its own failure is silent,
  // because nothing on the screen depends on it.
  const { data: patch } = useCoveragePatch(
    prediction.from,
    band,
    hour,
    region,
  );
  // The sentence under the map describes the station — how far ITS
  // near-vertical region reaches — so its data must not follow the view:
  // panned to the far side of the world, the patch above holds no point
  // steep from here, and the sentence would vanish while the fact it
  // states had not changed. At the default view this is the same query
  // as the map's, so it costs nothing until the reader pans away.
  const { data: homePatch } = useCoveragePatch(prediction.from, band, hour);

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
      <View style={styles.head}>
        <Text style={[typography.cardHeadline, { color: ui.ink }]}>
          {t('reach.title')}
        </Text>
        <Text style={[typography.caption, { color: ui.text3 }]}>
          {destination
            ? t('reach.subtitle', { place: destination.label })
            : t('reach.subtitleAnywhere')}
        </Text>
      </View>

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
            <CoverageGlobe
              coverage={error ? null : coverage}
              patch={patch ?? null}
              from={prediction.from}
              to={prediction.to}
              hour={hour}
              size={Math.min(width, MAX_MAP)}
              onRegion={onRegion}
            />
          )
          : null}
      </View>

      <MapLegend hasNvis={patch ? anyNvis(patch.points) : false} />

      {
        /* The map's headline number in words, because a shape is not a
           quantity and the difference between two bands is often a shape
           the eye reads as "about the same". */
      }
      {coverage
        ? (
          <Text style={[typography.caption, { color: ui.text3 }]}>
            {t('reach.reachLine', {
              band,
              percent: f.percent(coverage.reach),
            })}
          </Text>
        )
        : null}

      {
        /* The map's other headline, and the one the stipple stands for.
           Said in words because a distance is a quantity and a pattern of
           dots is not, and because this is the sentence a reader with no
           sight of the map still gets. */
      }
      {nvisKm === null
        ? null
        : (
          <Text style={[typography.caption, { color: ui.text3 }]}>
            {t('reach.nvisReach', { band, distance: f.distance(nvisKm) })}
          </Text>
        )}

      <HourSlider
        hour={hour}
        onChange={onHourChange}
        place={prediction.from.label}
        lon={prediction.from.lon}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs },
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
