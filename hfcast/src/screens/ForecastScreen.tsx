import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppHeader from '../components/AppHeader';
import BandSelector from '../components/BandSelector';
import Collapsible from '../components/Collapsible';
import DisclaimerCard from '../components/DisclaimerCard';
import FirstRunLocation from '../components/FirstRunLocation';
import LocationPicker from '../components/LocationPicker';
import ReachCard from '../components/ReachCard';
import ReachGrid from '../components/ReachGrid';
import SectionHeading from '../components/SectionHeading';
import SpaceWeatherCard from '../components/SpaceWeatherCard';
import StationModal from '../components/StationModal';

import { usePrediction, useSounding, useSpaceWeather } from '../api/queries';
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
  const [stationOpen, setStationOpen] = useState(false);

  const from = usePathStore((s) => s.from);
  const to = usePathStore((s) => s.to);
  const ready = usePathStore((s) => s.ready);
  const finishFirstRun = usePathStore((s) => s.finishFirstRun);
  const band = usePathStore((s) => s.band);
  const setBand = usePathStore((s) => s.setBand);
  const hour = usePathStore((s) => s.hour);
  const setHour = usePathStore((s) => s.setHour);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data, error, isPending, refetch } = usePrediction(from, to);

  // Current conditions, and the only thing on this screen that needs a
  // network. It drives the now-cast as well as the card, so a failure here
  // costs accuracy rather than the forecast.
  const weather = useSpaceWeather();

  // Measured foF2 near the transmitting end, when a sounder is close
  // enough. Independent of the forecast: it never delays or blocks it.
  const { data: sounding } = useSounding(from);

  const ui = theme.colors.ui;
  const nowHour = now.getUTCHours();

  // Offline is about the readings, not the forecast. On a device the engine
  // is compiled in, so a forecast is always available and only the live
  // conditions can be missing — which is exactly what the chip warns about.
  const offline = Boolean(weather.error);

  // Both refresh paths ask for the same two things: new readings, and the
  // forecast that follows from them. On the device the forecast recomputes on
  // its own once the readings change, but the web build fetches both.
  const refresh = () => {
    void weather.refetch();
    void refetch();
  };

  // The status bar overlaps these too, and the error screen is tall enough on a
  // small phone to reach it.
  const safe = { paddingTop: insets.top, paddingBottom: insets.bottom };

  // Before anything else, and before any forecast is computed: a first launch
  // has no location, and the forecast it would show is about nowhere the
  // reader chose. The queries above still run, which is deliberate — the
  // space weather poll starts while the pane is open, so the first forecast
  // after it is answered is already a now-cast.
  if (!ready) return <FirstRunLocation onDone={finishFirstRun} />;

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
          {t('status.errorBody')}
        </Text>
        {
          /* The reason is shown verbatim. On a device this is an engine
             fault, which is rare and specific; on the web build it is the
             server, and "no answer after 10s" and "could not reach" are
             different faults worth telling apart. */
        }
        <Text
          style={[typography.caption, styles.centreDetail, { color: ui.text3 }]}
        >
          {error instanceof Error ? error.message : String(error)}
        </Text>
        <Button mode="contained" onPress={refresh} style={styles.retry}>
          {t('status.retry')}
        </Button>
        {
          /* The station is worth reaching from here too. It needs nothing
             this screen is missing — power, mode, antenna and its compass are
             all local — and this screen is the whole app until a forecast
             arrives. */
        }
        <Button
          mode="text"
          onPress={() => setStationOpen(true)}
          style={styles.retry}
        >
          {t('status.openStation')}
        </Button>

        <StationModal
          visible={stationOpen}
          onDismiss={() => setStationOpen(false)}
        />
      </View>
    );
  }

  const { prediction } = data;

  // From the query of its own, whichever fetched it. The prediction response
  // carries a copy on the web build; this is the one source so the card and
  // the run it drove cannot disagree.
  const spaceWeather = weather.data ?? null;

  // A grid of 216 identical closed cells is a true answer that looks like a
  // failed one. Very long paths give exactly that — the engine's best cell
  // over 16,000 km was 0.12 — so it gets said in words as well as drawn.
  const allClosed = prediction.cells.every(
    (c) => qualityFor(c.reliability) === 'closed',
  );

  return (
    <View style={[styles.root, { backgroundColor: ui.page }]}>
      {
        /* Fixed, outside the scroller (user, 2026-08-01).

           These are the controls that say what is being forecast — where,
           which station, which band — and everything below them is the
           answer. Scrolled with the content they slid under the status
           bar, so the place name ended up behind the clock and the signal
           icons: unreadable, and still the only way to change location.
           Padding alone could not fix that, because padding sets where
           content starts and the complaint was about where it goes.

           It also means the band can be changed while reading the grid
           further down, which is the comparison the grid is for. */
      }
      <View style={{ paddingTop: insets.top, backgroundColor: ui.page }}>
        <AppHeader
          place={prediction.from.label}
          destination={prediction.to === null
              || prediction.distanceKm === null
              || prediction.bearingDeg === null
            ? null
            : {
              label: prediction.to.label,
              distanceKm: prediction.distanceKm,
              bearingDeg: prediction.bearingDeg,
            }}
          offline={offline}
          onPressPlace={() => setPickerOpen(true)}
          onRefresh={refresh}
          refreshing={weather.isFetching}
          onOpenStation={() => setStationOpen(true)}
        />

        <BandSelector
          value={band}
          onChange={setBand}
          onEditStation={() => setStationOpen(true)}
          requiredSnrDb={prediction.requiredSnrDb}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          // No top inset: the fixed header above already clears the status
          // bar, and repeating it here would leave a gap the width of the
          // bar between the band chips and the map.
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ReachCard
          prediction={prediction}
          band={band}
          hour={hour}
          onHourChange={setHour}
        />

        {
          /* Named for the destination, because this grid is about one path.
             The map above answers the other question — who can hear you —
             and the two were reading as the same thing. */
        }
        <SectionHeading
          title={prediction.to
            ? t('sections.allBandsTo', { place: prediction.to.label })
            : t('sections.allBandsAnywhere')}
          hint={allClosed
            ? (prediction.to
              ? t('sections.noneReach', { place: prediction.to.label })
              : t('sections.noneReachAnywhere'))
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
        {
          /* The time is when these readings were fetched, not when the
             forecast was computed. They are different clocks now that the
             two are separate queries, and the tag is about the readings. A
             card with nothing in it gets no time at all rather than 1970. */
        }
        <Collapsible
          title={t('sections.sun')}
          tag={weather.dataUpdatedAt === 0
            ? undefined
            : t(offline ? 'spaceWeather.asOf' : 'spaceWeather.updated', {
              time: new Date(weather.dataUpdatedAt).toISOString().slice(11, 16),
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

      {
        /* One pane for both ends, reached from the path name. It opens on
           whichever end it was last left on, which is the near one until
           somebody changes it. */
      }
      <LocationPicker
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
      />

      {
        /* The bearing lets the beam be aimed at the other end in one tap,
          which is what an operator does before calling. With no destination
          there is nothing to aim at, and the control is absent rather than
          pointing somewhere arbitrary. */
      }
      <StationModal
        visible={stationOpen}
        onDismiss={() => setStationOpen(false)}
        bearingToDestination={prediction.bearingDeg ?? undefined}
        destinationLabel={prediction.to?.label}
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
