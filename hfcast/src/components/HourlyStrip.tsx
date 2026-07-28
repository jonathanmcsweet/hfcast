import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Surface, Text, useTheme } from 'react-native-paper';
import { qualityFor } from '../data/quality';
import { bestBandAt, cellFor } from '../data/selectors';
import type { BandKey, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  prediction: PathPrediction;
  hour: number;
  hours?: number;
  /** Null follows the best band at each hour, which is the default view. */
  pinnedBand?: BandKey | null;
}

export default function HourlyStrip({
  prediction,
  hour,
  hours = 12,
  pinnedBand = null,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  // When a band is pinned the strip follows that band, so the row answers
  // "how does 20m look tonight" rather than switching bands under the reader.
  const slots = Array.from({ length: hours }, (_, i) => {
    const h = (hour + i) % 24;
    const best = pinnedBand
      ? cellFor(prediction, pinnedBand, h)
      : bestBandAt(prediction, h);
    return best
      ? { h, offset: i, best, quality: qualityFor(best.reliability) }
      : null;
  }).filter((slot): slot is NonNullable<typeof slot> => slot !== null);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {slots.map(({ h, offset, best, quality }) => {
        const label = offset === 0 ? t('time.now') : f.utcHour(h);
        return (
          <Surface
            key={h}
            elevation={0}
            accessible
            accessibilityLabel={t('a11y.hourCell', {
              time: label,
              band: best.band,
              quality: t(`quality.${quality}`),
            })}
            style={[
              styles.cell,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
            <Text
              style={[
                typography.axis,
                numeric,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {label}
            </Text>
            <Text style={[typography.cardTitle, styles.band]}>
              {best.band}
            </Text>
            <View
              style={[
                styles.bar,
                { backgroundColor: theme.colors.quality[quality].base },
              ]}
            />
          </Surface>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  cell: {
    width: 64,
    borderRadius: radius.inset,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  band: { marginVertical: spacing.xs },
  bar: { height: 4, width: 32, borderRadius: 2 },
});
