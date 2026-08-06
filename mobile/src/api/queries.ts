import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { searchCities } from '../data/cities';
import { formatLatLon, parseCoordinates } from '../data/coords';
import { patchGrid, patchKey } from '../data/coveragePatch';
import { fetchGeocode as fetchGeocodeDirect } from '../data/geocode';
import { gridToLatLon, isGrid, latLonToGrid } from '../data/grid';
import {
  fetchSounding as fetchSoundingDirect,
  usefulStation,
} from '../data/ionosonde';
import {
  canMapLocally,
  coverAllBandsLocally,
  coverFineLocally,
  coverPatchAllBandsLocally,
} from '../data/localCoverage';
import {
  canPredictLocally,
  type Nowcast,
  predictLocally,
} from '../data/localPredict';
import { surveyLocally } from '../data/localSurvey';
import { fetchSpaceWeather as fetchSpaceWeatherDirect } from '../data/spaceWeather';
import {
  BAND_ORDER,
  type BandKey,
  type Endpoint,
  type MapRegion,
  type Place,
  type SpaceWeather,
} from '../data/types';
import { useSettled } from '../hooks/useSettled';
import { hasSkia } from '../render/available';
import { today } from '../store/usePathStore';
import {
  activePreset,
  stationKey,
  stationParams,
  useStationStore,
} from '../store/useStationStore';
import {
  API_BASE,
  fetchCoverage,
  fetchCoveragePatch,
  fetchFineGlobe,
  fetchPrediction,
  fetchSounding,
  fetchSpaceWeather,
  fetchSurvey,
} from './client';
import { MAP_CACHE_MS, pruneFineGlobes } from './mapCache';

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

/**
 * How often the app looks for new readings, and the whole of its polling.
 *
 * SWPC publishes the flux daily and the K index every three hours, so this is
 * already more often than the numbers move. It is the interval because the
 * forecast is driven by them: an app left open on a bench through an evening
 * should follow a storm arriving, not show the conditions it was opened on.
 */
export const SPACE_WEATHER_POLL_MS = 15 * 60 * 1000;

export const queryKeys = {
  spaceWeather: (source: string) => ['spaceWeather', source] as const,
  prediction: (
    server: string,
    from: string,
    to: string,
    date: string,
    nowcast: string,
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
    nowcast: string,
    station: string,
  ) => ['coverage', server, from, band, hour, date, nowcast, station] as const,
  fineGlobe: (
    server: string,
    from: string,
    band: string,
    hour: number,
    date: string,
    nowcast: string,
    station: string,
  ) => ['fineGlobe', server, from, band, hour, date, nowcast, station] as const,
  coveragePatch: (
    server: string,
    from: string,
    band: string,
    hour: number,
    date: string,
    nowcast: string,
    station: string,
    grid: string,
  ) =>
    [
      'coveragePatch',
      server,
      from,
      band,
      hour,
      date,
      nowcast,
      station,
      grid,
    ] as const,
};

/**
 * Puts the bands a run answered where their own queries will find them.
 *
 * The engine now answers every band from one area run, because almost
 * everything it does before it reaches a frequency is the same for all
 * of them. Only one of those bands is the one asked for; the rest would
 * be thrown away, and then recomputed the moment the reader changed
 * band.
 *
 * Written into the cache rather than returned, so nothing else has to
 * change: every query stays keyed by its own band, every layer guard
 * still compares band against band, and a band with no answer yet still
 * behaves exactly as it did.
 *
 * The band asked for is skipped — it is this query's own answer and
 * React Query stores it.
 */
function seedBands<T>(
  client: ReturnType<typeof useQueryClient>,
  asked: BandKey,
  answers: Record<BandKey, T>,
  keyFor: (band: BandKey) => readonly unknown[],
): void {
  for (const band of BAND_ORDER) {
    if (band === asked) continue;
    const answer = answers[band];
    if (answer === undefined) continue;
    client.setQueryData(keyFor(band), answer);
  }
}

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
 * Current solar and geomagnetic conditions.
 *
 * A query of its own rather than part of the forecast, because the two fail
 * separately: a device with the engine can always produce a forecast, and this
 * is the one thing on the screen that genuinely needs a network. A failure
 * here leaves the forecast alone and empties one card.
 *
 * Where it comes from follows the engine. A device fetches SWPC itself; the
 * web build has no engine and reaches everything through the server, which
 * fetches the same two feeds.
 */
export function useSpaceWeather() {
  const local = canPredictLocally();
  return useQuery({
    queryKey: queryKeys.spaceWeather(local ? 'device' : API_BASE),
    queryFn: local ? fetchSpaceWeatherDirect : fetchSpaceWeather,
    staleTime: SPACE_WEATHER_POLL_MS,
    // The only polling in the app. React Query pauses it while the app is in
    // the background, so this does not run down a battery in a pocket.
    refetchInterval: SPACE_WEATHER_POLL_MS,
    // Two attempts, then wait for the next interval. A device out of range
    // stays out of range, and retrying harder only spends power.
    retry: 1,
  });
}

/**
 * The live readings as the engine takes them, or undefined.
 *
 * Undefined covers both "not fetched yet" and "could not be fetched", which
 * are the same thing to a run: predict from the month's own figure instead.
 */
function nowcastFrom(
  spaceWeather: SpaceWeather | undefined,
): Nowcast | undefined {
  if (!spaceWeather) return undefined;
  return {
    effectiveSsn: spaceWeather.effectiveSsn,
    kpMax24h: spaceWeather.kpMax24h,
  };
}

/**
 * The part of a now-cast that changes an answer, as a query key fragment.
 *
 * `none` and a pair of numbers, so a climatology run and a now-cast for the
 * same day are different entries — and so a forecast recomputes when the
 * conditions it was driven by move, which is the point of polling for them.
 */
const nowcastKey = (nowcast: Nowcast | undefined): string =>
  nowcast ? `${nowcast.effectiveSsn}/${nowcast.kpMax24h}` : 'none';

/**
 * Today's prediction for the path, covering all 24 hours.
 *
 * One request, not one per hour: the response already carries every band at
 * every hour, so moving the clock is a lookup rather than a fetch.
 */
export function usePrediction(from: Endpoint, to: Endpoint | null) {
  const date = today();
  const station = useStation();
  // The engine is in this build, or it is not; it cannot appear part way
  // through a session, so this is not state.
  const local = canPredictLocally();
  // Deliberately not awaited. The forecast is drawn from the month's figure
  // as soon as the engine can produce one, and re-runs as a now-cast when the
  // readings arrive — which is a key change, so React Query does it. Waiting
  // instead would put the network in front of a forecast that needs none.
  const nowcast = nowcastFrom(useSpaceWeather().data);

  return useQuery({
    queryKey: queryKeys.prediction(
      // Which engine answered is part of the identity. A cached answer from
      // one must not be shown as the other's.
      local ? 'device' : API_BASE,
      from.grid,
      // A survey is a different answer for the same origin, so it needs its
      // own entry rather than sharing one with whichever destination was set
      // last.
      to === null ? 'anywhere' : to.grid,
      date,
      nowcastKey(nowcast),
      station.key,
    ),
    queryFn: async () => {
      const day = new Date(`${date}T00:00:00Z`);
      if (local) {
        return {
          prediction: to === null
            ? await surveyLocally({
              from,
              date: day,
              station: station.station,
              nowcast,
            })
            : await predictLocally({
              from,
              to,
              date: day,
              station: station.station,
              nowcast,
            }),
          // Fetched separately by `useSpaceWeather`, which is what supplied
          // the now-cast above. Null here so the shape matches the server's.
          spaceWeather: null,
        };
      }
      const common = {
        from: `${from.lat},${from.lon}`,
        fromLabel: from.label,
        date,
        nowcast: true,
        station: station.params,
      };
      return to === null
        ? await fetchSurvey(common)
        : await fetchPrediction({
          ...common,
          to: `${to.lat},${to.lon}`,
          toLabel: to.label,
        });
    },
    // Held while the station dialog is open, and run once when it closes.
    enabled: !station.editing,
    // So the screen behind the dialog keeps the forecast it already had
    // rather than falling back to the loading state on every adjustment.
    // It also covers the climatology-to-now-cast change: the first answer
    // stays on screen while the second is computed.
    placeholderData: keepPreviousData,
    // On the device the readings this run was driven by are in the key, so a
    // stale entry can only be one whose conditions have not moved: there is
    // nothing to refetch, and the poll above is what brings a new answer.
    // The server picks its own readings, which this key cannot see, so that
    // path expires on the same interval instead.
    staleTime: local ? Number.POSITIVE_INFINITY : SPACE_WEATHER_POLL_MS,
    gcTime: MAP_CACHE_MS,
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
  // As for space weather, the source follows the engine. GIRO restricts its
  // CORS header to its own origin, which blocks a browser and not a native
  // app, so a device asks GIRO and the web build asks the server.
  const local = canPredictLocally();

  // A station has to be near enough to describe the same ionosphere. Checked
  // before the query rather than inside it so most of the world makes no
  // request at all — the answer is known to be null from the coordinates.
  const covered = usefulStation(from.lat, from.lon) !== null;

  return useQuery({
    queryKey: queryKeys.sounding(
      local ? 'device' : API_BASE,
      from.lat,
      from.lon,
    ),
    queryFn: () =>
      local
        ? fetchSoundingDirect(from.lat, from.lon)
        : fetchSounding(from.lat, from.lon),
    enabled: !local || covered,
    // Stations sound every 5 to 15 minutes.
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
    // Decimal or degrees-minutes-seconds. Arithmetic like the locator, so it
    // is answered here and never fetched — a coordinate is already the
    // answer a geocoder would be asked to produce.
    const coords = parseCoordinates(trimmed);
    if (coords !== null) {
      return [{
        name: formatLatLon(coords),
        country: '',
        admin1: '',
        lat: coords.lat,
        lon: coords.lon,
        grid: latLonToGrid(coords.lat, coords.lon),
      }];
    }
    return searchCities(trimmed);
  }, [trimmed]);

  const remote = useQuery({
    queryKey: queryKeys.geocode(trimmed.toLowerCase(), lang),
    // Asked for directly, on every platform. Open-Meteo's geocoder needs no
    // key and allows browsers, so unlike the ionosonde there is no reason to
    // route it through a server the installed app cannot reach anyway.
    queryFn: () => fetchGeocodeDirect(trimmed, lang),
    // A locator and a coordinate need no lookup at all, and neither does a
    // query the list already answers well. Asking anyway would spend a
    // request, and offline it would put a failure on screen beside results
    // that are already correct.
    enabled: trimmed.length >= 2 && !isGrid(trimmed)
      && parseCoordinates(trimmed) === null
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
  const local = canMapLocally();
  const nowcast = nowcastFrom(useSpaceWeather().data);
  // Long enough to swallow a sweep, short enough that choosing one hour feels
  // immediate. The engine's own run is of the same order on a slow device.
  const hour = useSettled(reportedHour, 350);
  const client = useQueryClient();

  return useQuery({
    queryKey: queryKeys.coverage(
      // As for a prediction: which engine answered is part of the identity.
      local ? 'device' : API_BASE,
      from.grid,
      band,
      hour,
      date,
      nowcastKey(nowcast),
      station.key,
    ),
    queryFn: async () => {
      if (!local) {
        return await fetchCoverage({
          from: `${from.lat},${from.lon}`,
          fromLabel: from.label,
          band,
          hour,
          date,
          nowcast: true,
          station: station.params,
        });
      }
      const all = await coverAllBandsLocally({
        from,
        band,
        hour,
        date: new Date(`${date}T00:00:00Z`),
        station: station.station,
        nowcast,
      });
      // The other bands came back from the same run, so they are put
      // where the query for each of them will look. A band change then
      // reads from memory instead of running the engine again.
      //
      // The keys are built by the same function this query is keyed
      // with, so a key that stopped matching would stop the sharing
      // rather than serve one band's map under another band's name.
      seedBands(
        client,
        band,
        all,
        (other) =>
          queryKeys.coverage(
            'device',
            from.grid,
            other,
            hour,
            date,
            nowcastKey(nowcast),
            station.key,
          ),
      );
      return all[band];
    },
    // As for the prediction: an area run is the more expensive of the two, so
    // holding it while the station is being adjusted matters more here.
    enabled: !station.editing,
    placeholderData: keepPreviousData,
    staleTime: local ? Number.POSITIVE_INFINITY : SPACE_WEATHER_POLL_MS,
    gcTime: MAP_CACHE_MS,
    retry: 1,
  });
}

/**
 * The fine grid around the operator, for the same band and hour.
 *
 * A query of its own, and that is the whole point of it. The coarse map is
 * the answer to the question the screen asks, and it has to be drawn as
 * soon as it exists; this is a second, slower answer at a scale the coarse
 * one cannot reach. Putting both in one request would hold the map back
 * for the sake of detail nobody has asked to wait for, on every hour the
 * slider stops at.
 *
 * It follows the same settled hour as the coarse map, so the two describe
 * the same moment and the fine cells never sit on top of a map drawn for
 * a different hour.
 */
/**
 * The fine grid, over the whole world, for one band and hour.
 *
 * There is deliberately nothing about the view in the key. The viewport
 * patch has to refetch whenever the map is pointed somewhere else; this
 * is asked once and answers every pan and zoom from what it already
 * holds, which is the reason for paying for 34,560 points instead of a
 * few hundred.
 *
 * It arrives behind the coarse map and replaces its cells. The coarse
 * query is untouched, so the map is drawn from the first answer and this
 * only sharpens it.
 *
 * Three things have to hold before it is asked at all.
 *
 * A canvas has to exist to draw 34,560 cells: the SVG renderer cannot
 * hold that many, so on the legacy build the question would cost a run
 * and change nothing on screen.
 *
 * The device has to be able to afford it, when the device is the one
 * answering. That is measured rather than assumed — see
 * `engineBudget.ts` — from two probe runs shaped like the fine grid and
 * cut into the same strips. It is false until those have been timed, so
 * an unknown device spends a fraction of a second finding out rather
 * than one full fine run.
 *
 * Where the server answers, there is nothing to gate: it shards across
 * processes and replies in about 440 ms whatever the phone is.
 */
export function useFineGlobe(
  from: Endpoint,
  band: BandKey,
  reportedHour: number,
  enabled = true,
) {
  const date = today();
  const station = useStation();
  const local = canMapLocally();
  const nowcast = nowcastFrom(useSpaceWeather().data);
  const hour = useSettled(reportedHour, 350);

  const query = useQuery({
    queryKey: queryKeys.fineGlobe(
      local ? 'device' : API_BASE,
      from.grid,
      band,
      hour,
      date,
      nowcastKey(nowcast),
      station.key,
    ),
    queryFn: () =>
      local
        ? coverFineLocally({
          from,
          band,
          hour,
          date: new Date(`${date}T00:00:00Z`),
          station: station.station,
          nowcast,
        })
        : fetchFineGlobe({
          from: `${from.lat},${from.lon}`,
          fromLabel: from.label,
          band,
          hour,
          date,
          nowcast: true,
          station: station.params,
        }),
    // `hasSkia` is a renderer limit, not a speed one: the legacy SVG
    // cell field cannot hold 34,560 shapes, so on that build the run
    // would cost seconds and change nothing on screen. Every device that
    // can draw the grid runs it (user, 2026-08-01).
    enabled: enabled && hasSkia && !station.editing,
    placeholderData: keepPreviousData,
    staleTime: local ? Number.POSITIVE_INFINITY : SPACE_WEATHER_POLL_MS,
    gcTime: MAP_CACHE_MS,
    // No retry, for the same reason the patch does not: the coarse map
    // is the answer and this is detail on top of it. A second attempt
    // spends seconds of engine time on something whose absence changes
    // nothing a reader depends on.
    retry: false,
  });

  // No run here to fill in the other bands. 0.49.0 had one, behind the
  // drawn map, and it made a band change far worse rather than better:
  // the engine module runs one request at a time by design — see the
  // single-thread executor in `HfcastEngineModule.kt` — so the fill-in
  // did not happen beside the reader's next run, it happened in front
  // of it. Measured on a Pixel 8: about 30 seconds to change band
  // (user, 2026-08-01), against 3.4 for the run alone.
  //
  // What to do instead is open work. It needs the cost of the run and
  // the cost of the fill-in split and measured first.

  useFineGlobeCache(query.dataUpdatedAt);
  return query;
}

/**
 * Keeps the fine grids an hour, and no more of them than will fit.
 *
 * Split from `useFineGlobe` so the query stays a query. Runs after each
 * answer lands, which is the only moment the count can have grown.
 */
function useFineGlobeCache(landed: number) {
  const client = useQueryClient();
  useEffect(() => {
    // Zero is React Query's "nothing has arrived here yet". Nothing has
    // been added to count, so there is nothing to count.
    if (landed === 0) return;
    pruneFineGlobes(client);
  }, [client, landed]);
}

export function useCoveragePatch(
  from: Endpoint,
  band: BandKey,
  reportedHour: number,
  reportedRegion: MapRegion | null = null,
  /**
   * False turns the patch off entirely.
   *
   * A whole-world fine grid already answers at the patch's own step, so
   * running it as well would spend a second engine run to redraw cells
   * that are already there. It is only worth asking again below that
   * step, at the deepest zoom, where the patch can still buy detail the
   * globe does not hold.
   */
  enabled = true,
) {
  const date = today();
  const station = useStation();
  const local = canMapLocally();
  const nowcast = nowcastFrom(useSpaceWeather().data);
  const hour = useSettled(reportedHour, 350);
  const client = useQueryClient();
  // The same delay the hour gets, for the same reason: a pinch or a drag
  // is a stream of values, and running the engine on each one would
  // spend a run per frame to show the answer to a view already left.
  const region = useSettled(reportedRegion, 350);
  // Two views that produce the same grid share an answer, so panning
  // within one cell costs nothing. `patchGrid` snaps to the engine's own
  // lattice, which is what makes that true rather than approximately
  // true.
  const grid = region
    ? patchGrid(region.lat, region.lon, region.halfLatDeg)
    : patchGrid(from.lat, from.lon);

  return useQuery({
    queryKey: queryKeys.coveragePatch(
      local ? 'device' : API_BASE,
      from.grid,
      band,
      hour,
      date,
      nowcastKey(nowcast),
      station.key,
      patchKey(grid),
    ),
    queryFn: async () => {
      if (local) {
        const all = await coverPatchAllBandsLocally({
          from,
          band,
          hour,
          date: new Date(`${date}T00:00:00Z`),
          station: station.station,
          nowcast,
          region,
        });
        // Null near the antimeridian, where there is no rectangle to
        // run. Nothing to share then, and every band is equally absent.
        if (all === null) return null;
        seedBands(
          client,
          band,
          all,
          (other) =>
            queryKeys.coveragePatch(
              'device',
              from.grid,
              other,
              hour,
              date,
              nowcastKey(nowcast),
              station.key,
              patchKey(grid),
            ),
        );
        return all[band];
      }
      return await fetchCoveragePatch({
        from: `${from.lat},${from.lon}`,
        fromLabel: from.label,
        band,
        hour,
        date,
        nowcast: true,
        station: station.params,
        region,
      });
    },
    enabled: enabled && !station.editing,
    placeholderData: keepPreviousData,
    staleTime: local ? Number.POSITIVE_INFINITY : SPACE_WEATHER_POLL_MS,
    gcTime: MAP_CACHE_MS,
    // No retry. The coarse map is the answer and this is detail on top of
    // it, so a second attempt spends an engine run, or a request, on
    // something whose absence nothing depends on.
    retry: false,
  });
}
