import Slider from '@react-native-community/slider';
import { useState } from 'react';
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
 *
 * The value being dragged is held here and handed over when the finger
 * lifts. A slider reports every step it passes through, and each of
 * those used to change the station being edited — so a drag across the
 * range did the work of a hundred separate edits, on a device this app
 * is meant to be gentle to. The reading above the track follows the
 * finger either way, which is the only part the reader can see.
 */
export default function Dial(
  { label, format, current, min, max, step, onChange, a11yLabel }: {
    label: string;
    /**
     * The value as the reader sees it, with its unit.
     *
     * A function rather than a finished string, so the reading can
     * follow the drag. Given the string, this could only show what was
     * last committed, and the number would sit still while the thumb
     * moved.
     */
    format: (value: number) => string;
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

  /** Where the thumb is while it is being dragged. Null when it is not. */
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? current;

  return (
    <View style={styles.dial}>
      <View style={styles.dialRow}>
        <Text style={[typography.body, { color: ui.text2 }]}>{label}</Text>
        <Text style={[typography.bodyStrong, numeric, { color: ui.ink }]}>
          {format(shown)}
        </Text>
      </View>
      <Slider
        value={current}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={setDragging}
        onSlidingComplete={(value) => {
          setDragging(null);
          onChange(value);
        }}
        minimumTrackTintColor={ui.accent}
        maximumTrackTintColor={ui.line2}
        thumbTintColor={ui.accent}
        accessibilityLabel={a11yLabel}
        // The committed value, not the one under the finger: a screen
        // reader is told what the station says, and a keyboard or
        // assistive gesture commits every step it makes anyway.
        accessibilityValue={{ min, max, now: current }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dial: { marginTop: spacing.md },
  dialRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
