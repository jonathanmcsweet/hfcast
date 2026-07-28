import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { QUALITY_ORDER } from '../data/quality';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * What the four colours mean, in words.
 *
 * A row per state rather than a wrapping strip of chips: the state name on
 * its own only renames the colour, and a legend that says nothing more than
 * "this one is called Patchy" is not worth the space. The description is the
 * part that answers what to do about it.
 *
 * The name sits in a fixed column so the descriptions line up as a list. It
 * is sized for German, which runs about 35% longer than English — the column
 * wraps rather than truncates, so a longer word costs a line, never a
 * missing word.
 */
export default function QualityLegend() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  return (
    <View style={styles.wrap}>
      <View style={styles.rows}>
        {QUALITY_ORDER.map((q) => (
          <View
            key={q}
            style={styles.row}
            accessible
            accessibilityLabel={`${t(`quality.${q}`)}: ${
              t(`qualityDescription.${q}`)
            }`}
          >
            {
              /* One swatch, not the design's two. The second shows the
                 globe's wider-spaced version of this ramp, which has
                 nothing to explain until the map is on screen. */
            }
            <View
              style={[styles.swatch, {
                backgroundColor: theme.colors.quality[q].base,
                borderColor: ui.line2,
              }]}
            />
            <Text
              style={[typography.bodyStrong, styles.name, {
                color: ui.ink,
              }]}
            >
              {t(`quality.${q}`)}
            </Text>
            <Text
              style={[typography.caption, styles.description, {
                color: ui.text3,
              }]}
            >
              {t(`qualityDescription.${q}`)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.footnote, { color: ui.text4 }]}>
        {t('qualityLegend.footnote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  rows: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 32,
  },
  // The ring keeps the palest state visible against the card behind it.
  // Without it "Closed" in the light theme is a white square on white.
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { width: 88 },
  description: { flex: 1 },
  footnote: { fontSize: 12, lineHeight: 16 },
});
