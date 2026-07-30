import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { searchCities } from '../data/cities';
import { gridToLatLon, isGrid } from '../data/grid';
import { canMapLocally, coverLocally } from '../data/localCoverage';
import { canPredictLocally, predictLocally } from '../data/localPredict';
import type { BandKey, Endpoint, Place } from '../data/types';
import { useSettled } from '../hooks/useSettled';
import { today } from '../store/usePathStore';
import { useServerStore } from '../store/useServerStore';
import {
  activePreset,
  stationKey,
  stationParams,
  useStationStore,
} from '../store/useStationStore';
import {
  fetchCoverage,
  fetchGeocode,
  fetchPrediction,
  fetchSounding,
} from './client';

/**
 * All network state goes through React Query. Query keys carry every input the
 * request depends on, so changing the path or the language refetches without
 * any manual invalidation.
 */

/**
 * Enough local matches that the network is not worth asking.
 *
 * The bundled list holds cities, so a query it answers several times over is a
 * query about a city, and the geocoder would mostly repeat it. Below this the
 * reader may be after somewhere smaller, which is what the network is for.
 */
const LOCAL_ENOUGH = 5;

export const queryKeys = {
  prediction: (
    server: string,
    from: string,
    to: string,
    date: string,
    nowcast: boolean,
    station: string,
  ) => ['prediction', server, from, to, date, nowcast, station] as const,
  geocode: (query: string, lang: string) => ['geocode', query, lang] as const,
  sounding: (server: string, lat: number, lon: number) =>
    ['sounding', server, lat, lon] as const,
  coverage: (
    server: string,
    from: string,
    band: string,
    hour: number,
    date: string,
    station: string,
  ) => ['coverage', server, from, band, hour, date, station] as const,
};

/**
 * The station, as the part of a query key and the parameters it sends.
 *
 * Both come from one place so they cannot drift: a key that missed a
 * field would serve a cached answer computed for a different antenna,
 * which looks like an ordinary forecast and is not one.
 */
function useStation() {
  const presets = useStationStore((s) => s.presets);
  const activeId = useStationStore((s) => s.activeId);
  // True while the station dialog is open. Every control in it changes the
  // answer, so a forecast per keystroke was the cost of writing straight
  // through — see `editing` in the store.
  const editing = useStationStore((s) => s.editing);
  // The preset's name and identifier are deliberately not in the key. Two
  // presets set up identically should share a cached answer, and renaming
  // one should not throw its forecast away.
  const station = activePreset({ presets, activeId });
  return {
    params: stationParams(station),
    key: stationKey(station),
    // The whole station too, for the engine in this build: it takes the
    // antenna's own numbers rather than the query string the server reads.
    station,
    editing,
  };
}

/**
 * Today's prediction for the path, covering all 24 hours.
 *
 * One request, not one per hour: the response already carries every band at
 * every hour, so moving the clock is a lookup rather than a fetch.
 */
export function usePrediction(from: Endpoint, to: Endpoint) {
  const date = today();
  const nowcast = true;
  const station = useStation();
  const server = useServerStore((s) => s.address);
  // The engine is in this build, or it is not; it cannot appear part way
  // through a session, so this is not state.
  const local = canPredictLocally();

  return useQuery({
    queryKey: queryKeys.prediction(
      // Which engine answered is part of the identity. The device's own
      // engine works from a bundled sunspot table and the server's from live
      // figures, so the two can differ, and a cached answer from one must not
      // be shown as the other's.
      local ? 'device' : server,
      from.grid,
      to.grid,
      date,
      nowcast,
      station.key,
    ),
    queryFn: async () =>
      local
        ? {
          prediction: await predictLocally({
            from,
            to,
            date: new Date(`${date}T00:00:00Z`),
            station: station.station,
          }),
          // Space weather is a network reading. The forecast does not depend
          // on it, and the cards that show it handle its absence already.
          spaceWeather: null,
        }
        : await fetchPrediction({
          from: `${from.lat},${from.lon}`,
          to: `${to.lat},${to.lon}`,
          fromLabel: from.label,
          toLabel: to.label,
          date,
          nowcast,
          station: station.params,
        }),
    // Held while the station dialog is open, and run once when it closes.
    enabled: !station.editing,
    // So the screen behind the dialog keeps the forecast it already had
    // rather than falling back to the loading state on every adjustment.
    placeholderData: keepPreviousData,
    // A now-cast follows the solar indices, which SWPC updates a few times
    // a day. The climatology underneath it does not move within a month.
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Measured foF2 from a sounder near the transmitting end.
 *
 * Never blocks anything: a null answer is the ordinary case outside
 * Europe, and a failure leaves the forecast untouched. Not persisted
 * either — a measurement's whole value is being current, so a saved one
 * would be worse than none.
 */
export function useSounding(from: Endpoint) {
  const server = useServerStore((s) => s.address);
  return useQuery({
    queryKey: queryKeys.sounding(server, from.lat, from.lon),
    queryFn: () => fetchSounding(from.lat, from.lon),
    // Stations sound every 5 to 15 minutes and the server caches for 5.
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
  });
}

/**
 * Place search: the bundled list first, the network only for what it lacks.
 *
 * Three ways to name a place, in the order they are tried.
 *
 * A Maidenhead locator is arithmetic, so it is answered here and never fetched.
 * It used to be: the server resolved one without calling a geocoder, but
 * reaching the server was still a network call, so a grid square could not be
 * typed offline.
 *
 * A place name is looked up in VOACAP's own city list, which ships with the app.
 * That covers 4,064 places worldwide and nothing smaller — no villages, no
 * streets — so the network geocoder is still asked, and its answers are added
 * after the local ones. With no network that request simply fails and the local
 * results stand, which is the whole point.
 */
export function useGeocode(query: string, lang: string) {
  const trimmed = query.trim();

  // Synchronous and not state: the same query always gives the same places, so
  // there is nothing to cache and nothing to invalidate.
  const local = useMemo<Place[]>(() => {
    if (trimmed === '') return [];
    if (isGrid(trimmed)) {
      const { lat, lon } = gridToLatLon(trimmed);
      const grid = trimmed.toUpperCase();
      return [{ name: grid, country: '', admin1: '', lat, lon, grid }];
    }
    return searchCities(trimmed);
  }, [trimmed]);

  const remote = useQuery({
    queryKey: queryKeys.geocode(trimmed.toLowerCase(), lang),
    queryFn: () => fetchGeocode(trimmed, lang),
    // A locator needs no lookup at all, and neither does a query the list
    // already answers well. Asking anyway would spend a request, and offline it
    // would put a failure on screen beside results that are already correct.
    enabled: trimmed.length >= 2 && !isGrid(trimmed)
      && local.length < LOCAL_ENOUGH,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Local first, then anything the network adds that is not already held.
  const seen = new Set(local.map((place) => place.grid));
  const extra = (remote.data ?? []).filter((place) => !seen.has(place.grid));

  return {
    ...remote,
    data: [...local, ...extra],
    // A failed lookup is only worth reporting when nothing was found without
    // it. Offline with results on screen, the failure is not the reader's
    // problem.
    error: local.length > 0 ? null : remote.error,
  };
}

/**
 * Coverage for the selected band at the selected hour.
 *
 * One run per hour, because an area run computes one hour. Kept generous on
 * staleness for the same reason a prediction is: the climatology underneath
 * does not move within a month, and a user sweeping the clock should not
 * recompute an hour they have already seen.
 *
 * An area run is 192 paths where a forecast is one, so on the device this is
 * the expensive query. Each answered hour stays cached for the session, which
 * is what makes moving the clock cheap after the first pass.
 *
 * The hour is taken once the slider settles rather than on every value it
 * reports. The engine runs one request at a time, so a swept day would queue
 * two dozen runs and leave the map trailing the finger by many seconds, most of
 * them computing an hour already passed.
 */
export function useCoverage(
  from: Endpoint,
  band: BandKey,
  reportedHour: number,
) {
  const date = today();
  const station = useStation();
  const server = useServerStore((s) => s.address);
  const local = canMapLocally();
  // Long enough to swallow a sweep, short enough that choosing one hour feels
  // immediate. The engine's own run is of the same order on a slow device.
  const hour = useSettled(reportedHour, 350);

  return useQuery({
    queryKey: queryKeys.coverage(
      // As for a prediction: which engine answered is part of the identity,
      // because the device works from the bundled sunspot table and the
      // server from live figures.
      local ? 'device' : server,
      from.grid,
      band,
      hour,
      date,
      station.key,
    ),
    queryFn: () =>
      local
        ? coverLocally({
          from,
          band,
          hour,
          date: new Date(`${date}T00:00:00Z`),
          station: station.station,
        })
        : fetchCoverage({
          from: `${from.lat},${from.lon}`,
          fromLabel: from.label,
          band,
          hour,
          date,
          nowcast: true,
          station: station.params,
        }),
    // As for the prediction: an area run is the more expensive of the two, so
    // holding it while the station is being adjusted matters more here.
    enabled: !station.editing,
    placeholderData: keepPreviousData,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}
