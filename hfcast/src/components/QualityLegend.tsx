import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { QUALITY_ORDER } from '../data/quality';
import type { AppTheme } from '../theme';

export default function QualityLegend() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      {QUALITY_ORDER.map((q) => (
        <View key={q} style={styles.item}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: theme.colors.quality[q].base },
            ]}
          />
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t(`quality.${q}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
});
