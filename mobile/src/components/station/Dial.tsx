import Slider from '@react-native-community/slider';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { numeric, spacing, typography } from '../../theme';
import type { AppTheme } from '../../theme';

/**
 * A labelled slider. Sliders rather than typed numbers for the antenna,
 * because those are rough figures an operator knows approximately — a
 * mast is "about ten metres", not 10.0 — and because a number pad on a
 * phone covers the value being set. Power gets both, since a rig has an
 * exact setting worth typing.
 */
export default function Dial(
  { label, value, current, min, max, step, onChange, a11yLabel }: {
    label: string;
    /** The value as the reader sees it, with its unit. */
    value: string;
    current: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    a11yLabel: string;
  },
) {
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;

  return (
    <View style={styles.dial}>
      <View style={styles.dialRow}>
        <Text style={[typography.body, { color: ui.text2 }]}>{label}</Text>
        <Text style={[typography.bodyStrong, numeric, { color: ui.ink }]}>
          {value}
        </Text>
      </View>
      <Slider
        value={current}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        minimumTrackTintColor={ui.accent}
        maximumTrackTintColor={ui.line2}
        thumbTintColor={ui.accent}
        accessibilityLabel={a11yLabel}
        accessibilityValue={{ min, max, now: current }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dial: { marginTop: spacing.md },
  dialRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
