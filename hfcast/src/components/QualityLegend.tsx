import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { QUALITY_ORDER } from '../data/quality';
import { radius, spacing, typography } from '../theme';
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

  return (
    <View style={styles.wrap}>
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
            /* One swatch, not the design's two. The second shows the globe's
               wider-spaced version of this ramp, which has nothing to explain
               until the map is on screen. */
          }
          <View
            style={[
              styles.swatch,
              { backgroundColor: theme.colors.quality[q].base },
            ]}
          />
          <Text style={[typography.bodyStrong, styles.name]}>
            {t(`quality.${q}`)}
          </Text>
          <Text
            style={[
              typography.caption,
              styles.description,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {t(`qualityDescription.${q}`)}
          </Text>
        </View>
      ))}
      <Text
        style={[
          typography.caption,
          styles.footnote,
          { color: theme.colors.onSurfaceVariant },
        ]}
      >
        {t('qualityLegend.footnote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 20, height: 20, borderRadius: radius.cell },
  name: { width: 88 },
  description: { flex: 1 },
  footnote: { marginTop: spacing.xs },
});
