import Slider from '@react-native-community/slider';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { localHour } from '../data/time';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  /** The UTC hour every module is showing, 0..23. */
  hour: number;
  onChange: (hour: number) => void;
  /** Where the operator is: named in the label, and sets local time. */
  place: string;
  lon: number;
}

/**
 * The slider runs one higher than the hour it sets.
 *
 * `@react-native-community/slider` tests its value with `!props.value`, so a
 * value of zero reads as no value at all and it passes `undefined` down to
 * its web implementation, which calls `.toFixed()` on it. That throws during
 * render, and an error in render unmounts the whole tree — selecting 00 UTC
 * turned the screen white.
 *
 * Running the control over 1..24 keeps zero out of it entirely. The hour is
 * translated at both ends, and the accessible value below reports the real
 * 0..23 hour rather than the shifted one, so nothing outside this file sees
 * the offset.
 */
const OFFSET = 1;

/**
 * The clock. One control, driving every module on the screen.
 *
 * Both zones are shown at once, and this is not redundancy: operators log
 * and schedule in UTC, but "will this work after dinner" is a local-time
 * question. Making the reader convert between them is the kind of small
 * arithmetic that goes wrong in the field.
 */
export default function HourSlider({ hour, onChange, place, lon }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[typography.label, styles.label, { color: ui.text4 }]}>
          {t('time.localAt', { place })}
        </Text>
        <Text
          style={[typography.bodyStrong, numeric, styles.value, {
            color: ui.ink,
          }]}
        >
          {t('time.bothZones', {
            local: f.utcClock(localHour(hour, lon)),
            utc: f.utcClock(hour),
          })}
        </Text>
      </View>
      <Slider
        value={hour + OFFSET}
        minimumValue={0 + OFFSET}
        maximumValue={23 + OFFSET}
        step={1}
        onValueChange={(value) => onChange(value - OFFSET)}
        minimumTrackTintColor={ui.accent}
        maximumTrackTintColor={ui.line2}
        thumbTintColor={ui.accent}
        accessibilityLabel={t('a11y.hourSlider')}
        // The control reports nothing by itself, so the hour is stated here
        // — unshifted, because this is the number that gets announced.
        accessibilityValue={{ min: 0, max: 23, now: hour }}
        style={styles.slider}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  // Wraps rather than truncates, since the place name is inside it.
  label: { flexShrink: 1 },
  value: { marginStart: 'auto', textAlign: 'right' },
  // 44px tall so the thumb is reachable with a thumb, not a fingertip.
  slider: { width: '100%', height: 44 },
});
