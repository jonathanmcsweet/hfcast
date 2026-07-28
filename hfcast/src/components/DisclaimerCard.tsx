import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { PredictionBasis } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { spacing, typography } from '../theme';
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
 * The assumptions behind every number on the screen.
 *
 * Collapsible but never dismissible. A consumer-friendly skin on climatology
 * is one wrong assumption away from being read as a live forecast, so the
 * assumptions stay reachable from the screen rather than living in a settings
 * page nobody opens.
 *
 * The antenna line is here because it is the single largest error the user
 * can be making. Every run is 100 W into a wire; a beam beats these numbers
 * and a compromise antenna will not reach them.
 */
export default function DisclaimerCard({ ssn, basis, saved = false }: Props) {
  const effective: PredictionBasis = saved && basis === 'nowcast'
    ? 'climatology'
    : basis;
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  return (
    <View style={styles.wrap}>
      <Text style={[typography.caption, { color: ui.text2 }]}>
        {t(`disclaimer.${effective}`, { ssn: f.integer(ssn) })}
      </Text>
      <Text style={[typography.caption, { color: ui.text3 }]}>
        {t('disclaimer.station')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
});
