import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon, Surface, Text, useTheme } from 'react-native-paper';
import type { PredictionBasis } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import type { AppTheme } from '../theme';

interface Props {
  ssn: number;
  basis: PredictionBasis;
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
export default function DisclaimerCard({ ssn, basis }: Props) {
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
          variant="bodySmall"
          style={[styles.text, { color: theme.colors.onSecondaryContainer }]}
        >
          {t(`disclaimer.${basis}`, { ssn: f.integer(ssn) })}
        </Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  wrap: { margin: 16, borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', gap: 10 },
  text: { flex: 1, lineHeight: 18 },
});
