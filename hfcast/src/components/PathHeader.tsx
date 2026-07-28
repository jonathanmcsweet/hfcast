import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Appbar, Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, radius, spacing, typography } from '../theme';
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
          <Text style={typography.locationName} numberOfLines={1}>
            {`${from} → ${to}`}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              typography.caption,
              { color: theme.colors.onSurfaceVariant },
            ]}
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
        <Text style={[typography.bodyStrong, numeric]}>
          {`${f.hourMinute(now)} ${t('time.utc')}`}
        </Text>
        <Text
          style={[
            typography.caption,
            { color: theme.colors.onSurfaceVariant },
          ]}
        >
          {f.dayLabel(now)}
        </Text>
      </View>
      <LocalePicker />
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  // The whole path block opens the location picker, so it is sized as a
  // touch target rather than around its two lines of text.
  block: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.inset,
  },
  time: { alignItems: 'flex-end', paddingHorizontal: spacing.xs },
});
