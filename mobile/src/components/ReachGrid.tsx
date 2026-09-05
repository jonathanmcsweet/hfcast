import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import { mufAt } from '../data/selectors';
import type { BandKey, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import BandHeatmap from './BandHeatmap';
import BandTable from './BandTable';
import { Card, Inset } from './Card';
import QualityLegend from './QualityLegend';
import WindowRail from './WindowRail';

interface Props {
  /** Said under the readout when nothing reaches at all, else absent. */
  note?: string | undefined;
  prediction: PathPrediction;
  band: BandKey;
  hour: number;
  /**
   * The band whose map correction is still being worked out, or null.
   *
   * The grid itself is complete the moment it is drawn — it is one path
   * over 24 hours, which is a single engine run. What takes longer is
   * the map above: correcting it needs the middle of each place's day,
   * one lattice per band, and those are filled in behind the reader.
   *
   * Said here rather than on the map, because the map is meant to
   * change without announcing itself (user, 2026-08-09) and this is
   * where the reader is choosing between bands.
   */
  fillingBand?: BandKey | null;
  /** The current UTC hour, so "now" can be said rather than implied. */
  nowHour: number;
  /** The hour the grid's first column shows. See `src/data/timeline.ts`. */
  start: number;
  offline: boolean;
  onSelect: (band: BandKey, hour: number) => void;
}

/**
 * The dense one: the answer for the selected band and hour, why it is that
 * answer, and then every other band and hour underneath it.
 *
 * Ordered so it can be read at three depths without scrolling back. The
 * readout is the answer in a sentence. The rail is the reason. The grid is
 * everything else, for the reader who wants to plan rather than to act.
 */
export default function ReachGrid({
  note,
  prediction,
  band,
  hour,
  fillingBand = null,
  nowHour,
  start,
  offline,
  onSelect,
}: Props) {
  const [asTable, setAsTable] = useState(false);
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  const place = prediction.from.label;

  return (
    <Card>
      <Inset>
        {
          /* The answer is the heading, and the band and hour it belongs to
             sit under it. One block rather than a title above a sentence,
             which read as two headings (user, 2026-09-03). */
        }
        <View style={styles.head}>
          <Text style={typography.cardTitle}>
            {prediction.to
              ? t('sections.allBandsTo', { place: prediction.to.label })
              : t('sections.allBandsAnywhere')}
          </Text>
          <Text style={[typography.label, { color: ui.text4 }]}>
            {hour === nowHour
              ? t('grid.readoutNow', {
                hour: f.utcClock(hour),
                band: band.toUpperCase(),
              })
              : t('grid.readoutAt', {
                hour: f.utcClock(hour),
                band: band.toUpperCase(),
              })}
          </Text>
          {note
            ? (
              <Text style={[typography.caption, { color: ui.text3 }]}>
                {note}
              </Text>
            )
            : null}
        </View>
        {
          /* The rail sits inside the head rather than beside it: it is
             the reason for the band and hour named above it, not a
             separate display. */
        }
        <View style={[styles.rule, { backgroundColor: ui.line }]} />
        <WindowRail
          window={prediction.window}
          muf={mufAt(prediction, hour)}
          hour={hour}
          band={band}
        />
      </Inset>

      {
        /* The unit is stated, not implied. The grid's quantity changes with
           what the screen is showing, and a bare number with no unit is the
           kind of thing that gets read as the wrong quantity. */
      }
      <View style={styles.unitRow}>
        <Text style={[typography.label, styles.unit, { color: ui.text4 }]}>
          {t(prediction.to ? 'grid.unitChance' : 'grid.unitDirections')}
        </Text>
        <TouchableRipple
          onPress={() => setAsTable((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: asTable }}
          style={[styles.toggle, {
            borderColor: ui.line2,
            backgroundColor: ui.card,
          }]}
        >
          <Text style={[typography.captionStrong, { color: ui.accent }]}>
            {asTable ? t('grid.showAsGrid') : t('grid.showAsTable')}
          </Text>
        </TouchableRipple>
      </View>

      {asTable
        ? (
          <BandTable
            prediction={prediction}
            band={band}
            hour={hour}
            start={start}
          />
        )
        : (
          <BandHeatmap
            prediction={prediction}
            band={band}
            hour={hour}
            start={start}
            onSelect={onSelect}
          />
        )}

      <QualityLegend />

      <Text style={[typography.caption, styles.footnote, { color: ui.text3 }]}>
        {t('grid.footnoteHours', { place })}
        {offline ? ` ${t('grid.footnoteSaved')}` : ''}
      </Text>

      {
        /* Text, not a spinner: it says which band and it is readable by
           a screen reader, where a turning shape says only "something is
           happening". `polite` so it is announced when the reader
           reaches it rather than interrupting them. */
      }
      {fillingBand === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={[typography.caption, styles.footnote, { color: ui.text3 }]}
        >
          {t('grid.mapFilling', { band: fillingBand.toUpperCase() })}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2 },
  rule: { height: StyleSheet.hairlineWidth },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unit: { flexShrink: 1 },
  toggle: {
    marginStart: 'auto',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footnote: {},
});
