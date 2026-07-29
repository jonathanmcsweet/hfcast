import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import { qualityFor } from '../data/quality';
import { cellFor, mufAt } from '../data/selectors';
import type { BandKey, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import BandHeatmap from './BandHeatmap';
import BandTable from './BandTable';
import { Card, Inset } from './Card';
import QualityChip from './QualityChip';
import WindowRail from './WindowRail';

interface Props {
  prediction: PathPrediction;
  band: BandKey;
  hour: number;
  /** The current UTC hour, so "now" can be said rather than implied. */
  nowHour: number;
  offline: boolean;
  onSelect: (band: BandKey, hour: number) => void;
}

/**
 * The dense one: the answer for the selected band and hour, why it is that
 * answer, and then every other band and hour underneath it.
 *
 * Ordered so it can be read at three depths without scrolling back. The
 * readout is the answer in a sentence. The rail is the reason. The grid is
 * everything else, for the reader who wants to plan rather than to act.
 */
export default function ReachGrid({
  prediction,
  band,
  hour,
  nowHour,
  offline,
  onSelect,
}: Props) {
  const [asTable, setAsTable] = useState(false);
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  const cell = cellFor(prediction, band, hour);
  const reliability = cell?.reliability ?? 0;
  const quality = qualityFor(reliability);
  const place = prediction.from.label;

  return (
    <Card>
      <Inset>
        <View style={styles.readoutRow}>
          <View style={styles.readoutText}>
            <Text style={[typography.label, { color: ui.text4 }]}>
              {hour === nowHour
                ? t('grid.readoutNow', {
                  hour: f.utcClock(hour),
                  band: band.toUpperCase(),
                })
                : t('grid.readoutAt', {
                  hour: f.utcClock(hour),
                  band: band.toUpperCase(),
                })}
            </Text>
            <Text style={[typography.bodyStrong, numeric, { color: ui.ink }]}>
              {t('grid.chanceTo', {
                percent: f.percent(reliability),
                place: prediction.to.label,
              })}
            </Text>
          </View>
          <QualityChip quality={quality} large />
        </View>
        {
          /* The rail sits inside the readout rather than beside it: it is
             the reason for the number above it, not a separate display. */
        }
        <View style={[styles.rule, { backgroundColor: ui.line }]} />
        <WindowRail
          window={prediction.window}
          muf={mufAt(prediction, hour)}
          hour={hour}
          band={band}
        />
      </Inset>

      {
        /* The unit is stated, not implied. The grid's quantity changes with
           what the screen is showing, and a bare number with no unit is the
           kind of thing that gets read as the wrong quantity. */
      }
      <View style={styles.unitRow}>
        <Text style={[typography.label, styles.unit, { color: ui.text4 }]}>
          {t('grid.unitChance')}
        </Text>
        <TouchableRipple
          onPress={() => setAsTable((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: asTable }}
          style={[styles.toggle, {
            borderColor: ui.line2,
            backgroundColor: ui.card,
          }]}
        >
          <Text style={[typography.captionStrong, { color: ui.accent }]}>
            {asTable ? t('grid.showAsGrid') : t('grid.showAsTable')}
          </Text>
        </TouchableRipple>
      </View>

      {asTable
        ? <BandTable prediction={prediction} band={band} hour={hour} />
        : (
          <BandHeatmap
            prediction={prediction}
            band={band}
            hour={hour}
            onSelect={onSelect}
          />
        )}

      <Text style={[typography.caption, styles.footnote, { color: ui.text3 }]}>
        {t('grid.footnoteHours', { place })}
        {offline ? ` ${t('grid.footnoteSaved')}` : ''}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
  },
  readoutText: { flex: 1, gap: 2 },
  rule: { height: StyleSheet.hairlineWidth },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unit: { flexShrink: 1 },
  toggle: {
    marginStart: 'auto',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footnote: {},
});
