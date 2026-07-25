import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { qualityFor } from '../data/quality';
import { BAND_ORDER } from '../data/types';
import type { PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  prediction: PathPrediction;
  /** Hours per column. 3 keeps the grid legible at phone width. */
  step?: number;
}

export default function BandHeatmap({ prediction, step = 3 }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  const columns = Array.from({ length: 24 / step }, (_, i) => i * step);

  /**
   * Each column covers `step` hours. Take the best hour in the window rather
   * than the first, so a short opening is never silently dropped.
   */
  const valueAt = (band: string, start: number) => {
    let best = 0;
    for (let h = start; h < start + step; h += 1) {
      const cell = prediction.cells.find(
        (c) => c.band === band && c.hour === h % 24,
      );
      if (cell && cell.reliability > best) best = cell.reliability;
    }
    return best;
  };

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={t('a11y.heatmap')}
    >
      <View style={styles.headerRow}>
        <View style={styles.gutter} />
        {columns.map((h) => (
          <Text
            key={h}
            variant="labelSmall"
            style={[styles.colLabel, numeric, {
              color: theme.colors.onSurfaceVariant,
            }]}
          >
            {f.utcHour(h)}
          </Text>
        ))}
      </View>

      {BAND_ORDER.map((band) => (
        <View key={band} style={styles.row}>
          <Text
            variant="labelSmall"
            style={[styles.gutter, { color: theme.colors.onSurfaceVariant }]}
          >
            {band}
          </Text>
          {columns.map((h) => {
            const quality = qualityFor(valueAt(band, h));
            return (
              <View key={h} style={styles.cellSlot}>
                <View
                  style={[
                    styles.cell,
                    { backgroundColor: theme.colors.quality[quality].base },
                  ]}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  gutter: { width: 36 },
  colLabel: { flex: 1, textAlign: 'center' },
  cellSlot: { flex: 1, paddingHorizontal: 1.5 },
  cell: { height: 20, borderRadius: 4 },
});
