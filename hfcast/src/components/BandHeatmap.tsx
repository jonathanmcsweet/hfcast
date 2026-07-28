import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { qualityFor } from '../data/quality';
import { BAND_ORDER } from '../data/types';
import type { PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, radius, spacing, typography } from '../theme';
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
            style={[typography.axis, styles.colLabel, numeric, {
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
            style={[
              typography.axis,
              numeric,
              styles.gutter,
              { color: theme.colors.onSurfaceVariant },
            ]}
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
  wrap: { marginHorizontal: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 1 },
  // The label column is a fixed 36px so every row's cells start on the same
  // edge, which is what lets the grid read down a column as well as across.
  gutter: { width: 36 },
  colLabel: { flex: 1, textAlign: 'center' },
  // Half a gap either side of a cell gives the 1px gutter the design asks
  // for without a margin that would break `flex: 1` sizing.
  cellSlot: { flex: 1, paddingHorizontal: 0.5 },
  cell: { height: 22, borderRadius: radius.cell },
});
