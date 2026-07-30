import { useQuery } from '@tanstack/react-query';

import { canMapLocally, coverLocally } from '../data/localCoverage';
import { canPredictLocally, predictLocally } from '../data/localPredict';
import type { BandKey, Endpoint } from '../data/types';
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

/** Place search. Also accepts a Maidenhead locator, resolved without a network call upstream. */
export function useGeocode(query: string, lang: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.geocode(trimmed.toLowerCase(), lang),
    queryFn: () => fetchGeocode(trimmed, lang),
    enabled: trimmed.length >= 2,
    staleTime: 24 * 60 * 60 * 1000,
  });
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
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}
