import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import { qualityFor } from '../data/quality';
import { cellFor } from '../data/selectors';
import { hoursFrom, offsetOf } from '../data/timeline';
import { BAND_ORDER } from '../data/types';
import type { BandKey, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  prediction: PathPrediction;
  band: BandKey;
  hour: number;
  /** The hour the first column shows. Columns run 24 h forward. */
  start: number;
  onSelect: (band: BandKey, hour: number) => void;
}

/** Every fourth column is labelled. More than that and the axis stops being read. */
const AXIS_STEP = 4;
const CELL_HEIGHT = 22;
const GAP = 1;

/**
 * Every band, every hour, at once.
 *
 * The whole point is the shape. A single reading tells you about one moment;
 * this shows the day's structure — the low bands filling in after dark, the
 * high bands opening around noon — and that structure is what teaches somebody
 * how the ionosphere behaves rather than just what to do next.
 *
 * Built as columns of hours rather than rows of bands, even though it reads as
 * rows. The selected hour is marked by one rectangle around a whole column,
 * and a column that is a real view can carry that border itself instead of
 * needing an overlay aligned to a grid it cannot see.
 */
export default function BandHeatmap({
  prediction,
  band,
  hour,
  start,
  onSelect,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  // The day in track order, wrapping past midnight. Each cell still
  // asks the prediction for its absolute hour.
  const hours = hoursFrom(start);
  const selectedColumn = offsetOf(hour, start);

  return (
    <View>
      {
        /* A tick above the selected column, so the hour is findable
           without tracing down from the axis. */
      }
      <View style={styles.tickRow}>
        <View style={styles.gutter} />
        <View style={styles.tickTrack}>
          {hours.map((h) => (
            <View key={h} style={styles.tickSlot}>
              {h === hour
                ? (
                  <View
                    style={[styles.tick, { backgroundColor: ui.amberNum }]}
                  />
                )
                : null}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.gridRow}>
        <View style={styles.gutter}>
          {BAND_ORDER.map((key) => (
            <View key={key} style={styles.labelSlot}>
              <Text
                style={[typography.axis, numeric, {
                  color: key === band ? ui.ink : ui.text4,
                }]}
              >
                {key}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.columns}>
          {hours.map((h) => (
            <View
              key={h}
              style={[
                styles.column,
                h === hour
                  ? [styles.columnSelected, { borderColor: ui.amberNum }]
                  : null,
              ]}
            >
              {BAND_ORDER.map((key) => {
                const cell = cellFor(prediction, key, h);
                const reliability = cell?.reliability ?? 0;
                const quality = qualityFor(reliability);
                return (
                  <TouchableRipple
                    key={key}
                    onPress={() => onSelect(key, h)}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.gridCell', {
                      band: key,
                      hour: f.utcClock(h),
                      percent: f.percent(reliability),
                      quality: t(`quality.${quality}`),
                    })}
                    style={[styles.cell, {
                      backgroundColor: theme.colors.quality[quality].base,
                    }]}
                  >
                    <View />
                  </TouchableRipple>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.axisRow}>
        <View style={styles.gutter} />
        <View style={styles.tickTrack}>
          {hours.map((h, column) => (
            <View key={h} style={styles.tickSlot}>
              {
                /* The selected hour is always labelled; a regular label is
                   dropped when it would collide with it. Regular labels sit
                   on every fourth column, not every fourth hour: the hours
                   move with the track, the columns do not. */
              }
              {h === hour
                  || (column % AXIS_STEP === 0
                    && Math.abs(column - selectedColumn) > 1)
                ? (
                  <Text
                    style={[typography.axis, numeric, {
                      color: h === hour ? ui.amberNum : ui.text4,
                    }]}
                  >
                    {f.hourTick(h)}
                  </Text>
                )
                : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The label column is a fixed width so every band's cells start on the
  // same edge, which is what lets the grid be read down as well as across.
  gutter: { width: 36 },
  labelSlot: {
    height: CELL_HEIGHT,
    marginBottom: GAP,
    justifyContent: 'center',
  },
  gridRow: { flexDirection: 'row', gap: GAP * 4 },
  columns: { flex: 1, flexDirection: 'row', gap: GAP },
  column: { flex: 1, gap: GAP },
  // The marker draws outside the column rather than inside it: a 2px border
  // taken out of a 12px column would cost a third of every cell's width, and
  // the negative margin cancels the border so no column changes size when the
  // hour moves.
  columnSelected: {
    borderWidth: 2,
    margin: -2,
    borderRadius: radius.cell,
  },
  cell: { height: CELL_HEIGHT, borderRadius: radius.cell },
  tickRow: { flexDirection: 'row', gap: GAP * 4, marginBottom: spacing.xs },
  tickTrack: { flex: 1, flexDirection: 'row', gap: GAP },
  tickSlot: { flex: 1, alignItems: 'center' },
  tick: { width: 10, height: 2, borderRadius: 1 },
  axisRow: { flexDirection: 'row', gap: GAP * 4, marginTop: spacing.xs },
});
