import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppHeader from '../components/AppHeader';
import BandSelector from '../components/BandSelector';
import Collapsible from '../components/Collapsible';
import DisclaimerCard from '../components/DisclaimerCard';
import LocationPicker from '../components/LocationPicker';
import PathHeader from '../components/PathHeader';
import QualityLegend from '../components/QualityLegend';
import ReachCard from '../components/ReachCard';
import ReachGrid from '../components/ReachGrid';
import SectionHeading from '../components/SectionHeading';
import SpaceWeatherCard from '../components/SpaceWeatherCard';

import { usePrediction, useSounding } from '../api/queries';
import { qualityFor } from '../data/quality';
import { usePathStore } from '../store/usePathStore';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

export default function ForecastScreen() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);

  const from = usePathStore((s) => s.from);
  const to = usePathStore((s) => s.to);
  const band = usePathStore((s) => s.band);
  const setBand = usePathStore((s) => s.setBand);
  const hour = usePathStore((s) => s.hour);
  const setHour = usePathStore((s) => s.setHour);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data, error, isPending, isFetching, dataUpdatedAt, refetch } =
    usePrediction(from, to);

  // Measured foF2 near the transmitting end, when a sounder is close
  // enough. Independent of the forecast: it never delays or blocks it.
  const { data: sounding } = useSounding(from);

  const ui = theme.colors.ui;
  const nowHour = now.getUTCHours();
  const offline = Boolean(error);

  if (isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: ui.page }]}>
        <ActivityIndicator size="large" />
        <Text style={[typography.body, styles.centreText, { color: ui.text2 }]}>
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
      <View style={[styles.centre, { backgroundColor: ui.page }]}>
        <Text style={[typography.cardHeadline, { color: ui.ink }]}>
          {t('status.errorTitle')}
        </Text>
        <Text style={[typography.body, styles.centreText, { color: ui.text2 }]}>
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
          style={[typography.caption, styles.centreDetail, { color: ui.text3 }]}
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

  // A grid of 216 identical closed cells is a true answer that looks like a
  // failed one. Very long paths give exactly that — the engine's best cell
  // over 16,000 km was 0.12 — so it gets said in words as well as drawn.
  const allClosed = prediction.cells.every(
    (c) => qualityFor(c.reliability) === 'closed',
  );

  return (
    <View style={[styles.root, { backgroundColor: ui.page }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          place={prediction.from.label}
          offline={offline}
          onPressPlace={() => setPickerOpen(true)}
          onRefresh={() => void refetch()}
          refreshing={isFetching}
        />

        <BandSelector value={band} onChange={setBand} />

        <ReachCard
          prediction={prediction}
          band={band}
          hour={hour}
          onHourChange={setHour}
        />

        <PathHeader
          prediction={prediction}
          onPressDestination={() => setPickerOpen(true)}
        />

        {
          /* Named for the destination, because this grid is about one path.
             The map above answers the other question — who can hear you —
             and the two were reading as the same thing. */
        }
        <SectionHeading
          title={t('sections.allBandsTo', { place: prediction.to.label })}
          hint={allClosed
            ? t('sections.noneReach', { place: prediction.to.label })
            : t('sections.allBandsHint')}
        />
        <ReachGrid
          prediction={prediction}
          band={band}
          hour={hour}
          nowHour={nowHour}
          offline={offline}
          onSelect={(nextBand, nextHour) => {
            setBand(nextBand);
            setHour(nextHour);
          }}
        />

        <Collapsible title={t('sections.legend')} defaultOpen>
          <QualityLegend />
        </Collapsible>

        {
          /* The freshness tag stays on the collapsed header. A cached quiet
             K index is the most misleading number this app can show, so how
             old it is must not be something the reader has to open a
             section to discover. */
        }
        <Collapsible
          title={t('sections.sun')}
          tag={offline
            ? t('spaceWeather.asOf', {
              time: dataUpdatedAt
                ? new Date(dataUpdatedAt).toISOString().slice(11, 16)
                : '',
            })
            : t('spaceWeather.updated', {
              time: new Date(dataUpdatedAt).toISOString().slice(11, 16),
            })}
          tagStale={offline}
        >
          <SpaceWeatherCard
            spaceWeather={spaceWeather}
            sounding={sounding}
            offline={offline}
          />
        </Collapsible>

        <DisclaimerCard
          ssn={prediction.ssn}
          basis={prediction.basis}
          saved={offline}
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
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centreText: { marginTop: spacing.md, textAlign: 'center' },
  centreDetail: { marginTop: spacing.sm, textAlign: 'center', opacity: 0.8 },
  retry: { marginTop: spacing.lg },
});
