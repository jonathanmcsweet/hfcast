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
import ReachCard from '../components/ReachCard';
import ReachGrid from '../components/ReachGrid';
import SectionHeading from '../components/SectionHeading';
import ServerAddressDialog from '../components/ServerAddressDialog';
import SpaceWeatherCard from '../components/SpaceWeatherCard';
import StationModal from '../components/StationModal';

import { usePrediction, useSounding } from '../api/queries';
import { qualityFor } from '../data/quality';
import { usePathStore } from '../store/usePathStore';
import { isLoopback, useServerStore } from '../store/useServerStore';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

export default function ForecastScreen() {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stationOpen, setStationOpen] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);

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
  const server = useServerStore((s) => s.address);
  const nowHour = now.getUTCHours();
  const offline = Boolean(error);

  // The status bar overlaps these too, and the error screen is tall enough on a
  // small phone to reach it.
  const safe = { paddingTop: insets.top, paddingBottom: insets.bottom };

  if (isPending) {
    return (
      <View style={[styles.centre, safe, { backgroundColor: ui.page }]}>
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
      <View style={[styles.centre, safe, { backgroundColor: ui.page }]}>
        <Text style={[typography.cardHeadline, { color: ui.ink }]}>
          {t('status.errorTitle')}
        </Text>
        <Text style={[typography.body, styles.centreText, { color: ui.text2 }]}>
          {t('status.errorBody', { address: server })}
        </Text>
        {
          /* An installed build shipped pointing at this device, so the most
             likely reason is that the address is wrong rather than that a
             server is down. Saying which of the two it is stops the screen
             reading as "this app is broken". */
        }
        {isLoopback(server)
          ? (
            <Text
              style={[typography.body, styles.centreText, { color: ui.text2 }]}
            >
              {t('status.errorLoopback')}
            </Text>
          )
          : null}
        {
          /* The reason is shown verbatim as well. "no answer after 10s" and
             "could not reach" are different faults, and the difference is
             what tells a wrong port from a sleeping machine. */
        }
        <Text
          style={[typography.caption, styles.centreDetail, { color: ui.text3 }]}
        >
          {error instanceof Error ? error.message : String(error)}
        </Text>
        <Button
          mode="contained"
          onPress={() => setServerOpen(true)}
          style={styles.retry}
        >
          {t('status.setServer')}
        </Button>
        <Button
          mode="outlined"
          onPress={() => void refetch()}
          style={styles.retry}
        >
          {t('status.retry')}
        </Button>
        {
          /* The station is worth reaching from here too. It needs no server —
             power, mode, antenna and its compass are all local — and this
             screen is the whole app until a forecast arrives. */
        }
        <Button
          mode="text"
          onPress={() => setStationOpen(true)}
          style={styles.retry}
        >
          {t('status.openStation')}
        </Button>

        <ServerAddressDialog
          visible={serverOpen}
          onDismiss={() => setServerOpen(false)}
        />
        <StationModal
          visible={stationOpen}
          onDismiss={() => setStationOpen(false)}
        />
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
        contentContainerStyle={{
          // The header scrolls with the content, so nothing else keeps it out
          // from under the status bar. Without this the place name and its
          // Change button sit beneath the clock on a phone that draws behind
          // the bar, which puts the only way to change location out of reach.
          paddingTop: insets.top,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          place={prediction.from.label}
          offline={offline}
          onPressPlace={() => setPickerOpen(true)}
          onRefresh={() => void refetch()}
          refreshing={isFetching}
          onOpenStation={() => setStationOpen(true)}
        />

        <BandSelector
          value={band}
          onChange={setBand}
          onEditStation={() => setStationOpen(true)}
          requiredSnrDb={prediction.requiredSnrDb}
        />

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

      {
        /* The bearing lets the beam be aimed at the other end in one tap,
          which is what an operator does before calling. */
      }
      <StationModal
        visible={stationOpen}
        onDismiss={() => setStationOpen(false)}
        bearingToDestination={prediction.bearingDeg}
        destinationLabel={prediction.to.label}
        requiredSnrDb={prediction.requiredSnrDb}
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
