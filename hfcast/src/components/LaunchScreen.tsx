import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { LaunchStage } from '../data/launch';
import { face, spacing } from '../theme';

/**
 * `require` rather than an import, which is how the fonts are asked for in
 * `App.tsx` too: Metro resolves it and TypeScript needs no declaration for an
 * image module, so nothing has to be told what a `.jpg` is.
 */
const aurora = require('../assets/aurora-iss042.jpg');

/**
 * The first thing the app shows, over a photograph of the thing it forecasts.
 *
 * Aurora borealis over the North Atlantic, taken from the cupola of the
 * International Space Station by Samantha Cristoforetti during Expedition 42.
 * NASA, public domain. It is bundled rather than fetched, because a launch
 * screen that needs a network is not a launch screen.
 *
 * The photograph is used as shot: no tint, no duotone. The only intervention
 * is the scrim, which exists so the type clears 4.5:1 over whatever the
 * photograph is doing underneath it.
 *
 * Dark whatever the theme is. There is one photograph and it is a night sky,
 * so a light variant would mean either a second image or white text on a
 * bright scrim over a dark picture.
 */

/** The design's own values. Fixed rather than themed, for the reason above. */
const INK = '#0B0D14';
const TITLE = '#FFFFFF';
const KICKER = '#AAB2C8';
const STEP = '#E2E5F0';
const CREDIT = '#8590AB';
const BAR = '#22D3EE';
const TRACK = 'rgba(226,229,240,0.25)';

/** How long the screen takes to get out of the way once it is done. */
const FADE_MS = 600;

interface Props {
  /** The step being waited for, named under the bar. */
  stage: LaunchStage;
  /** 0..1. */
  progress: number;
  /** False once the app has something to show; starts the fade. */
  visible: boolean;
  /** Called after the fade, so the caller can stop rendering this. */
  onHidden: () => void;
}

export default function LaunchScreen(
  { stage, progress, visible, onHidden }: Props,
) {
  const { t } = useTranslation();
  const opacity = useRef(new Animated.Value(1)).current;
  // The bar animates towards each new value rather than jumping, so a step
  // that settles instantly still reads as movement.
  const width = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: progress,
      duration: 260,
      // A width cannot be driven off the UI thread. The alternative is a
      // scaled full-width bar, which distorts the rounded ends.
      useNativeDriver: false,
    }).start();
  }, [progress, width]);

  useEffect(() => {
    if (visible) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onHidden();
    });
  }, [visible, opacity, onHidden]);

  return (
    <Animated.View
      // Once fading, taps belong to the screen underneath rather than to a
      // picture on its way out.
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.fill, { backgroundColor: INK, opacity }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('launch.a11y', { step: t(`launch.step.${stage}`) })}
    >
      <Image
        source={aurora}
        style={styles.fill}
        resizeMode="cover"
        accessible={false}
      />

      {
        /* Drawn with SVG rather than a gradient package: `react-native-svg` is
           already a dependency, and anything added has to build on both Expo
           SDK 50 and 57. */
      }
      <Svg style={styles.fill} pointerEvents="none">
        <Defs>
          <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.3" stopColor={INK} stopOpacity={0} />
            <Stop offset="0.62" stopColor={INK} stopOpacity={0.72} />
            <Stop offset="1" stopColor={INK} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
      </Svg>

      <View style={styles.body}>
        <Text style={[styles.kicker, { color: KICKER }]}>
          {t('launch.kicker')}
        </Text>
        <Text style={[styles.title, { color: TITLE }]}>
          {t('launch.title')}
        </Text>

        <View style={[styles.track, { backgroundColor: TRACK }]}>
          <Animated.View
            style={[styles.bar, {
              backgroundColor: BAR,
              width: width.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            }]}
          />
        </View>
        <Text style={[styles.step, { color: STEP }]}>
          {t(`launch.step.${stage}`)}
        </Text>

        {
          /* Public domain needs no attribution. It is here because the
             photograph is somebody's work and the app credits everything
             else it is built from. */
        }
        <Text style={[styles.credit, { color: CREDIT }]}>
          {t('launch.credit')}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Written out rather than spread from `StyleSheet.absoluteFillObject`,
  // which React Native 0.86 and 0.73 type differently and both builds have
  // to compile.
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // Bottom-aligned: the photograph's subject is its horizon, and type over
  // the upper half would sit on stars at no contrast at all.
  body: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl + spacing.sm,
    gap: spacing.md,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: face.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    fontFamily: face.semibold,
    letterSpacing: -0.8,
  },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  bar: { height: 4, borderRadius: 2 },
  step: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: face.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  credit: { fontSize: 10, lineHeight: 14, letterSpacing: 0.3 },
});
