import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Divider, Text, useTheme } from 'react-native-paper';
import { isNvis, qualityFor } from '../data/quality';
import { cellsForHour } from '../data/selectors';
import type { PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

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
        const nvis = isNvis(cell.takeoffAngleDeg, cell.reliability);
        return (
          <View key={cell.band}>
            <View
              accessible
              accessibilityLabel={[
                t('a11y.bandRow', {
                  band: cell.band,
                  quality: t(`quality.${quality}`),
                  percent: f.percent(cell.reliability),
                }),
                nvis ? t('a11y.nvis') : '',
              ].filter(Boolean).join(' ')}
              style={styles.row}
            >
              <View style={styles.labelSlot}>
                <Text style={[typography.bodyStrong, numeric]}>
                  {cell.band}
                </Text>
                {
                  /* Marks the bands a short path reaches straight up and
                     back down. Without it the low bands working at noon on
                     a 30 km path reads as a bug rather than as physics. */
                }
                {nvis && (
                  <Text
                    style={[typography.axis, {
                      color: theme.colors.onSurfaceVariant,
                    }]}
                  >
                    {t('bands.nvis')}
                  </Text>
                )}
              </View>

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
                  style={[
                    typography.bodyStrong,
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
  wrap: { marginHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // A row is a touch target before it is a table row, so it is sized by
    // the 44px minimum rather than by padding around the text.
    minHeight: 44,
  },
  labelSlot: { width: 44 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  valueSlot: { width: 52, alignItems: 'flex-end' },
});
