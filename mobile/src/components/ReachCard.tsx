import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { isNvis, qualityFor } from '../data/quality';
import { cellFor } from '../data/selectors';
import type { BandKey, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import { Card, Inset } from './Card';
import HourSlider from './HourSlider';
import MapLegend from './MapLegend';
import QualityChip from './QualityChip';
import MapSlot from './reach/MapSlot';
import ReachLines from './reach/ReachLines';
import { useMapLayers } from './reach/useMapLayers';

interface Props {
  prediction: PathPrediction;
  band: BandKey;
  hour: number;
  /** The hour the slider's track starts at. See `src/data/timeline.ts`. */
  start: number;
  /** How many of the track's first hours are past. See `HourSlider`. */
  past: number;
  /** When the live readings were pulled, for the clock. See `HourSlider`. */
  liveAt?: number | null | undefined;
  /** The clock, epoch ms. */
  nowMs: number;
  onHourChange: (hour: number) => void;
  /** True while the map owns a two-finger pan. See `CoverageGlobe`. */
  onMapPanning?: ((active: boolean) => void) | undefined;
}

/**
 * The top of the screen: the answer in one sentence, then the clock that
 * moves it.
 *
 * The globe is the point of it. A reliability figure for one path answers
 * "will this work"; the map answers "who can hear me", which is the question
 * an operator actually starts from, and it makes the shape of the ionosphere
 * visible instead of asking anybody to imagine it.
 *
 * What the map is drawn from is `useMapLayers`, and the sentences under it
 * are `ReachLines`. This is the order they are stacked in.
 */
export default function ReachCard({
  prediction,
  band,
  hour,
  start,
  past,
  liveAt,
  nowMs,
  onHourChange,
  onMapPanning,
}: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();
  const ui = theme.colors.ui;

  const map = useMapLayers(prediction.from, band, hour);

  // Null for a survey, where the card answers "how much of the world" rather
  // than "will this reach one place".
  const destination = prediction.to;

  const cell = cellFor(prediction, band, hour);
  const reliability = cell?.reliability ?? 0;
  const quality = qualityFor(reliability);
  const nvis = cell
    ? isNvis(cell.takeoffAngleDeg, cell.reliability)
    : false;

  return (
    <Card>
      {
        /* No headline and no caption. They asked "Where can I reach?"
           and named the destination, and the sentence directly below
           answers both — it carries the band, the hour, the place and
           the chance of contact, with a destination set or without one.
           The question and its answer were stacked, and only the answer
           held a figure (user, 2026-08-01).

           Nothing takes over as a heading. The app's heading is the
           fixed block at the top, and no component here sets
           `accessibilityRole="header"`, so there is no heading list for
           this card to fall out of. */
      }
      <Inset>
        <View style={styles.readoutRow}>
          <Text
            style={[typography.answer, numeric, styles.sentence, {
              color: ui.ink,
            }]}
          >
            {destination
              ? t('reach.answer', {
                band,
                place: destination.label,
                hour: f.utcClock(hour),
                percent: f.percent(reliability),
              })
              : t('reach.answerAnywhere', {
                band,
                hour: f.utcClock(hour),
                percent: f.percent(reliability),
              })}
          </Text>
          <QualityChip quality={quality} large />
        </View>
        {
          /* Without this a beginner reads a working low band at midday over
             a short path as a bug rather than as physics. */
        }
        {nvis
          ? (
            <Text style={[typography.caption, { color: ui.text3 }]}>
              {t('a11y.nvis')}
            </Text>
          )
          : null}
      </Inset>

      <MapSlot
        coverage={map.drawn}
        patch={map.patch}
        fine={map.fine}
        from={prediction.from}
        to={prediction.to}
        toClosed={destination !== null && quality === 'closed'}
        hour={hour}
        onRegion={map.onRegion}
        onPanning={onMapPanning}
        busy={map.busy}
        busyLabel={t(map.busyKey)}
      />

      {
        /* Which grid is on the screen. Placed with the legend rather
           than with the answer above, because it describes how the map
           was drawn and not what it says. */
      }
      {map.detail
        ? (
          <Text style={[typography.caption, { color: ui.text3 }]}>
            {t(map.detail, { place: prediction.from.label })}
          </Text>
        )
        : null}

      <MapLegend hasNvis={map.hasNvis} />
      <ReachLines
        coverage={map.coverage}
        nvisBand={map.nvisBand}
        nvisKm={map.nvisKm}
      />
      <HourSlider
        hour={hour}
        start={start}
        past={past}
        liveAt={liveAt}
        nowMs={nowMs}
        onChange={onHourChange}
        place={prediction.from.label}
        lon={prediction.from.lon}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 40,
  },
  sentence: { flex: 1 },
});
