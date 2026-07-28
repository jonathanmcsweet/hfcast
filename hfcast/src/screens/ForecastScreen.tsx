import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BandHeatmap from '../components/BandHeatmap';
import BandList from '../components/BandList';
import BandSelector from '../components/BandSelector';
import DaySelector from '../components/DaySelector';
import DisclaimerCard from '../components/DisclaimerCard';
import HeroCard from '../components/HeroCard';
import HourlyStrip from '../components/HourlyStrip';
import LocationPicker from '../components/LocationPicker';
import OfflineBanner from '../components/OfflineBanner';
import PathHeader from '../components/PathHeader';
import QualityLegend from '../components/QualityLegend';
import SectionHeading from '../components/SectionHeading';
import SpaceWeatherCard from '../components/SpaceWeatherCard';

import { usePrediction, usePrefetchDays } from '../api/queries';
import { usePathStore } from '../store/usePathStore';
import type { AppTheme } from '../theme';

export default function ForecastScreen() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);

  const from = usePathStore((s) => s.from);
  const to = usePathStore((s) => s.to);
  const pinnedBand = usePathStore((s) => s.pinnedBand);
  const setPinnedBand = usePathStore((s) => s.setPinnedBand);
  const dayOffset = usePathStore((s) => s.dayOffset);
  const setDayOffset = usePathStore((s) => s.setDayOffset);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data, error, isPending, isFetching, dataUpdatedAt, refetch } =
    usePrediction(from, to, dayOffset);

  // Once a request has succeeded the network is up, which is the moment
  // worth spending on filling the other days.
  usePrefetchDays(from, to, Boolean(data) && !error);

  // A future day has no "now", so it opens at the start of the UTC day.
  const hour = dayOffset === 0 ? now.getUTCHours() : 0;

  if (isPending) {
    return (
      <View
        style={[styles.centre, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" />
        <Text variant="bodyMedium" style={styles.centreText}>
          {t('status.loading')}
        </Text>
      </View>
    );
  }

  // The error screen is only for having nothing to show. When a fetch
  // fails over a saved forecast, the saved one is displayed instead:
  // predictions are monthly climatology, so it is still correct, and
  // replacing it with an error would withhold a usable answer. React
  // Query keeps `data` from the last success while reporting the failed
  // refetch in `error`, which is exactly this case.
  if (!data) {
    return (
      <View
        style={[styles.centre, { backgroundColor: theme.colors.background }]}
      >
        <Text variant="titleMedium">{t('status.errorTitle')}</Text>
        <Text
          variant="bodyMedium"
          style={[styles.centreText, { color: theme.colors.onSurfaceVariant }]}
        >
          {t('status.errorBody')}
        </Text>
        {
          /*
          The reason is shown verbatim rather than flattened into one generic
          line. "could not reach http://127.0.0.1:8787" points straight at a
          server that was never started, which the generic wording does not.
        */
        }
        <Text
          variant="bodySmall"
          style={[styles.centreDetail, {
            color: theme.colors.onSurfaceVariant,
          }]}
        >
          {error instanceof Error ? error.message : String(error)}
        </Text>
        <Button
          mode="contained"
          onPress={() => void refetch()}
          style={styles.retry}
        >
          {t('status.retry')}
        </Button>
      </View>
    );
  }

  const { prediction, spaceWeather } = data;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <PathHeader
        prediction={prediction}
        now={now}
        onPressPath={() =>
          setPickerOpen(true)}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <OfflineBanner
            savedAt={dataUpdatedAt}
            wasNowcast={prediction.basis === 'nowcast'}
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        )}

        <View style={styles.controls}>
          <DaySelector value={dayOffset} onChange={setDayOffset} />
        </View>

        <HeroCard prediction={prediction} hour={hour} pinnedBand={pinnedBand} />

        <View style={styles.controls}>
          <BandSelector value={pinnedBand} onChange={setPinnedBand} />
        </View>

        <SectionHeading title={t('sections.hourly')} />
        <HourlyStrip
          prediction={prediction}
          hour={hour}
          pinnedBand={pinnedBand}
        />

        <SectionHeading title={t('sections.bands')} />
        <BandList prediction={prediction} hour={hour} />

        <SectionHeading
          title={t('sections.outlook')}
          hint={t('sections.outlookHint')}
        />
        <BandHeatmap prediction={prediction} />
        <View style={styles.legend}>
          <QualityLegend />
        </View>

        <SectionHeading title={t('sections.spaceWeather')} />
        <SpaceWeatherCard spaceWeather={spaceWeather} />

        <DisclaimerCard
          ssn={prediction.ssn}
          basis={prediction.basis}
          saved={Boolean(error)}
        />
      </ScrollView>

      <LocationPicker
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  legend: { marginHorizontal: 16 },
  controls: { marginTop: 12 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centreText: { marginTop: 12, textAlign: 'center' },
  centreDetail: { marginTop: 8, textAlign: 'center', opacity: 0.8 },
  retry: { marginTop: 16 },
});
