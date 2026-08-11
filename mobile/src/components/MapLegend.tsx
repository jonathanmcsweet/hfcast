import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { QUALITY_ORDER } from '../data/quality';
import {
  NVIS_DOT_OPACITY,
  radius as radii,
  spacing,
  typography,
} from '../theme';
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
interface Props {
  /**
   * Whether the map is stippling a near-vertical region.
   *
   * The entry appears only when the mark does. A key naming something not
   * on the map sends a reader looking for it, and on most bands and at
   * most hours there is nothing to find.
   */
  hasNvis?: boolean;
}

export default function MapLegend({ hasNvis = false }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;
  const ramp = theme.colors.map;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={hasNvis
        ? `${t('a11y.mapLegend')} ${t('a11y.mapLegendNvis')}`
        : t('a11y.mapLegend')}
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

      {hasNvis
        ? (
          <View style={styles.item}>
            <View style={[styles.dot, { backgroundColor: ui.nvisDot }]} />
            <Text style={[typography.axis, { color: ui.text4 }]}>
              {t('reach.legendNvis')}
            </Text>
          </View>
        )
        : null}
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
  // One dot, at the size the map draws them, so the key shows the mark
  // rather than a description of it.
  dot: { width: 4, height: 4, borderRadius: 2, opacity: NVIS_DOT_OPACITY },
});
