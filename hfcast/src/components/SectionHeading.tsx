import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { AppTheme } from '../theme';

interface Props {
  title: string;
  hint?: string;
}

export default function SectionHeading({ title, hint }: Props) {
  const theme = useTheme<AppTheme>();
  return (
    <View style={styles.wrap}>
      <Text variant="titleSmall">{title}</Text>
      {hint ? (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 24, marginBottom: 10, gap: 2 },
});
