import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  title: string;
  hint?: string;
}

export default function SectionHeading({ title, hint }: Props) {
  const theme = useTheme<AppTheme>();
  return (
    <View style={styles.wrap}>
      <Text style={typography.cardTitle}>{title}</Text>
      {hint
        ? (
          <Text
            style={[
              typography.caption,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {hint}
          </Text>
        )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // No bottom margin: the card below brings its own top margin, and the
  // screen keeps one gap between everything at this level.
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
});
