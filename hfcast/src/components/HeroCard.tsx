import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Card, Icon, Surface, Text, useTheme } from 'react-native-paper';
import { qualityFor } from '../data/quality';
import { bestBandAt, cellFor, mufAt } from '../data/selectors';
import type { BandKey, PathPrediction } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import QualityChip from './QualityChip';

interface Props {
  prediction: PathPrediction;
  hour: number;
  /** Null follows the best band, which is the default view. */
  pinnedBand: BandKey | null;
}

/** How many hours the current best band stays the best band. */
function hoursUntilHandoff(prediction: PathPrediction, hour: number) {
  const current = bestBandAt(prediction, hour)?.band;
  if (!current) return null;
  for (let i = 1; i <= 24; i += 1) {
    const next = bestBandAt(prediction, hour + i);
    if (next && next.band !== current) return { offset: i, band: next.band };
  }
  return null;
}

interface TileProps {
  label: string;
  value: string;
  /**
   * Marks the one solar-driven number. Amber appears exactly once in the app,
   * which is what makes it read as meaning rather than decoration.
   */
  solar?: boolean;
}

function MetricTile({ label, value, solar }: TileProps) {
  const theme = useTheme<AppTheme>();
  const background = solar
    ? theme.colors.tertiaryContainer
    : theme.colors.surfaceVariant;
  const foreground = solar
    ? theme.colors.onTertiaryContainer
    : theme.colors.onSurfaceVariant;

  return (
    <Surface
      elevation={0}
      style={[styles.tile, { backgroundColor: background }]}
    >
      <Text
        numberOfLines={2}
        style={[typography.label, { color: foreground }]}
      >
        {label}
      </Text>
      <Text
        style={[
          typography.statValue,
          styles.tileValue,
          numeric,
          solar ? { color: theme.colors.onTertiaryContainer } : null,
        ]}
      >
        {value}
      </Text>
    </Surface>
  );
}

export default function HeroCard({ prediction, hour, pinnedBand }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  // A pinned band replaces the automatic pick, so the hero answers the
  // question the user actually asked rather than a different one.
  const focus = pinnedBand
    ? cellFor(prediction, pinnedBand, hour)
    : bestBandAt(prediction, hour);

  if (!focus) return null;

  const quality = qualityFor(focus.reliability);
  const handoff = hoursUntilHandoff(prediction, hour);
  const muf = mufAt(prediction, hour);
  const live = prediction.basis === 'nowcast';

  return (
    <Card
      mode="elevated"
      style={[styles.card, { borderColor: theme.colors.outlineVariant }]}
    >
      <Card.Content>
        <View style={styles.eyebrow}>
          <Text
            style={[
              typography.label,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {pinnedBand ? t('hero.pinnedBand') : t('hero.bestBandNow')}
          </Text>
          {
            /* The basis is never implied by styling alone: when the live
              indices are unavailable the run is climatology and says so. */
          }
          <View style={styles.basis}>
            <Icon
              source={live ? 'access-point' : 'chart-bell-curve'}
              size={13}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              style={[
                typography.axis,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {live ? t('basis.live') : t('basis.climatology')}
            </Text>
          </View>
        </View>

        <View style={styles.headline}>
          {
            /* The one size the scale does not name. The scale tops out at 28px
               because the redesign replaces this card with the map readout, so
               inventing a display role for a card that is being retired would
               add a token nothing else can use. */
          }
          <Text variant="displayMedium" style={[styles.band, numeric]}>
            {focus.band}
          </Text>
          <View style={styles.chipSlot}>
            <QualityChip quality={quality} />
          </View>
        </View>

        <Text
          style={[
            typography.answer,
            styles.summary,
            { color: theme.colors.onSurfaceVariant },
          ]}
        >
          {quality === 'closed' || !handoff
            ? t('hero.nothingOpen')
            : t('hero.handoff', {
              current: focus.band,
              next: handoff.band,
              time: `${f.utcHour(hour + handoff.offset)} ${t('time.utc')}`,
            })}
        </Text>

        <View style={styles.tiles}>
          <MetricTile
            label={t('metrics.reliability')}
            value={f.percent(focus.reliability)}
          />
          <MetricTile
            label={t('metrics.signal')}
            value={f.decibels(focus.snr)}
          />
          <MetricTile label={t('metrics.muf')} value={f.megahertz(muf)} solar />
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center' },
  basis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginStart: 'auto',
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  band: { fontWeight: '400' },
  chipSlot: { marginStart: 'auto' },
  summary: { marginTop: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  tileValue: { marginTop: 2 },
  tile: { flex: 1, borderRadius: radius.inset, padding: spacing.md },
});
