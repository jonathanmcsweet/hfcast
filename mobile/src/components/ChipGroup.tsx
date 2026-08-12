import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * One row of chips, of which exactly one is chosen.
 *
 * The modes, the antenna families, the languages and the units are the
 * same control over different lists, so they are one component. It is
 * generic over the value because the caller gets its own key type back
 * from `onSelect`, not a string it then has to check.
 *
 * It sat under `station/` while the station was the only thing that used
 * it. Preferences uses it too, so it lives here now: nothing about a row
 * of chips is about a radio.
 */
export default function ChipGroup<T extends string>(
  { options, selected, onSelect, label, a11yLabel }: {
    options: readonly T[];
    selected: T;
    onSelect: (value: T) => void;
    label: (value: T) => string;
    a11yLabel: (value: T) => string;
  },
) {
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;

  return (
    <View style={styles.row}>
      {options.map((value) => {
        const chosen = value === selected;
        return (
          <TouchableRipple
            key={value}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen }}
            accessibilityLabel={a11yLabel(value)}
            style={[styles.chip, {
              backgroundColor: chosen ? ui.accent : ui.card,
              borderColor: chosen ? ui.accent : ui.line,
            }]}
          >
            <Text
              style={[typography.bodyStrong, {
                color: chosen ? ui.accentInk : ui.text2,
              }]}
            >
              {label(value)}
            </Text>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps rather than scrolls: nine modes will not fit one line on a
  // phone, and a hidden mode is a mode nobody picks.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
