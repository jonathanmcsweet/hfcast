import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
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
import { mayRefresh } from '../data/refreshPolicy';
import { useShownFor } from '../hooks/useShownFor';
import { usePathStore } from '../store/usePathStore';
import { spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * The shortest time the pull-down spinner stays on screen.
 *
 * Long enough that the gesture is acknowledged even when the cooldown
 * refused the network, which is the common case for a second pull.
 */
const PULL_SPINNER_MS = 600;

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
  const anchor = usePathStore((s) => s.anchor);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // The timeline starts at "now", and this is where "now" is refreshed:
  // when the app returns to the foreground, not while the user watches.
  // A track that shifted mid-session would move the selection under a
  // thumb that is on it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') usePathStore.getState().reanchor();
    });
    return () => sub.remove();
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
  // Stable, because the pull-down below depends on it. React Query's own
  // `refetch` functions are stable, so this only rebuilds if the queries
  // themselves are replaced.
  const refresh = useCallback(() => {
    void weather.refetch();
    void refetch();
  }, [weather.refetch, refetch]);

  // Pulling the screen down at the top asks for the same thing (user,
  // 2026-08-01), with a floor under how often it may reach the network —
  // the readings come from NOAA and GIRO, called without a key. See
  // `refreshPolicy.ts` for the two floors: an answer holds for the poll
  // interval, a failure may be retried after a minute.
  //
  // The spinner is shown for its minimum whether or not the network was
  // asked. A gesture that produced no visible response would read as the
  // app ignoring it, and inside the floor there is nothing new to fetch
  // anyway — SWPC publishes the flux once a day.
  const [pulling, setPulling] = useState(false);

  // True while the map owns a two-finger pan. The scroller is switched
  // off for that moment: refusing termination stops it stealing a pan
  // it has already lost, and this stops it competing for the next
  // touches at all. Both are needed — the first protects a pan that
  // won, the second lets a pan win when the fingers land staggered.
  const [mapPanning, setMapPanning] = useState(false);
  const pullRefresh = useCallback(() => {
    setPulling(true);
    if (mayRefresh(weather.dataUpdatedAt, weather.errorUpdatedAt, Date.now())) {
      refresh();
    }
    setPulling(false);
  }, [weather.dataUpdatedAt, weather.errorUpdatedAt, refresh]);
  const showPull = useShownFor(pulling || weather.isFetching, PULL_SPINNER_MS);

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
      {
        /* The band chips used to end flush against the map, so a fixed
           header and a scrolling page met with nothing between them and
           the join read as one block. A hairline and a small gap under
           it say where the controls stop and the answer starts (user,
           2026-08-01).

           `line2` rather than `line`. The quieter one was the first
           choice, and it stopped working when the header took a
           background of its own: `line` and the light header are
           neighbouring steps of the same ramp, so the rule vanished into
           it. `contrast.test.ts` holds that. */
      }
      <View
        style={[styles.fixed, {
          paddingTop: insets.top,
          backgroundColor: ui.headerBg,
          borderBottomColor: ui.line2,
        }]}
      >
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
        scrollEnabled={!mapPanning}
        contentContainerStyle={{
          // No top inset: the fixed header above already clears the status
          // bar, and repeating it here would leave a gap the width of the
          // bar between the band chips and the map.
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={showPull}
            onRefresh={pullRefresh}
            // The spinner is drawn by the platform, so it takes its
            // colours as props rather than from the theme.
            tintColor={ui.accent}
            colors={[ui.accent]}
            progressBackgroundColor={ui.card}
          />
        }
      >
        <ReachCard
          prediction={prediction}
          band={band}
          hour={hour}
          anchor={anchor}
          // The exact moment behind the now-cast: the live readings when
          // they have arrived, the clock when they have not.
          liveAt={weather.dataUpdatedAt || now.getTime()}
          nowMs={now.getTime()}
          onHourChange={setHour}
          onMapPanning={setMapPanning}
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
          anchor={anchor}
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
  // The gap goes above the rule, not below it. Below, it would read as
  // space belonging to the map; above, it is the header's own bottom
  // margin, which is what it is.
  fixed: {
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
