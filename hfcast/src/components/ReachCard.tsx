import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import { isNvis, qualityFor } from '../data/quality';
import { cellFor } from '../data/selectors';
import type { BandKey, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import { Card, Inset } from './Card';
import HourSlider from './HourSlider';
import QualityChip from './QualityChip';

interface Props {
  prediction: PathPrediction;
  band: BandKey;
  hour: number;
  onHourChange: (hour: number) => void;
}

/**
 * The top of the screen: the answer in one sentence, then the clock that
 * moves it.
 *
 * The coverage globe belongs here and is not built yet. Its place is held by
 * a panel that says so rather than by an empty box or a decorative
 * stand-in — the map is going to be the most trusted thing on this screen, so
 * nothing should ever occupy its position while meaning nothing.
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

  const cell = cellFor(prediction, band, hour);
  const reliability = cell?.reliability ?? 0;
  const quality = qualityFor(reliability);
  const nvis = cell
    ? isNvis(cell.takeoffAngleDeg, cell.reliability)
    : false;

  return (
    <Card>
      <Text style={[typography.cardHeadline, { color: ui.ink }]}>
        {t('reach.title')}
      </Text>
      <Text style={[typography.caption, styles.caption, { color: ui.text3 }]}>
        {t('reach.subtitle', { place: prediction.to.label })}
      </Text>

      <Inset style={styles.readout}>
        <View style={styles.readoutRow}>
          <Text style={[typography.answer, styles.sentence, { color: ui.ink }]}>
            {t('reach.answer', {
              band,
              place: prediction.to.label,
              hour: f.utcHour(hour),
              percent: f.percent(reliability),
            })}
          </Text>
          <QualityChip quality={quality} />
        </View>
        {
          /* Without this a beginner reads a working low band at midday over
             a short path as a bug rather than as physics. */
        }
        {nvis
          ? (
            <Text
              style={[typography.caption, styles.nvis, { color: ui.text3 }]}
            >
              {t('a11y.nvis')}
            </Text>
          )
          : null}
      </Inset>

      <View
        accessible
        accessibilityLabel={t('reach.mapPending')}
        style={[styles.mapSlot, {
          backgroundColor: ui.inset,
          borderColor: ui.line,
        }]}
      >
        <Icon source="map-outline" size={28} color={ui.text4} />
        <Text style={[typography.caption, styles.pending, { color: ui.text3 }]}>
          {t('reach.mapPending')}
        </Text>
      </View>

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
  caption: { marginTop: spacing.xs },
  readout: { marginTop: spacing.md },
  readoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sentence: { flex: 1 },
  nvis: { marginTop: spacing.sm },
  // Holds the globe's place at its eventual height, so the card does not
  // change size when the map lands.
  mapSlot: {
    height: 322,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  pending: { textAlign: 'center' },
});
