import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Appbar, Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import type { AppTheme } from '../theme';
import LocalePicker from './LocalePicker';

interface Props {
  prediction: PathPrediction;
  now: Date;
  /** Opens the location picker. The whole path block is the target. */
  onPressPath: () => void;
}

export default function PathHeader({ prediction, now, onPressPath }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  // Place names come from geocoding now, so they are free text rather than
  // translation keys. Grids stay untranslated by convention.
  const from = prediction.from.label;
  const to = prediction.to.label;

  return (
    <Appbar.Header elevated mode="center-aligned">
      <TouchableRipple
        style={styles.block}
        onPress={onPressPath}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.changePath', { from, to })}
      >
        <View>
          <Text variant="titleMedium" numberOfLines={1}>
            {`${from} → ${to}`}
          </Text>
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {`${prediction.from.grid} → ${prediction.to.grid} · ${
              t('path.detail', {
                distance: f.distance(prediction.distanceKm),
                bearing: f.degrees(prediction.bearingDeg),
              })
            }`}
          </Text>
        </View>
      </TouchableRipple>
      <View style={styles.time}>
        <Text variant="labelLarge">
          {`${f.hourMinute(now)} ${t('time.utc')}`}
        </Text>
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
  block: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  time: { alignItems: 'flex-end', paddingHorizontal: 4 },
});
