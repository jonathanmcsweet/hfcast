import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../theme';
import type { AppTheme } from '../theme';

/**
 * The block at the top that does not scroll (user, 2026-08-01).
 *
 * These are the controls that say what is being forecast — where, which
 * station, which band — and everything below them is the answer. Scrolled
 * with the content they slid under the status bar, so the place name ended
 * up behind the clock and the signal icons: unreadable, and still the only
 * way to change location. Padding alone could not fix that, because
 * padding sets where content starts and the complaint was about where it
 * goes.
 *
 * It also means the band can be changed while reading the grid further
 * down, which is the comparison the grid is for.
 *
 * The band chips used to end flush against the map, so a fixed header and
 * a scrolling page met with nothing between them and the join read as one
 * block. A hairline and a small gap under it say where the controls stop
 * and the answer starts (user, 2026-08-01).
 *
 * `line2` rather than `line`. The quieter one was the first choice, and it
 * stopped working when the header took a background of its own: `line` and
 * the light header are neighbouring steps of the same ramp, so the rule
 * vanished into it. `contrast.test.ts` holds that.
 *
 * A component rather than a shape written twice. The screen draws it while
 * the forecast is still being computed and again once it has arrived —
 * the header needs nothing from the forecast, and a slow load is exactly
 * when somebody notices the location is wrong — and the two copies had to
 * be kept in step by hand.
 */
export default function FixedHeader({ children }: { children: ReactNode; }) {
  const theme = useTheme<AppTheme>();
  const insets = useSafeAreaInsets();
  const ui = theme.colors.ui;

  return (
    <View
      style={[styles.fixed, {
        paddingTop: insets.top,
        backgroundColor: ui.headerBg,
        borderBottomColor: ui.line2,
      }]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // The gap goes above the rule, not below it. Below, it would read as
  // space belonging to the map; above, it is the header's own bottom
  // margin, which is what it is.
  fixed: {
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
