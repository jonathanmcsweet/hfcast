import { StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { spacing, typography } from '../../theme';
import type { AppTheme } from '../../theme';

/** The label above one section of the station dialog. */
export default function SectionHeading({ text }: { text: string; }) {
  const theme = useTheme<AppTheme>();

  return (
    <Text
      style={[typography.label, styles.heading, {
        color: theme.colors.ui.text4,
      }]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: spacing.lg, marginBottom: spacing.xs },
});
