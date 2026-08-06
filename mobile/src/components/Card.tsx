import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';
import { radius, spacing } from '../theme';
import type { AppTheme } from '../theme';

/**
 * A raised surface.
 *
 * Elevation is a hairline border, not a shadow and not a tint. Material does
 * it by tinting the surface with the primary hue, which at this chroma washes
 * the screen cyan; a shadow would be invisible against the near-white page and
 * costs a rasterised layer on every card.
 */
export function Card(
  { children, style }: { children: ReactNode; style?: ViewStyle | undefined; },
) {
  const theme = useTheme<AppTheme>();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.ui.card,
          borderColor: theme.colors.ui.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A recessed panel inside a card — a readout, a stat tile.
 *
 * Recessed rather than raised because it holds the answer rather than
 * introducing it: the eye should land here and stop, not read it as another
 * card boundary.
 */
export function Inset(
  { children, style }: { children: ReactNode; style?: ViewStyle | undefined; },
) {
  const theme = useTheme<AppTheme>();
  return (
    <View
      style={[
        styles.inset,
        { backgroundColor: theme.colors.ui.inset },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    // One gap for everything inside a card, so no child has to know what
    // sits above it.
    gap: spacing.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inset: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    gap: 10,
    borderRadius: radius.inset,
  },
});
