import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useCoverage } from '../api/queries';
import { isNvis, qualityFor } from '../data/quality';
import { cellFor } from '../data/selectors';
import type { BandKey, PathPrediction } from '../data/types';
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
  const { data: coverage, error } = useCoverage(prediction.from, band, hour);

  const cell = cellFor(prediction, band, hour);
  const reliability = cell?.reliability ?? 0;
  const quality = qualityFor(reliability);
  const nvis = cell
    ? isNvis(cell.takeoffAngleDeg, cell.reliability)
    : false;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={[typography.cardHeadline, { color: ui.ink }]}>
          {t('reach.title')}
        </Text>
        <Text style={[typography.caption, { color: ui.text3 }]}>
          {t('reach.subtitle', { place: prediction.to.label })}
        </Text>
      </View>

      <Inset>
        <View style={styles.readoutRow}>
          <Text
            style={[typography.answer, numeric, styles.sentence, {
              color: ui.ink,
            }]}
          >
            {t('reach.answer', {
              band,
              place: prediction.to.label,
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
              from={prediction.from}
              to={prediction.to}
              hour={hour}
              size={Math.min(width, MAX_MAP)}
            />
          )
          : null}
      </View>

      <MapLegend />

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
