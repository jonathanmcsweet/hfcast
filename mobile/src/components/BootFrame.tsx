import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme';
import type { AppTheme } from '../theme';
import SkeletonForecast from './SkeletonForecast';

/**
 * The screen's own shape while the fonts arrive.
 *
 * The forecast screen cannot render yet — with a face missing, every
 * text style falls back to the system font at a different width and
 * the layout shifts when the real one lands. But the skeletons hold no
 * text, so the shape does not have to wait: what was a blank frame is
 * the same blocks the screen shows next, and the fonts arriving turn
 * the header from a band into words rather than the whole screen from
 * nothing into something.
 *
 * The header band matches the pending screen's header: the same
 * background, the same rule under it, and the height of the place
 * row's touch target.
 */
export default function BootFrame() {
  const theme = useTheme<AppTheme>();
  const insets = useSafeAreaInsets();
  const ui = theme.colors.ui;

  return (
    <View style={[styles.root, { backgroundColor: ui.page }]}>
      <View
        style={[styles.header, {
          paddingTop: insets.top,
          backgroundColor: ui.headerBg,
          borderBottomColor: ui.line2,
        }]}
      >
        <View style={styles.headerRow} />
      </View>
      <SkeletonForecast />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // The place row: a 44 pt touch target with the header's own 2 pt of
  // top padding, as `AppHeader` sizes it.
  headerRow: { height: 46 },
});
