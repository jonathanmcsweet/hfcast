import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { spacing, typography } from '../../theme';
import type { AppTheme } from '../../theme';

/**
 * A quiet line under a control.
 *
 * The dialog says a lot in these: what a mode costs in decibels, what
 * height the model reads for an inverted V, which way a wire faces. They
 * were the same three style entries written out at every one of them, and
 * a note that missed one read as body text.
 */
export default function Note(
  { children, style }: {
    children: ReactNode;
    /** For the one note that sits above its control rather than below. */
    style?: StyleProp<TextStyle> | undefined;
  },
) {
  const theme = useTheme<AppTheme>();

  return (
    <Text
      style={[
        typography.caption,
        styles.note,
        { color: theme.colors.ui.text3 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: spacing.xs },
});
