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
  // Between cards above, inside a card below: the heading belongs to what
  // follows it, so the gap under it is deliberately the smaller one.
  wrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
});
