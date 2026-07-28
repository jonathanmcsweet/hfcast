import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon, Surface, Text, useTheme } from 'react-native-paper';

import type { Sounding, SpaceWeather } from '../data/types';
import { useFormatters } from '../hooks/useFormatters';
import { numeric } from '../theme';
import type { AppTheme } from '../theme';

interface Props {
  /** Null when the upstream was unreachable. */
  spaceWeather: SpaceWeather | null;
  /**
   * A measured foF2 from a nearby sounder, when one is close enough and
   * reporting. Undefined while loading, null when there is none — and null
   * is the ordinary case, since live stations are almost all in Europe.
   */
  sounding?: Sounding | null;
}

interface ReadingProps {
  label: string;
  value: string;
  hint: string;
}

function Reading({ label, value, hint }: ReadingProps) {
  const theme = useTheme<AppTheme>();
  return (
    <View
      style={styles.reading}
      accessible
      accessibilityLabel={`${label}: ${value}. ${hint}`}
    >
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {label}
      </Text>
      <Text variant="titleMedium" style={numeric}>
        {value}
      </Text>
      <Text
        variant="bodySmall"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {hint}
      </Text>
    </View>
  );
}

/**
 * Current solar and geomagnetic conditions.
 *
 * These are the inputs behind a now-cast, not a measurement of the path. They
 * are shown as numbers with a plain-language hint each, so the figure is
 * readable by someone who has never met a K index.
 */
export default function SpaceWeatherCard({ spaceWeather, sounding }: Props) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const f = useFormatters();

  if (!spaceWeather) {
    return (
      <Surface
        elevation={0}
        style={[styles.wrap, { backgroundColor: theme.colors.surfaceVariant }]}
      >
        <View style={styles.unavailable}>
          <Icon
            source="cloud-off-outline"
            size={18}
            color={theme.colors.onSurfaceVariant}
          />
          <Text
            variant="bodySmall"
            style={[styles.text, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('spaceWeather.unavailable')}
          </Text>
        </View>
      </Surface>
    );
  }

  // Kp runs 0-9. Anything at or above 5 is a geomagnetic storm.
  const stormy = spaceWeather.kp >= 5;

  return (
    <Surface
      elevation={0}
      style={[styles.wrap, { backgroundColor: theme.colors.surfaceVariant }]}
    >
      <View style={styles.readings}>
        <Reading
          label={t('spaceWeather.flux')}
          value={f.integer(spaceWeather.f107)}
          hint={t('spaceWeather.fluxHint')}
        />
        <Reading
          label={t('spaceWeather.kp')}
          value={f.decimal(spaceWeather.kp)}
          hint={stormy ? t('spaceWeather.kpStormy') : t('spaceWeather.kpQuiet')}
        />
        <Reading
          label={t('spaceWeather.effectiveSsn')}
          value={f.integer(spaceWeather.effectiveSsn)}
          hint={t('spaceWeather.effectiveSsnHint')}
        />
      </View>
      {
        /* The one measured number in the app. Everything above is an index
           that feeds the model; this is an ionosonde saying what the
           ionosphere actually did, which is the only line here a user can
           check the model against. Absent for most of the world. */
      }
      {sounding && (
        <View
          accessible
          accessibilityLabel={t('a11y.sounding', {
            value: f.megahertz(sounding.fof2),
            station: sounding.station,
            distance: f.distance(sounding.km),
            time: f.hourMinute(new Date(sounding.measuredAt)),
          })}
          style={styles.sounding}
        >
          <Icon
            source="radar"
            size={16}
            color={theme.colors.onSurfaceVariant}
          />
          <Text
            variant="bodySmall"
            style={[styles.text, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('spaceWeather.measured', {
              value: f.megahertz(sounding.fof2),
              station: sounding.station,
              distance: f.distance(sounding.km),
              time: f.hourMinute(new Date(sounding.measuredAt)),
            })}
          </Text>
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, borderRadius: 12, padding: 12 },
  readings: { flexDirection: 'row', gap: 12 },
  sounding: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  reading: { flex: 1 },
  unavailable: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  text: { flex: 1, lineHeight: 18 },
});
