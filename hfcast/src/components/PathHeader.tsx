import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  prediction: PathPrediction;
  /** Opens the location picker on the destination end. */
  onPressDestination: () => void;
}

/**
 * A single hop reaches about this far. Used only to say how many bounces the
 * signal makes, which is the honest way to explain why a long path is harder
 * than a short one: every bounce off the ground loses signal.
 */
const HOP_KM = 3400;

/**
 * What the numbers below are about: the path being forecast.
 *
 * Sits between the map and the grid because it is what turns one into the
 * other — the map is every direction, the grid is this direction.
 */
export default function PathHeader({ prediction, onPressDestination }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  const hops = Math.max(1, Math.ceil(prediction.distanceKm / HOP_KM));

  return (
    <View style={styles.wrap}>
      <Text style={[typography.cardHeadline, { color: ui.ink }]}>
        {`${prediction.from.label} → ${prediction.to.label}`}
      </Text>
      <Text style={[typography.caption, styles.detail, { color: ui.text3 }]}>
        {
          // A separate string for one hop rather than a plural rule. Five
          // languages with five different plural systems is a lot of
          // machinery for a number that is only ever 1 or more.
          hops === 1
            ? t('path.summaryOneHop', {
              distance: f.distance(prediction.distanceKm),
              bearing: f.degrees(prediction.bearingDeg),
            })
            : t('path.summary', {
              distance: f.distance(prediction.distanceKm),
              bearing: f.degrees(prediction.bearingDeg),
              hops,
            })
        }
      </Text>
      <TouchableRipple
        onPress={onPressDestination}
        accessibilityRole="button"
        style={[styles.button, {
          borderColor: ui.line2,
          backgroundColor: ui.card,
        }]}
      >
        <Text style={[typography.bodyStrong, { color: ui.accent }]}>
          {t('path.changeDestination')}
        </Text>
      </TouchableRipple>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  detail: {},
  button: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
