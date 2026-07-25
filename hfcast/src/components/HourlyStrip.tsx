import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Surface, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { qualityFor } from '../data/quality';
import { bestBandAt } from '../data/samplePrediction';
import { useFormatters } from '../hooks/useFormatters';
import { numeric } from '../theme';
import type { AppTheme } from '../theme';
import type { PathPrediction } from '../data/types';

interface Props {
  prediction: PathPrediction;
  hour: number;
  hours?: number;
}

export default function HourlyStrip({ prediction, hour, hours = 12 }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  const slots = Array.from({ length: hours }, (_, i) => {
    const h = (hour + i) % 24;
    const best = bestBandAt(prediction, h);
    return { h, offset: i, best, quality: qualityFor(best.reliability) };
  });

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
              variant="labelSmall"
              style={[numeric, { color: theme.colors.onSurfaceVariant }]}
            >
              {label}
            </Text>
            <Text variant="titleMedium" style={styles.band}>
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
  row: { paddingHorizontal: 16, gap: 8 },
  cell: {
    width: 64,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  band: { marginVertical: 4 },
  bar: { height: 4, width: 32, borderRadius: 2 },
});
