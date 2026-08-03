import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { QUALITY_ORDER } from '../data/quality';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * The grid's key, along the bottom of it, as a chart has.
 *
 * It was a section of its own — a row per state, each with a sentence
 * saying what to do about it — which put the explanation of a display below
 * the fold from the display it explained. A key belongs against its chart.
 *
 * The sentences do not fit a horizontal strip and are not lost: they are
 * read out as the label for the whole row, so the meaning survives for
 * anyone who cannot use the colours, which is who needed them most.
 */
export default function QualityLegend() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const spoken = QUALITY_ORDER
    .map((q) => `${t(`quality.${q}`)}: ${t(`qualityDescription.${q}`)}`)
    .join('. ');

  return (
    <View style={styles.row} accessible accessibilityLabel={spoken}>
      {QUALITY_ORDER.map((q) => (
        <View key={q} style={styles.item}>
          {
            /* The ring keeps the palest state visible against the card.
               Without it "Closed" in the light theme is a white square on
               white — and in the dark theme it is black on near-black. */
          }
          <View
            style={[styles.swatch, {
              backgroundColor: theme.colors.quality[q].base,
              borderColor: ui.line2,
            }]}
          />
          <Text style={[typography.axis, { color: ui.text3 }]}>
            {t(`quality.${q}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps rather than scrolls: German runs about 35% longer than English,
  // and four labels will not fit one line on a narrow phone.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: radius.cell,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
