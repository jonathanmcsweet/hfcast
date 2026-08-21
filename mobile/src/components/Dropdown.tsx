import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Divider, Icon, Text, useTheme } from 'react-native-paper';

import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Option<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  /** What a screen reader calls the control. */
  label: string;
  options: readonly Option<T>[];
  selected: T;
  onSelect: (key: T) => void;
  /**
   * A row under the options, after a divider. Adding, usually. Given the
   * call that shuts the list, since only the caller knows whether its
   * row is the kind that should.
   */
  extra?: (close: () => void) => ReactNode;
}

/**
 * One choice out of a list, shown as the choice itself.
 *
 * A chip row says "one of these" better than a stack of ticked rows, and
 * is what the short lists here used. It stops working once a list can
 * grow: seven languages already wrap onto three lines, and more are
 * coming (user, 2026-08-20).
 *
 * The list sits in the flow rather than floating over what follows: a
 * dialog that already scrolls clips an overlay on one platform and not
 * the other.
 *
 * No typing. It was a typeahead, and its list closed when the field lost
 * focus, which on web happens before a press on a name can land, so
 * choosing did nothing at all.
 */
export default function Dropdown<T extends string>(
  { label, options, selected, onSelect, extra }: Props<T>,
) {
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;
  const [open, setOpen] = useState(false);

  const shown = options.find((option) => option.key === selected)?.label ?? '';

  return (
    <>
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        style={[styles.field, { borderColor: open ? ui.accent : ui.line }]}
      >
        <Text
          numberOfLines={1}
          style={[typography.body, styles.value, { color: ui.ink }]}
        >
          {shown}
        </Text>
        <Icon
          source={open ? 'menu-up' : 'menu-down'}
          size={20}
          color={ui.text2}
        />
      </Pressable>

      {open
        ? (
          <View
            style={[styles.list, {
              borderColor: ui.line,
              backgroundColor: ui.card,
            }]}
          >
            {options.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  onSelect(option.key);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: option.key === selected }}
                style={styles.option}
              >
                <Text
                  style={[
                    option.key === selected
                      ? typography.bodyStrong
                      : typography.body,
                    { color: option.key === selected ? ui.accent : ui.ink },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}

            {extra === undefined ? null : (
              <>
                <Divider />
                {extra(() => setOpen(false))}
              </>
            )}
          </View>
        )
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Sized and spaced as the outlined text fields it sits among, so a
  // column of controls reads as one.
  field: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.inset,
  },
  value: { flex: 1 },
  list: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.inset,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
});
