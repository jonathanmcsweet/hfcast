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
   * While the selection sits on now, the clock shows this exact moment —
   * minutes and all — because that position is a reading, not a forecast
   * hour. Null when nothing live has arrived.
   */
  liveAt?: number | null;
  onChange: (hour: number) => void;
  /** Where the operator is: named in the label, and sets local time. */
  place: string;
  lon: number;
}

/**
 * Where the axis ticks sit, as track positions 0..23.
 *
 * Every fourth position, the same rhythm as the heatmap's axis. The
 * thumb's centre travels position/23 of the track, so the ticks are
 * placed by that fraction rather than by 24 equal columns — under a
 * 24-column layout every label after the first would drift a little
 * further from the hour it names.
 */
const TICKS = [0, 4, 8, 12, 16, 20];

/** A tick's distance along the track, as a percentage for `start`. */
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
 * Both zones are shown at once, and this is not redundancy: operators log
 * and schedule in UTC, but "will this work after dinner" is a local-time
 * question. Making the reader convert between them is the kind of small
 * arithmetic that goes wrong in the field.
 */
export default function HourSlider(
  { hour, anchor, liveAt, onChange, place, lon }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  // On now, the exact time of the live readings; anywhere else, the whole
  // forecast hour. Local time is solar, so the longitude offset is whole
  // hours and the minutes carry over unchanged — see `data/time.ts`.
  const atNow = hour === anchor && liveAt != null;
  const clock = atNow
    ? {
      local: f.hourMinute(
        new Date(liveAt + utcOffsetHours(lon) * 3_600_000),
      ),
      utc: f.hourMinute(new Date(liveAt)),
    }
    : {
      local: f.utcClock(localHour(hour, lon)),
      utc: f.utcClock(hour),
    };

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[typography.label, styles.label, { color: ui.text4 }]}>
          {t('time.localAt', { place })}
        </Text>
        <Text
          style={[typography.bodyStrong, numeric, styles.value, {
            color: ui.ink,
          }]}
        >
          {t('time.bothZones', clock)}
        </Text>
      </View>
      {
        /* The track is the next 24 hours: the left edge is now and the
           right edge is this hour tomorrow, wrapping past midnight. The
           control still moves over positions; the timeline arithmetic
           turns a position into the UTC hour it means.

           UTC ticks above the track and local ticks below it, on the
           heatmap's every-fourth rhythm. The rows are hidden from screen
           readers: the slider's own accessible value already answers the
           question the ticks answer by eye, and six extra numbers per
           row would be read as noise. */
      }
      <View
        style={styles.tickRow}
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
                ? t('time.now')
                : f.hourTick(hourAt(position, anchor))}
            </Text>
          </View>
        ))}
      </View>
      <Slider
        value={offsetOf(hour, anchor) + OFFSET}
        minimumValue={0 + OFFSET}
        maximumValue={23 + OFFSET}
        step={1}
        onValueChange={(value) => onChange(hourAt(value - OFFSET, anchor))}
        minimumTrackTintColor={ui.accent}
        maximumTrackTintColor={ui.line2}
        thumbTintColor={ui.accent}
        accessibilityLabel={t('a11y.hourSlider')}
        // The control reports nothing by itself, so the hour is stated here
        // — unshifted, because this is the number that gets announced.
        accessibilityValue={{ min: 0, max: 23, now: hour }}
        style={styles.slider}
      />
      {
        /* The local row starts where the UTC row says NOW: the exact
           local time is already on the readout above, and a seventh
           number under the label would say it a third time. */
      }
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
              {f.hourTick(localHour(hourAt(position, anchor), lon))}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  // Wraps rather than truncates, since the place name is inside it.
  label: { flexShrink: 1 },
  value: { marginStart: 'auto', textAlign: 'right' },
  // Just tall enough for one axis label; the slots are positioned along
  // it absolutely, so the row needs its own height.
  tickRow: { height: 14 },
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
  // 44px tall so the thumb is reachable with a thumb, not a fingertip.
  slider: { width: '100%', height: 44 },
});
