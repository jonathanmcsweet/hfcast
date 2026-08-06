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
  /** The hour the track starts at. See `src/data/timeline.ts`. */
  start: number;
  /**
   * How many of the track's first positions are already past: "now"
   * sits at position `past`, and the hours before it are the ones the
   * session has watched go by.
   */
  past: number;
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

/**
 * Half the thumb, in px. The thumb's centre cannot reach the track's
 * ends — it stops half a thumb short of each — so everything on the
 * scale is measured inside this inset. Without it the now line missed
 * the centre of the thumb at its leftmost, and every tick drifted a
 * little more towards its nearer edge.
 */
const THUMB_INSET = 10;

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
  { hour, start, past, liveAt, nowMs, onChange, place, lon }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  // The position the thumb is drawn at, shared by the control's value.
  const position = offsetOf(hour, start);

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
        /* The track is 24 hours in track order: the now line starts at
           the left edge and slides right as the session watches hours
           go by, until `PAST_WINDOW` of them sit behind it and the
           track rolls. The control still moves over positions; the
           timeline arithmetic turns a position into the UTC hour it
           means.

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
            style={[styles.nowLine, { start: tickStart(past) }]}
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
          {
            /* The now label rides the now line, wherever the past has
               pushed it. A scale label within two slots of it is
               dropped rather than overlapped — the heatmap's rule is
               one column, but its labels are two digits and these are
               five characters, which graze at two slots on a phone. */
          }
          <View
            style={[styles.tickRow, styles.topRow]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {TICKS.filter((tick) => Math.abs(tick - past) > 2).map((tick) => (
              <View
                key={tick}
                style={[styles.tickSlot, { start: tickStart(tick) }]}
              >
                <Text style={[typography.axis, numeric, { color: ui.text4 }]}>
                  {f.utcClock(localHour(hourAt(tick, start), lon))}
                </Text>
              </View>
            ))}
            <View style={[styles.tickSlot, { start: tickStart(past) }]}>
              <Text style={[typography.axis, numeric, { color: ui.amberNum }]}>
                {first}
              </Text>
            </View>
          </View>
          {
            /* The marks hang from both sides of the track, one per hour
               with the labelled ones taller, anchored to the slider so
               the two rows mirror each other around it. They are drawn
               before the slider: later siblings paint on top, and the
               thumb belongs over the marks, not under them. */
          }
          <View>
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
                      position === past ? { opacity: 0 } : null,
                    ]}
                  />
                ))}
              </View>
            ))}
            <Slider
              value={position + OFFSET}
              minimumValue={0 + OFFSET}
              maximumValue={23 + OFFSET}
              step={1}
              onValueChange={(value) => onChange(hourAt(value - OFFSET, start))}
              // The control draws nothing: thumb and track are both
              // transparent, and the ones below are drawn instead. Each
              // platform lays the native control out by its own rules —
              // the web control insets the thumb's travel by half the
              // thumb, Android's SeekBar pads the track by an amount of
              // its own — so a thumb or a track the platform places sits
              // off the ticks by a platform-sized amount. On the Pixel 8
              // the now line missed the track's start entirely. The drawn
              // ones use the ticks' own arithmetic, so nothing on the
              // scale can disagree with anything else on it.
              minimumTrackTintColor="transparent"
              maximumTrackTintColor="transparent"
              thumbTintColor="transparent"
              accessibilityLabel={t('a11y.hourSlider')}
              // The control reports nothing by itself, so the hour is
              // stated here — unshifted, because this is the number that
              // gets announced.
              accessibilityValue={{ min: 0, max: 23, now: hour }}
              style={styles.slider}
            />
            {
              /* The scale's own track, fill and thumb, after the control
                 so they paint over the marks and the now line the way the
                 native thumb did. Touches fall through to the control
                 underneath, which is still the whole gesture surface. */
            }
            <View pointerEvents="none" style={styles.thumbRail}>
              <View style={[styles.track, { backgroundColor: ui.line2 }]} />
              <View
                style={[styles.track, {
                  backgroundColor: ui.accent,
                  width: tickStart(position),
                }]}
              />
              {
                /* The passed hours, filling in behind the now line as
                   the session runs. Over the fill: with the thumb ahead
                   of now the fill shows from the now line forward, and
                   with the thumb scrubbed back into the past it rides
                   the darker segment alone. */
              }
              <View
                style={[styles.track, {
                  backgroundColor: ui.pastTrack,
                  width: tickStart(past),
                }]}
              />
              <View
                style={[
                  styles.thumb,
                  { start: tickStart(position), backgroundColor: ui.accent },
                ]}
              />
            </View>
          </View>
          <View
            style={styles.tickRow}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {TICKS.filter((tick) => Math.abs(tick - past) > 2).map((tick) => (
              <View
                key={tick}
                style={[styles.tickSlot, { start: tickStart(tick) }]}
              >
                <Text style={[typography.axis, numeric, { color: ui.text4 }]}>
                  {f.utcClock(hourAt(tick, start))}
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
  // it absolutely, so the row needs its own height. Inset to the span
  // the thumb's centre can actually travel.
  tickRow: { height: 14, marginHorizontal: THUMB_INSET },
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
    marginStart: THUMB_INSET - 1,
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
  marks: {
    position: 'absolute',
    start: THUMB_INSET,
    end: THUMB_INSET,
    height: 6,
  },
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
  // The span the thumb's centre travels, which is the same span the
  // ticks are measured in. The rail is the coordinate system; the thumb
  // is placed along it by the same fraction as the tick it sits on.
  thumbRail: {
    position: 'absolute',
    start: THUMB_INSET,
    end: THUMB_INSET,
    top: 0,
    bottom: 0,
  },
  // Centred on the control's 44px height. The fill is the same bar cut
  // at the thumb's own percentage, so the two cannot part.
  track: {
    position: 'absolute',
    top: 20,
    height: 4,
    width: '100%',
    borderRadius: 2,
  },
  // Centred in the 44px control, half its width back from its position.
  thumb: {
    position: 'absolute',
    top: 12,
    width: 20,
    height: 20,
    marginStart: -10,
    borderRadius: 10,
  },
  // 44px tall so the thumb is reachable with a thumb, not a fingertip.
  slider: { width: '100%', height: 44 },
});
