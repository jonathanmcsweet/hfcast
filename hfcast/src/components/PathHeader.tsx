import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../hooks/useFormatters';
import LocalePicker from './LocalePicker';
import type { AppTheme } from '../theme';
import type { PathPrediction } from '../data/types';

interface Props {
  prediction: PathPrediction;
  now: Date;
}

export default function PathHeader({ prediction, now }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  const from = t(prediction.fromKey);
  const to = t(prediction.toKey);

  return (
    <Appbar.Header elevated mode="center-aligned">
      <View style={styles.block}>
        <Text variant="titleMedium" numberOfLines={1}>
          {`${from} → ${to}`}
        </Text>
        <Text
          variant="bodySmall"
          numberOfLines={1}
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {`${prediction.fromGrid} → ${prediction.toGrid} · ` +
            t('path.detail', {
              distance: f.distance(prediction.distanceKm),
              bearing: f.degrees(prediction.bearingDeg),
            })}
        </Text>
      </View>
      <View style={styles.time}>
        <Text variant="labelLarge">{`${f.hourMinute(now)} ${t('time.utc')}`}</Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {f.dayLabel(now)}
        </Text>
      </View>
      <LocalePicker />
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  block: { flex: 1, paddingHorizontal: 12 },
  time: { alignItems: 'flex-end', paddingHorizontal: 4 },
});
