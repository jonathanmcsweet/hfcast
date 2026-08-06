import Slider from '@react-native-community/slider';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { localHour, utcOffsetHours } from '../data/time';
import { hourAt, offsetOf } from '../data/timeline';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  /** The UTC hour every module is showing, 0..23. */
  hour: number;
  /** The hour the track starts at: "now". The track runs 24 h forward. */
  anchor: number;
  /**
   * When the live readings behind the now-cast were pulled, epoch ms.
   * The track's first label is "now" only while this is recent; after
   * that it names this moment instead, because the position shows a
   * reading and the reading is from then, not from now. Null when
   * nothing live has arrived.
   */
  liveAt?: number | null;
  /** The clock, epoch ms. Drives when "now" stops being the truth. */
  nowMs: number;
  onChange: (hour: number) => void;
  /** Where the operator is: named in the label, and sets local time. */
  place: string;
  lon: number;
}

/**
 * How long a reading may keep calling itself "now".
 *
 * The readings are polled every quarter hour, so between polls the
 * label would drift up to fifteen minutes from the truth. A few
 * minutes of drift is what a person means by "now"; past that the
 * label names the reading's own time.
 */
const NOW_IS_EXACT_MS = 5 * 60 * 1000;

/**
 * The labelled positions of the scale, as track positions 0..23.
 *
 * Every fourth position, the same rhythm as the heatmap's axis. The
 * thumb's centre travels position/23 of the track, so everything on
 * the scale is placed by that fraction rather than by 24 equal
 * columns — under a 24-column layout every label after the first
 * would drift a little further from the hour it names.
 */
const TICKS = [0, 4, 8, 12, 16, 20];

/** Every position, for the small marks under the track. */
const MARKS = Array.from({ length: 24 }, (_, k) => k);

/** A position's distance along the track, as a percentage for `start`. */
const tickStart = (position: number): `${number}%` =>
  `${(position / 23) * 100}%`;

/**
 * The slider runs one higher than the hour it sets.
 *
 * `@react-native-community/slider` tests its value with `!props.value`, so a
 * value of zero reads as no value at all and it passes `undefined` down to
 * its web implementation, which calls `.toFixed()` on it. That throws during
 * render, and an error in render unmounts the whole tree — selecting 00 UTC
 * turned the screen white.
 *
 * Running the control over 1..24 keeps zero out of it entirely. The hour is
 * translated at both ends, and the accessible value below reports the real
 * 0..23 hour rather than the shifted one, so nothing outside this file sees
 * the offset.
 */
const OFFSET = 1;

/**
 * The clock. One control, driving every module on the screen.
 *
 * Two scales on one track: local above, UTC below. This is not
 * redundancy — operators log and schedule in UTC, but "will this work
 * after dinner" is a local-time question, and making the reader convert
 * between them is the kind of small arithmetic that goes wrong in the
 * field. The header names the place whose local time the top scale
 * shows; the tag under the track names the bottom one.
 */
export default function HourSlider(
  { hour, anchor, liveAt, nowMs, onChange, place, lon }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  // The first label of the local scale: "now" while the reading behind
  // the now-cast is minutes old, and the reading's own local time once
  // it is older. Local time is solar, so the longitude offset is whole
  // hours and the minutes carry over unchanged — see `data/time.ts`.
  const first = liveAt != null && nowMs - liveAt > NOW_IS_EXACT_MS
    ? f.hourMinute(new Date(liveAt + utcOffsetHours(lon) * 3_600_000))
    : t('time.now');

  return (
    <View style={styles.wrap}>
      <Text style={[typography.label, { color: ui.text4 }]}>
        {t('time.localAt', { place })}
      </Text>
      {
        /* The track is the next 24 hours: the left edge is now and the
           right edge is this hour tomorrow, wrapping past midnight. The
           control still moves over positions; the timeline arithmetic
           turns a position into the UTC hour it means.

           The padding is what keeps the first and last labels, centred
           on the track's ends, from being cut by the card's edge.

           The scale rows are hidden from screen readers: the slider's
           own accessible value already answers the question the scale
           answers by eye, and a dozen extra numbers per swipe would be
           read as noise. */
      }
      <View style={styles.scale}>
        {
          /* The inner view is what the now marker's percentage is
             measured against: the padded outer view would measure it
             from the card's edge instead of the track's start. */
        }
        <View>
          {
            /* The now marker: a dotted line from under the word down
             through the track to the marks, drawn before the slider so
             the thumb passes over it. Dots as views, not a dashed
             border — Android does not draw dashed borders on one side. */
          }
          <View
            style={[styles.nowLine, { start: tickStart(0) }]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[styles.nowDot, { backgroundColor: ui.amberNum }]}
              />
            ))}
          </View>
          <View
            style={[styles.tickRow, styles.topRow]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {TICKS.map((position) => (
              <View
                key={position}
                style={[styles.tickSlot, { start: tickStart(position) }]}
              >
                <Text
                  style={[
                    typography.axis,
                    numeric,
                    { color: position === 0 ? ui.amberNum : ui.text4 },
                  ]}
                >
                  {position === 0
                    ? first
                    : f.utcClock(localHour(hourAt(position, anchor), lon))}
                </Text>
              </View>
            ))}
          </View>
          {
            /* The marks hang from both sides of the track, one per hour
               with the labelled ones taller, anchored to the slider so
               the two rows mirror each other around it. */
          }
          <View>
            <Slider
              value={offsetOf(hour, anchor) + OFFSET}
              minimumValue={0 + OFFSET}
              maximumValue={23 + OFFSET}
              step={1}
              onValueChange={(value) =>
                onChange(hourAt(value - OFFSET, anchor))}
              minimumTrackTintColor={ui.accent}
              maximumTrackTintColor={ui.line2}
              thumbTintColor={ui.accent}
              accessibilityLabel={t('a11y.hourSlider')}
              // The control reports nothing by itself, so the hour is
              // stated here — unshifted, because this is the number that
              // gets announced.
              accessibilityValue={{ min: 0, max: 23, now: hour }}
              style={styles.slider}
            />
            {(['above', 'below'] as const).map((side) => (
              <View
                key={side}
                style={[
                  styles.marks,
                  side === 'above' ? styles.marksAbove : styles.marksBelow,
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
              >
                {MARKS.map((position) => (
                  <View
                    key={position}
                    style={[
                      styles.mark,
                      side === 'above' ? styles.markUp : styles.markDown,
                      { start: tickStart(position) },
                      position % 4 === 0
                        ? { height: 6, backgroundColor: ui.text4 }
                        : { height: 4, backgroundColor: ui.line2 },
                      // The now position's mark is the dotted line.
                      position === 0 ? { opacity: 0 } : null,
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
          <View
            style={styles.tickRow}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {TICKS.filter((position) => position !== 0).map((position) => (
              <View
                key={position}
                style={[styles.tickSlot, { start: tickStart(position) }]}
              >
                <Text style={[typography.axis, numeric, { color: ui.text4 }]}>
                  {f.utcClock(hourAt(position, anchor))}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      {
        /* The bottom scale's name, in the same form as the top one's:
           the reader learns which row is which the same way twice. */
      }
      <Text style={[typography.label, { color: ui.text4 }]}>
        {t('time.utcAt', { place })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  // Half a label of room each side, so the centred end labels stay
  // inside the card.
  scale: { paddingHorizontal: spacing.lg + spacing.xs },
  // Just tall enough for one axis label; the slots are positioned along
  // it absolutely, so the row needs its own height.
  tickRow: { height: 14 },
  // The label row leans into the slider's top whitespace, so "now" sits
  // close over the thumb rather than a full row above it.
  topRow: { marginBottom: -6 },
  // From just under the word to the lower marks' baseline, through the
  // track. The top is the label row's text bottom; the bottom clears
  // the UTC row. Both are sums of the fixed heights around the slider.
  nowLine: {
    position: 'absolute',
    top: 12,
    bottom: 14,
    width: 2,
    marginStart: -1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nowDot: { width: 2, height: 3, borderRadius: 1 },
  // A fixed-width box centred on its track position with a logical
  // margin, not a transform: `start` and `marginStart` both follow the
  // text direction, so the pair stays centred under RTL where a
  // physical translate would slide the labels a box-width off.
  tickSlot: {
    position: 'absolute',
    width: 48,
    marginStart: -24,
    alignItems: 'center',
  },
  // Bands of the slider's own whitespace, either side of the track,
  // that the marks are anchored inside. 30 from each edge of the 44px
  // control leaves the marks growing away from the track's centre.
  marks: { position: 'absolute', start: 0, end: 0, height: 6 },
  marksAbove: { bottom: 30 },
  marksBelow: { top: 30 },
  mark: {
    position: 'absolute',
    width: 2,
    marginStart: -1,
    borderRadius: 1,
  },
  // Taller labelled marks grow away from the track, not towards it.
  markUp: { bottom: 0 },
  markDown: { top: 0 },
  // 44px tall so the thumb is reachable with a thumb, not a fingertip.
  slider: { width: '100%', height: 44 },
});
