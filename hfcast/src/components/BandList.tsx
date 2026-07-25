import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { qualityFor } from '../data/quality';
import { cellsForHour } from '../data/samplePrediction';
import { useFormatters } from '../hooks/useFormatters';
import { numeric } from '../theme';
import type { AppTheme } from '../theme';
import type { PathPrediction } from '../data/types';

interface Props {
  prediction: PathPrediction;
  hour: number;
}

export default function BandList({ prediction, hour }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const rows = cellsForHour(prediction, hour);

  return (
    <View style={styles.wrap}>
      {rows.map((cell, index) => {
        const quality = qualityFor(cell.reliability);
        const colour = theme.colors.quality[quality].base;
        return (
          <View key={cell.band}>
            <View
              accessible
              accessibilityLabel={t('a11y.bandRow', {
                band: cell.band,
                quality: t(`quality.${quality}`),
                percent: f.percent(cell.reliability),
              })}
              style={styles.row}
            >
              <Text variant="titleSmall" style={[styles.label, numeric]}>
                {cell.band}
              </Text>

              <View
                style={[
                  styles.track,
                  { backgroundColor: theme.colors.surfaceVariant },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: colour,
                      width: `${Math.round(cell.reliability * 100)}%`,
                    },
                  ]}
                />
              </View>

              <View style={styles.valueSlot}>
                <Text
                  variant="bodyMedium"
                  style={[
                    numeric,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {f.percent(cell.reliability)}
                </Text>
              </View>
            </View>
            {index < rows.length - 1 ? <Divider /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  label: { width: 44 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  valueSlot: { width: 52, alignItems: 'flex-end' },
});
