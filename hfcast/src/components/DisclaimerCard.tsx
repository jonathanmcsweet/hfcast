import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon, Surface, Text, useTheme } from 'react-native-paper';
import type { PredictionBasis } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  ssn: number;
  basis: PredictionBasis;
  /**
   * The forecast came from the saved cache after a failed fetch. A saved
   * now-cast was driven by readings that are no longer current, so it is
   * described as climatology instead: the sunspot number it used is
   * still the truth about the run, but "driven by current readings" no
   * longer is.
   */
  saved?: boolean;
}

/**
 * Deliberately permanent rather than dismissible. A consumer-friendly skin on
 * climatology is one wrong assumption away from being read as a live forecast,
 * so the assumptions stay on screen.
 *
 * The wording follows the basis: a now-cast is driven by current indices and a
 * forecast by a predicted sunspot number, and neither is a live measurement of
 * the path itself.
 */
export default function DisclaimerCard({ ssn, basis, saved = false }: Props) {
  const effective: PredictionBasis = saved && basis === 'nowcast'
    ? 'climatology'
    : basis;
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  return (
    <Surface
      elevation={0}
      style={[
        styles.wrap,
        { backgroundColor: theme.colors.secondaryContainer },
      ]}
    >
      <View style={styles.row}>
        <Icon
          source="information-outline"
          size={18}
          color={theme.colors.onSecondaryContainer}
        />
        <Text
          style={[
            typography.caption,
            styles.text,
            { color: theme.colors.onSecondaryContainer },
          ]}
        >
          {t(`disclaimer.${effective}`, { ssn: f.integer(ssn) })}
        </Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  wrap: {
    margin: spacing.lg,
    borderRadius: radius.inset,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  text: { flex: 1 },
});
