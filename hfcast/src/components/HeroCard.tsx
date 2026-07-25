import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Surface, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { qualityFor } from '../data/quality';
import { bestBandAt, mufAt } from '../data/samplePrediction';
import { useFormatters } from '../hooks/useFormatters';
import QualityChip from './QualityChip';
import { numeric } from '../theme';
import type { AppTheme } from '../theme';
import type { PathPrediction } from '../data/types';

interface Props {
  prediction: PathPrediction;
  hour: number;
}

/** How many hours the current best band stays the best band. */
function hoursUntilHandoff(prediction: PathPrediction, hour: number) {
  const current = bestBandAt(prediction, hour).band;
  for (let i = 1; i <= 24; i += 1) {
    const next = bestBandAt(prediction, hour + i);
    if (next.band !== current) return { offset: i, band: next.band };
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
    <Surface elevation={0} style={[styles.tile, { backgroundColor: background }]}>
      <Text variant="labelSmall" numberOfLines={2} style={{ color: foreground }}>
        {label}
      </Text>
      <Text
        variant="headlineSmall"
        style={[
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

export default function HeroCard({ prediction, hour }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  const best = bestBandAt(prediction, hour);
  const quality = qualityFor(best.reliability);
  const handoff = hoursUntilHandoff(prediction, hour);
  const muf = mufAt(prediction, hour);

  return (
    <Card
      mode="elevated"
      style={[styles.card, { borderColor: theme.colors.outlineVariant }]}
    >
      <Card.Content>
        <Text
          variant="labelMedium"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {t('hero.bestBandNow')}
        </Text>

        <View style={styles.headline}>
          <Text variant="displayMedium" style={styles.band}>
            {best.band}
          </Text>
          <View style={styles.chipSlot}>
            <QualityChip quality={quality} />
          </View>
        </View>

        <Text
          variant="bodyMedium"
          style={[styles.summary, { color: theme.colors.onSurfaceVariant }]}
        >
          {quality === 'closed' || !handoff
            ? t('hero.nothingOpen')
            : t('hero.handoff', {
                current: best.band,
                next: handoff.band,
                time: `${f.utcHour(hour + handoff.offset)} ${t('time.utc')}`,
              })}
        </Text>

        <View style={styles.tiles}>
          <MetricTile
            label={t('metrics.reliability')}
            value={f.percent(best.reliability)}
          />
          <MetricTile
            label={t('metrics.signal')}
            value={f.decibels(best.snr)}
          />
          <MetricTile label={t('metrics.muf')} value={f.megahertz(muf)} solar />
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, borderWidth: StyleSheet.hairlineWidth },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  band: { fontWeight: '400' },
  chipSlot: { marginStart: 'auto' },
  summary: { marginTop: 8, lineHeight: 20 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tileValue: { marginTop: 2 },
  tile: { flex: 1, borderRadius: 12, padding: 10 },
});
