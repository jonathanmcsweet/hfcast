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
        <Text style={[typography.bodyStrong, numeric, { color: ui.ink }]}>
          {t('time.bothZones', {
            local: f.utcHour(localHour(hour, lon)),
            utc: f.utcHour(hour),
          })}
        </Text>
      </View>
      <Slider
        value={hour}
        minimumValue={0}
        maximumValue={23}
        step={1}
        onValueChange={onChange}
        minimumTrackTintColor={ui.accent}
        maximumTrackTintColor={ui.line2}
        thumbTintColor={ui.accent}
        accessibilityLabel={t('a11y.hourSlider')}
        style={styles.slider}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  // Wraps rather than truncates, since the place name is inside it.
  label: { flexShrink: 1 },
  // 44px tall so the thumb is reachable with a thumb, not a fingertip.
  slider: { width: '100%', height: 44 },
});
