import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { qualityFor } from '../data/quality';
import { cellFor } from '../data/selectors';
import { hoursFrom } from '../data/timeline';
import { BAND_ORDER } from '../data/types';
import type { BandKey, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  prediction: PathPrediction;
  band: BandKey;
  hour: number;
  /** The hour the first column shows: "now". Columns run 24 h forward. */
  anchor: number;
}

/**
 * The same numbers as the heatmap, as numbers.
 *
 * Required, not a nicety. A colour field answers "when is this band good"
 * only if you can see colour and see it well; the table answers the same
 * question for somebody who cannot, and for anybody who wants the actual
 * figure rather than a shade of it.
 *
 * The band column stays put while the hours scroll, because a row of numbers
 * with its label off-screen is a row of numbers about nothing.
 */
export default function BandTable({ prediction, band, hour, anchor }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  // The same track order as the heatmap, so the two tell one story.
  const hours = hoursFrom(anchor);

  return (
    <View style={styles.wrap}>
      <View style={styles.gutter}>
        <View style={[styles.headCell, styles.gutterCell]}>
          <Text style={[typography.label, { color: ui.text4 }]}>
            {t('grid.bandColumn')}
          </Text>
        </View>
        {BAND_ORDER.map((key) => (
          <View
            key={key}
            style={[styles.bodyCell, styles.gutterCell, {
              borderTopColor: ui.line,
            }]}
          >
            <Text
              style={[typography.captionStrong, numeric, {
                color: key === band ? ui.ink : ui.text2,
              }]}
            >
              {key}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.row}>
            {hours.map((h) => (
              <View key={h} style={[styles.headCell, styles.dataCell]}>
                <Text
                  style={[typography.axis, numeric, {
                    color: h === hour ? ui.amberNum : ui.text4,
                  }]}
                >
                  {f.hourTick(h)}
                </Text>
              </View>
            ))}
          </View>
          {BAND_ORDER.map((key) => (
            <View key={key} style={styles.row}>
              {hours.map((h) => {
                const reliability = cellFor(prediction, key, h)?.reliability
                  ?? 0;
                const quality = qualityFor(reliability);
                return (
                  <View
                    key={h}
                    accessible
                    accessibilityLabel={t('a11y.gridCell', {
                      band: key,
                      hour: f.utcClock(h),
                      percent: f.percent(reliability),
                      quality: t(`quality.${quality}`),
                    })}
                    style={[styles.bodyCell, styles.dataCell, {
                      borderTopColor: ui.line,
                      backgroundColor: theme.colors.quality[quality].base,
                    }]}
                  >
                    <Text
                      style={[typography.axis, numeric, {
                        color: theme.colors.quality[quality].onBase,
                      }]}
                    >
                      {f.integer(Math.round(reliability * 100))}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const CELL_HEIGHT = 26;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', marginTop: spacing.md },
  gutter: { width: 44 },
  gutterCell: { alignItems: 'flex-start', paddingEnd: spacing.sm },
  row: { flexDirection: 'row' },
  headCell: { height: CELL_HEIGHT, justifyContent: 'center' },
  bodyCell: {
    height: CELL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dataCell: { width: 34, alignItems: 'center' },
});
