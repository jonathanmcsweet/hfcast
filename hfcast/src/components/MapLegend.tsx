import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { QUALITY_ORDER } from '../data/quality';
import { qualityMap, radius as radii, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * What the two washes on the map mean.
 *
 * The map carries two quantities at once — predicted reach, and where it is
 * night — and both work by shading. Without this they are the same kind of
 * mark in two colours, which is how they were being read.
 *
 * Deliberately not the full four-state legend: that lives under the grid,
 * with a sentence for each state. This one only has to separate the answer
 * from the context, so it shows the ramp as a ramp.
 */
export default function MapLegend() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;
  const ramp = theme.dark ? qualityMap.dark : qualityMap.light;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={t('a11y.mapLegend')}
    >
      <View style={styles.item}>
        <View style={styles.ramp}>
          {
            /* Weakest first, so the ramp reads left to right in the same
               direction as the values it stands for. */
          }
          {[...QUALITY_ORDER].reverse().map((key) => (
            <View
              key={key}
              style={[styles.swatch, {
                backgroundColor: ramp[key].fill,
                opacity: ramp[key].opacity,
              }]}
            />
          ))}
        </View>
        <Text style={[typography.axis, { color: ui.text4 }]}>
          {t('reach.legendReach')}
        </Text>
      </View>

      <View style={styles.item}>
        <View
          style={[styles.swatch, styles.night, {
            backgroundColor: ui.text3,
            borderColor: ui.line2,
          }]}
        />
        <Text style={[typography.axis, { color: ui.text4 }]}>
          {t('reach.legendNight')}
        </Text>
      </View>
    </View>
  );
}

const SWATCH = 10;

const styles = StyleSheet.create({
  // Wraps rather than truncates: German runs long and the two items must
  // both survive a narrow phone.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ramp: { flexDirection: 'row', gap: 1 },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: radii.cell },
  // Outlined, because at this size a flat tint at the map's own opacity
  // would be invisible against the card.
  night: { opacity: 0.35, borderWidth: StyleSheet.hairlineWidth },
});
