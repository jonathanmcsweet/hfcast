import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Chip, useTheme } from 'react-native-paper';
import type { AppTheme, QualityKey } from '../theme';

interface Props {
  quality: QualityKey;
  compact?: boolean;
}

export default function QualityChip({ quality, compact }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const c = theme.colors.quality[quality];

  return (
    <Chip
      compact={compact}
      style={[styles.chip, { backgroundColor: c.container }]}
      textStyle={{ color: c.onContainer }}
    >
      {t(`quality.${quality}`)}
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start' },
});
