import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import { BAND_MHZ, BAND_ORDER } from '../data/types';
import type { BandKey, OperatingWindow } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  /** The floor. Null from an older engine or the Fortran fallback. */
  window: OperatingWindow | null;
  /** The ceiling: the median MUF for this hour, which is always present. */
  muf: number;
  hour: number;
  band: BandKey;
}

/** The axis covers the amateur HF spectrum with a little room either side. */
const MIN_MHZ = 3;
const MAX_MHZ = 30;

/**
 * Where a frequency sits on the rail, 0..1.
 *
 * Logarithmic, because the bands are: 80m to 40m is the same musical
 * interval as 20m to 10m, and on a linear axis the low bands would pile up
 * in the first tenth of the track.
 */
function position(mhz: number): number {
  const span = Math.log(MAX_MHZ) - Math.log(MIN_MHZ);
  const at = (Math.log(mhz) - Math.log(MIN_MHZ)) / span;
  return Math.min(1, Math.max(0, at));
}

/**
 * The band of frequencies that will work this hour, drawn to scale.
 *
 * This is the display that says *why* a band is shut. The grid can only show
 * that it is: too high goes through the ionosphere and into space, too low is
 * absorbed on the way up. Seeing the selected band's tick sitting outside the
 * lit span answers that in one look.
 *
 * The expert names are behind a tap. MUF and LUF are the words every
 * propagation tool uses, and an operator will want them — but putting them in
 * the headline would make the display unreadable to the newcomer it is for.
 */
export default function WindowRail({ window, muf, hour, band }: Props) {
  const [open, setOpen] = useState(false);
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  const luf = window?.lufByHour[hour] ?? null;

  // Without a ceiling there is nothing to draw to scale.
  if (!Number.isFinite(muf) || muf <= 0) return null;

  const from = position(luf ?? MIN_MHZ);
  const to = position(muf);

  return (
    <TouchableRipple
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={t('a11y.windowRail', {
        floor: luf === null ? t('window.noFloor') : f.megahertz(luf),
        ceiling: f.megahertz(muf),
      })}
      style={styles.wrap}
    >
      <View>
        <View style={styles.headRow}>
          <Text style={[typography.label, { color: ui.text4 }]}>
            {t('window.label')}
          </Text>
          <Text
            style={[typography.captionStrong, numeric, styles.numbers, {
              color: ui.text2,
            }]}
          >
            {luf === null
              ? t('window.ceilingOnly', { ceiling: f.megahertz(muf) })
              : t('window.floorCeiling', {
                floor: f.decimal(luf),
                ceiling: f.megahertz(muf),
              })}
          </Text>
        </View>

        <View style={[styles.track, { backgroundColor: ui.line }]}>
          {
            /* The lit span is the answer; the ticks are the question. A
               tick inside it is a band that can work this hour. */
          }
          <View
            style={[styles.span, {
              backgroundColor: ui.accent,
              start: `${from * 100}%`,
              width: `${Math.max(0, to - from) * 100}%`,
            }]}
          />
          {BAND_ORDER.map((key) => {
            const mhz = BAND_MHZ[key];
            const inside = mhz <= muf && (luf === null || mhz >= luf);
            const selected = key === band;
            return (
              <View
                key={key}
                style={[styles.tick, {
                  start: `${position(mhz) * 100}%`,
                  width: selected ? 3 : 2,
                  backgroundColor: selected
                    ? ui.accent
                    : inside
                    ? ui.text2
                    : ui.line2,
                }]}
              />
            );
          })}
        </View>

        <View style={styles.endRow}>
          <Text style={[typography.axis, numeric, { color: ui.text4 }]}>
            {f.megahertz(MIN_MHZ)}
          </Text>
          <Text style={[typography.axis, numeric, { color: ui.text4 }]}>
            {f.megahertz(MAX_MHZ)}
          </Text>
        </View>

        {open
          ? (
            <Text
              style={[typography.caption, styles.detail, {
                color: ui.text3,
              }]}
            >
              {luf === null
                ? t('window.explainNoFloor', { ceiling: f.megahertz(muf) })
                : t('window.explain', {
                  floor: f.megahertz(luf),
                  ceiling: f.megahertz(muf),
                })}
            </Text>
          )
          : null}
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md, paddingVertical: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  numbers: { marginStart: 'auto', textAlign: 'right', flexShrink: 1 },
  track: {
    height: 6,
    borderRadius: 3,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  // Absolute so the span and every tick share one coordinate system: each
  // is placed by its frequency, not by its order in the row.
  span: { position: 'absolute', top: 0, bottom: 0, opacity: 0.3 },
  tick: { position: 'absolute', top: 0, bottom: 0 },
  endRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  detail: { marginTop: spacing.sm },
});
