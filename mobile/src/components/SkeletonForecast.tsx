import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { radius, spacing } from '../theme';
import type { AppTheme } from '../theme';

/**
 * The shape of the forecast screen before the first forecast arrives.
 *
 * Placeholder blocks where the map, the clock and the grid will be,
 * instead of a spinner on an empty page or a picture over the whole
 * app. The reader sees the screen they are about to get, and the
 * header above stays real — a slow load is exactly when somebody
 * notices the location is wrong, and the way to change it must not
 * wait for a forecast about the wrong place.
 *
 * The blocks breathe slowly so the screen reads as working rather
 * than stuck, and hold still when the platform asks for reduced
 * motion.
 *
 * One accessible element, named as the loading state. The blocks are
 * drawing, not content, and a screen reader walking them one by one
 * would be told nothing four times.
 */
export default function SkeletonForecast() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ui = theme.colors.ui;

  const pulse = useRef(new Animated.Value(1)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (mounted) setStill(reduced);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setStill,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (still) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);

  const block = { backgroundColor: ui.line };

  return (
    <Animated.View
      style={[styles.wrap, { opacity: pulse }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('status.loading')}
    >
      {/* The map card: the tallest thing on the screen, first. */}
      <View style={[styles.map, block]} />
      {/* The clock under it, a shorter band. */}
      <View style={[styles.clock, block]} />
      {/* A section heading's worth of text. */}
      <View style={[styles.heading, block]} />
      {/* The grid: the band rows, as rows. */}
      <View style={[styles.grid, block]} />
    </Animated.View>
  );
}

// The same corner as the cards the blocks stand in for.
const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.md, gap: spacing.md },
  map: { height: 260, borderRadius: radius.card },
  clock: { height: 96, borderRadius: radius.card },
  heading: {
    height: 16,
    width: '55%',
    borderRadius: radius.inset,
    marginTop: spacing.sm,
  },
  grid: { height: 220, borderRadius: radius.card },
});
