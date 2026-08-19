import {
  hashKey,
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { searchCities } from '../data/cities';
import { formatLatLon, parseCoordinates } from '../data/coords';
import {
  CENTRE_LAT_STEP,
  CENTRE_LON_STEP,
  FINE_CENTRE_LAT_STEP,
  FINE_CENTRE_LON_STEP,
} from '../data/correctMap';
import { patchGrid, patchKey } from '../data/coveragePatch';
import { fetchGeocode as fetchGeocodeDirect } from '../data/geocode';
import type { MapIdentity } from '../data/globeName';
import { keepGlobe, makeRoom, readGlobe } from '../data/globeStore';
import { gridToLatLon, isGrid, latLonToGrid } from '../data/grid';
import {
  fetchSounding as fetchSoundingDirect,
  usefulStation,
} from '../data/ionosonde';
import {
  canMapLocally,
  centresLocally,
  correctedCoverage,
  correctedPatch,
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
import {
  fetchSpaceWeather as fetchSpaceWeatherDirect,
  NOWCAST_GOOD_FOR_MS,
} from '../data/spaceWeather';
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
import { today, usePathStore } from '../store/usePathStore';
import { useSettingsStore } from '../store/useSettingsStore';
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
import { MAP_CACHE_MS, pruneFineGlobes, touchFineGlobe } from './mapCache';
import { type BandFill, useBandFill } from './useBandFill';
import { useCalibration } from './useCalibration';

/**
 * All network state goes through React Query. Query keys carry every input the
 * request depends on, so changing the path or the language refetches without
 * any manual invalidation.
 */

/**
 * Enough local matches that the network is not worth asking.
 *
 * The bundled list holds cities, so a query it answers several times over
 * is about a city and the geocoder would repeat it. Below this the reader
 * may be after somewhere smaller, which is what the network is for.
 */
const LOCAL_ENOUGH = 5;

/**
 * How often the app looks for new readings, and the whole of its polling.
 *
 * SWPC publishes the flux daily and the K index every three hours, so this
 * is already more often than the numbers move. The forecast is driven by
 * them: an app left open through an evening should follow a storm.
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
    engine: string,
  ) =>
    ['prediction', server, from, to, date, nowcast, station, engine] as const,
  geocode: (query: string, lang: string) => ['geocode', query, lang] as const,
  sounding: (server: string, lat: number, lon: number) =>
    ['sounding', server, lat, lon] as const,
};

/**
 * The three queries that answer "where does this band reach": the coarse
 * map, the fine grid over the world, and the patch under the view. Named
 * here because each key is the same key with a different first part.
 */
type MapQuery = 'coverage' | 'fineGlobe' | 'coveragePatch';

/**
 * Puts the bands a run answered where their own queries will find them.
 *
 * One area run answers every band, since almost everything it does before
 * it reaches a frequency is shared. Without this the other bands are
 * thrown away and recomputed the moment the reader changes band.
 *
 * Written into the cache rather than returned, so every query stays keyed
 * by its own band and nothing else changes. The band asked for is skipped:
 * React Query stores this query's own answer.
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
 * One place, so the two cannot drift: a key missing a field serves an
 * answer computed for a different antenna, which looks like an ordinary
 * forecast and is not one.
 */
function useStation() {
  const presets = useStationStore((s) => s.presets);
  const activeId = useStationStore((s) => s.activeId);
  // True while the station dialog is open — see `editing` in the store.
  const editing = useStationStore((s) => s.editing);
  // Name and identifier stay out of the key: two presets set up alike
  // should share an answer, and renaming one should not discard it.
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
 * Its own query because the two fail separately: a device with the engine
 * can always forecast, and this is the one thing on screen that needs a
 * network. A failure here empties one card and leaves the forecast.
 *
 * The source follows the engine: a device fetches SWPC itself, the web
 * build reaches the same two feeds through the server.
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
  // A reading older than the window it describes is not a now-cast.
  //
  // Readings are kept on disk for a week so a forecast survives losing
  // the network (`persist.ts`). Without an age test a device with no
  // signal would drive today's map from Tuesday's storm: the number is
  // the highest K index of the last 24 hours, so past 24 hours it
  // describes a window that has gone.
  //
  // Climatology loses nothing — it is the monthly figure the reading was
  // refining, and the basis beside the map says which one answered.
  const observedAt = Date.parse(spaceWeather.observedAt);
  if (
    Number.isFinite(observedAt)
    && Date.now() - observedAt > NOWCAST_GOOD_FOR_MS
  ) {
    return undefined;
  }
  return {
    effectiveSsn: spaceWeather.effectiveSsn,
    kpMax24h: spaceWeather.kpMax24h,
  };
}

/**
 * The part of a now-cast that changes an answer, as a query key fragment.
 *
 * `none` or a pair of numbers, so climatology and a now-cast for one day
 * are different entries, and a forecast recomputes when the conditions
 * move — the point of polling for them.
 */
const nowcastKey = (nowcast: Nowcast | undefined): string =>
  nowcast ? `${nowcast.effectiveSsn}/${nowcast.kpMax24h}` : 'none';

/**
 * The part of a now-cast a lattice of daily middles depends on.
 *
 * The sunspot number alone. A storm widens the spread below the median
 * and leaves the median alone, so the K index cannot move these — and
 * whole-day runs are the expensive ones to repeat for the same answer.
 */
const centreNowcastKey = (nowcast: Nowcast | undefined): string =>
  nowcast ? `${nowcast.effectiveSsn}` : 'none';

/**
 * What a map run is about: this origin, band, hour, day, these readings,
 * this station, and whether the engine here answers or the server does.
 *
 * The three map queries differ only in the request they make. Written out
 * three times, a key part added to one copy and missed in another does
 * not fail — it serves an answer computed for something else.
 */
function useMapRun(from: Endpoint, band: BandKey, reportedHour: number) {
  // A prediction is monthly climatology: the engine reads month and year
  // out of this date and never the day (`areaAsk` in `localCoverage.ts`),
  // and the server reduces it to the same two. Keeping the day threw
  // every computed map away at midnight and recomputed it from nothing.
  //
  // The first of the month rather than today, so two runs sharing a key
  // ask for exactly the same thing. A bare `YYYY-MM` would be shorter and
  // is not parsed alike by every engine — Hermes here, V8 on the server.
  const month = today().slice(0, 7);
  const date = `${month}-01`;
  const station = useStation();
  const ready = usePathStore((state) => state.ready);
  const local = canMapLocally();
  const nowcast = nowcastFrom(useSpaceWeather().data);
  // The map is the expensive answer, so it must not be shown from the
  // wrong model. It enters every key below, both requests, and the name
  // a stored map is filed under.
  const engineModel = useSettingsStore((state) => state.engineModel);
  // Long enough to swallow a sweep, short enough that choosing one hour
  // feels immediate. The engine's own run is of the same order on a slow
  // device. The three queries share it, so the fine grid and the patch
  // describe the same moment as the map under them.
  const hour = useSettled(reportedHour, 350);

  return {
    local,
    hour,
    // Held while the station dialog is open, and run once when it closes.
    // Every control in that dialog changes the answer, and an area run is
    // the expensive one. Held again until the first-run pane has been
    // answered — see `useFirstRunAnswered`.
    enabled: !station.editing && ready,

    /**
     * The key for one of these queries. `forBand` is how a run that
     * answered every band files the others: same builder, so a key that
     * stops matching stops the sharing rather than filing one band's map
     * under another's name.
     */
    key: (
      kind: MapQuery,
      forBand: BandKey = band,
      extra: readonly string[] = [],
    ) =>
      [
        kind,
        // Which engine answered is part of the identity. A cached answer
        // from one must not be shown as the other's.
        local ? 'device' : API_BASE,
        from.grid,
        forBand,
        hour,
        month,
        nowcastKey(nowcast),
        station.key,
        engineModel,
        ...extra,
      ] as const,

    /**
     * The key for a lattice of daily middles. No hour and no K index: the
     * middle of a day is the same number whatever hour is on screen, so
     * one answer serves every hour the reader scrubs to.
     */
    centreKey: (lattice: 'coarse' | 'fine', forBand: BandKey | 'all') =>
      [
        'centres',
        local ? 'device' : API_BASE,
        from.grid,
        forBand,
        lattice,
        month,
        centreNowcastKey(nowcast),
        station.key,
        engineModel,
      ] as const,

    /**
     * What a stored map for this run is filed under, or null when the run
     * is not one to store. One rule behind both conditions: a stored map
     * is worth the room only if it can be read again.
     *
     * The device has to be answering — where the server answers there is
     * a network, and a device with a network can ask again. And there has
     * to be no live reading: a map filed under one is looked for under
     * the next, fifteen minutes later, so it is dead on arrival. What is
     * left is the offline case, which is the field case.
     */
    stored: (forBand: BandKey = band): MapIdentity | null =>
      local && nowcast === undefined
        ? {
          grid: from.grid,
          station: station.key,
          engine: engineModel,
          band: forBand,
          month,
          hour,
        }
        : null,

    /**
     * What the engine in this build is asked. It takes the antenna's own
     * numbers rather than the query string the server reads.
     */
    engine: {
      from,
      band,
      hour,
      date: new Date(`${date}T00:00:00Z`),
      station: station.station,
      nowcast,
      engine: engineModel,
    },

    /** What the server is asked. */
    request: {
      from: `${from.lat},${from.lon}`,
      fromLabel: from.label,
      band,
      hour,
      date,
      nowcast: true,
      station: station.params,
      // Named only for the new model, as the path forecast does: the
      // classic request stays the shape every old server understands.
      engine: engineModel === 'truecast' ? engineModel : undefined,
    },

    /**
     * How long an answer lasts.
     *
     * On the device the readings are in the key, so a stale entry is one
     * whose conditions have not moved: nothing to refetch, and the space
     * weather poll brings the new answer. The server picks its own
     * readings, unseen by this key, so that path expires on the interval.
     */
    keeping: {
      // So the screen keeps the map it already had rather than falling
      // back to the loading state on every adjustment.
      placeholderData: keepPreviousData,
      staleTime: local ? Number.POSITIVE_INFINITY : SPACE_WEATHER_POLL_MS,
      gcTime: MAP_CACHE_MS,
    },
  };
}

/**
 * Today's prediction for the path, covering all 24 hours.
 *
 * One request, not one per hour: the response already carries every band at
 * every hour, so moving the clock is a lookup rather than a fetch.
 */
export function usePrediction(from: Endpoint, to: Endpoint | null) {
  const date = today();
  const station = useStation();
  const ready = usePathStore((state) => state.ready);
  // The engine is in this build, or it is not; it cannot appear part way
  // through a session, so this is not state.
  const local = canPredictLocally();
  // Not awaited. The forecast is drawn from the month's figure as soon as
  // the engine can produce one and re-runs as a now-cast when the readings
  // arrive, which is a key change. Waiting would put the network in front
  // of a forecast that needs none.
  const nowcast = nowcastFrom(useSpaceWeather().data);
  const engineModel = useSettingsStore((state) => state.engineModel);

  return useQuery({
    queryKey: queryKeys.prediction(
      // Which engine answered is part of the identity. A cached answer from
      // one must not be shown as the other's.
      local ? 'device' : API_BASE,
      from.grid,
      // A survey is a different answer for the same origin, so it needs
      // its own entry rather than the last destination's.
      to === null ? 'anywhere' : to.grid,
      date,
      nowcastKey(nowcast),
      station.key,
      // The model preference is part of the identity for the same reason
      // the device-or-server choice is.
      engineModel,
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
              engine: engineModel,
            })
            : await predictLocally({
              from,
              to,
              date: day,
              station: station.station,
              nowcast,
              engine: engineModel,
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
        // Named only for the new model: the classic request stays the
        // shape every old server understands.
        engine: engineModel === 'truecast' ? engineModel : undefined,
      };
      return to === null
        ? await fetchSurvey(common)
        : await fetchPrediction({
          ...common,
          to: `${to.lat},${to.lon}`,
          toLabel: to.label,
        });
    },
    // Held while the station dialog is open, and run once when it closes,
    // and until the reader has said where they are.
    enabled: !station.editing && ready,
    // Keeps the forecast on screen rather than the loading state on every
    // adjustment, and covers the climatology-to-now-cast change: the first
    // answer stays up while the second is computed.
    placeholderData: keepPreviousData,
    // On the device the readings are in the key, so a stale entry is one
    // whose conditions have not moved: nothing to refetch, and the poll
    // above brings the new answer. The server picks its own readings,
    // unseen by this key, so that path expires on the interval.
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
  const ready = usePathStore((state) => state.ready);
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
    enabled: ready && (!local || covered),
    // Stations sound every 5 to 15 minutes.
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
  });
}

/**
 * Place search: the bundled list first, the network only for what it lacks.
 *
 * A Maidenhead locator is arithmetic, so it is answered here and never
 * fetched. The server used to resolve one, which still meant a network
 * call, so a grid square could not be typed offline.
 *
 * A place name is looked up in VOACAP's own city list, which ships with
 * the app: 4,064 places and nothing smaller, no villages or streets. The
 * network geocoder is still asked and its answers added after the local
 * ones; with no network that request fails and the local results stand.
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
    // Decimal or degrees-minutes-seconds. Arithmetic like the locator: a
    // coordinate is already what a geocoder would be asked to produce.
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
    // Direct on every platform: Open-Meteo's geocoder needs no key and
    // allows browsers, so unlike the ionosonde it needs no server.
    queryFn: () => fetchGeocodeDirect(trimmed, lang),
    // A locator, a coordinate and a query the list answers well need no
    // lookup. Asking anyway spends a request, and offline it puts a
    // failure beside results that are already correct.
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
    // A failed lookup is worth reporting only when nothing was found
    // without it. With results on screen it is not the reader's problem.
    error: local.length > 0 ? null : remote.error,
  };
}

/**
 * Coverage for the selected band at the selected hour.
 *
 * One run per hour, because an area run computes one hour. Generous on
 * staleness like a prediction: the climatology under it does not move
 * within a month. An area run is 192 paths where a forecast is one, so on
 * the device this is the expensive query, and each answered hour stays
 * cached for the session.
 *
 * The hour is taken once the slider settles. The engine runs one request
 * at a time, so a swept day would queue two dozen runs and leave the map
 * many seconds behind the finger, mostly on hours already passed.
 */
/**
 * The lattice of daily middles for every band, on the coarse grid.
 *
 * The first correction the map gets, and the cheapest: 192 places, one
 * whole-day pass, every band together. It is asked for beside the coarse
 * map rather than after it, so the map is corrected almost as soon as it
 * is drawn.
 *
 * The server corrects its own answers before sending them, so this only
 * runs where the engine is in the app.
 */
function useCoarseCentres(from: Endpoint, band: BandKey, hour: number) {
  const run = useMapRun(from, band, hour);
  return useQuery({
    queryKey: run.centreKey('coarse', 'all'),
    queryFn: () =>
      centresLocally(run.engine, CENTRE_LAT_STEP, CENTRE_LON_STEP, null),
    enabled: run.local && run.enabled,
    ...run.keeping,
    // A map without it is the map this application always drew, so a
    // second attempt is not worth an engine run in front of the
    // reader's next one.
    retry: false,
  });
}

/**
 * The finer lattice, for one band, which the whole-world grid waits for.
 *
 * 1,728 places rather than 192, costing about as much as the fine grid
 * itself, and it has to land first: a grid is corrected as it is packed
 * and cannot be improved without being computed again. It does not depend
 * on the hour, so it is computed once a band.
 */
function useFineCentres(
  from: Endpoint,
  band: BandKey,
  hour: number,
  enabled: boolean,
) {
  const run = useMapRun(from, band, hour);
  return useQuery({
    queryKey: run.centreKey('fine', band),
    queryFn: async () => {
      const one = await centresLocally(
        run.engine,
        FINE_CENTRE_LAT_STEP,
        FINE_CENTRE_LON_STEP,
        band,
      );
      return one[band];
    },
    enabled: enabled && run.local && run.enabled,
    ...run.keeping,
    retry: false,
  });
}

/**
 * Which bands are corrected yet, and which one is being worked out.
 *
 * `useFineCentres` asks for the band on screen; this fills the rest in
 * behind the map and reports progress so the band grid can show it.
 */
export function useBandProgress(
  from: Endpoint,
  band: BandKey,
  reportedHour: number,
): BandFill {
  const run = useMapRun(from, band, reportedHour);
  // The device measures its own best thread count from here too: this
  // hook is mounted exactly when the map is. See `calibrate.ts`.
  useCalibration(run.local && run.enabled);
  return useBandFill({
    local: run.local,
    enabled: run.enabled,
    band,
    engine: run.engine,
    keyFor: (other) => run.centreKey('fine', other),
  });
}

export function useCoverage(
  from: Endpoint,
  band: BandKey,
  reportedHour: number,
) {
  const run = useMapRun(from, band, reportedHour);
  const client = useQueryClient();
  const centres = useCoarseCentres(from, band, reportedHour);
  const station = useStation();
  const kp = nowcastFrom(useSpaceWeather().data)?.kpMax24h ?? null;

  const query = useQuery({
    queryKey: run.key('coverage'),
    queryFn: async () => {
      if (!run.local) return await fetchCoverage(run.request);
      const all = await coverAllBandsLocally(run.engine);
      // The other bands came back from the same run, so a band change
      // reads from memory instead of running the engine again.
      seedBands(client, band, all, (other) => run.key('coverage', other));
      return all[band];
    },
    enabled: run.enabled,
    ...run.keeping,
    retry: 1,
  });

  // Corrected on read, not on run, so the map appears at once and becomes
  // right a moment later without being computed twice. Nothing announces
  // it (user, 2026-08-09).
  const data = useMemo(() => {
    const map = query.data;
    if (map === undefined || !run.local) return map;
    return correctedCoverage(
      map,
      centres.data?.[band] ?? null,
      station.station,
      kp,
    );
  }, [query.data, centres.data, band, run.local, station.station, kp]);

  return { ...query, data };
}

/**
 * The fine grid, over the whole world, for one band and hour.
 *
 * Its own query, which is the point: the coarse map answers the question
 * the screen asks and has to be drawn as soon as it exists, while this is
 * a slower answer at a scale the coarse one cannot reach. One request for
 * both would hold the map back on every hour the slider stops at. It
 * arrives behind the coarse map and replaces its cells, leaving the
 * coarse query untouched.
 *
 * Nothing about the view is in the key. The viewport patch refetches
 * whenever the map is pointed elsewhere; this is asked once and answers
 * every pan and zoom from what it holds, which is why 34,560 points are
 * worth paying for.
 *
 * Three conditions before it is asked at all:
 *
 * A canvas has to exist for 34,560 cells. The SVG renderer cannot hold
 * that many, so on the legacy build the run would change nothing.
 *
 * The device has to afford it where the device answers — measured, not
 * assumed (`engineBudget.ts`), from two probe runs shaped like the fine
 * grid. False until those are timed, so an unknown device spends a
 * fraction of a second finding out rather than one full run.
 *
 * Where the server answers there is nothing to gate: it shards across
 * processes and replies in about 440 ms whatever the phone is.
 */
export function useFineGlobe(
  from: Endpoint,
  band: BandKey,
  reportedHour: number,
  enabled = true,
) {
  const run = useMapRun(from, band, reportedHour);
  // The lattice first, then the grid. A grid is corrected as it is
  // packed, so one built before its lattice arrived would be built again
  // to improve it — 34,560 points, twice, to move a few colours.
  const centres = useFineCentres(
    from,
    band,
    reportedHour,
    enabled && hasSkia && run.enabled,
  );
  const centre = centres.data ?? null;
  // Settled means the lattice arrived or failed. A failure still lets the
  // grid run: an uncorrected fine grid beats none, and is what this
  // application drew until now.
  const centreSettled = !run.local || centres.isSuccess || centres.isError;

  // Whether this grid is read back from disk instead of computed, and
  // kept when computed. `stored` is null for runs that must not be kept
  // (`useMapRun`). The lattice has to have arrived too: storing an
  // uncorrected grid would serve the rougher answer all month.
  const keepMaps = useSettingsStore((state) => state.keepMaps);
  const budgetMb = useSettingsStore((state) => state.mapBudgetMb);
  const stored = keepMaps ? run.stored() : null;

  const query = useQuery({
    queryKey: run.key('fineGlobe'),
    queryFn: async () => {
      if (stored !== null) {
        const held = await readGlobe(stored);
        if (held !== null) return held;
      }
      const grid = run.local
        ? await coverFineLocally(run.engine, centre)
        : await fetchFineGlobe(run.request);
      if (stored !== null && centre !== null) {
        // Room is made after the write and not before, so a map is
        // never dropped to make room for one that then fails to arrive.
        if (await keepGlobe(stored, grid)) {
          await makeRoom(budgetMb * 1024 * 1024);
        }
      }
      return grid;
    },
    // `hasSkia` is a renderer limit, not a speed one: the legacy SVG
    // cell field cannot hold 34,560 shapes, so on that build the run
    // would cost seconds and change nothing on screen. Every device that
    // can draw the grid runs it (user, 2026-08-01).
    enabled: enabled && hasSkia && run.enabled && centreSettled,
    ...run.keeping,
    // No retry, as for the patch: the coarse map is the answer and this
    // is detail on top of it, so a second attempt spends seconds of
    // engine time on something nothing depends on.
    retry: false,
  });

  // No run here to fill in the other bands. 0.49.0 had one behind the
  // drawn map and it made a band change far worse: the engine module runs
  // one request at a time by design (the single-thread executor in
  // `HfcastEngineModule.kt`), so the fill-in happened in front of the
  // reader's next run, not beside it. Measured on a Pixel 8: about 30
  // seconds to change band (user, 2026-08-01) against 3.4 for the run.
  //
  // What to do instead is open work, and needs the two costs measured.

  useFineGlobeCache(hashKey(run.key('fineGlobe')), query.dataUpdatedAt);
  return query;
}

/**
 * Keeps the fine grids an hour, and no more of them than will fit.
 *
 * Split from `useFineGlobe` so the query stays a query. It records that
 * this grid is the one being read, which sets the order they are dropped
 * in — the key changes on every move to another band or hour, computed or
 * read back — and then counts what is held.
 */
function useFineGlobeCache(queryHash: string, landed: number) {
  const client = useQueryClient();
  useEffect(() => {
    // Zero is React Query's "nothing has arrived here yet". Nothing has
    // been read and nothing has been added to count.
    if (landed === 0) return;
    touchFineGlobe(client, queryHash);
    pruneFineGlobes(client);
  }, [client, queryHash, landed]);
}

export function useCoveragePatch(
  from: Endpoint,
  band: BandKey,
  reportedHour: number,
  reportedRegion: MapRegion | null = null,
  /**
   * False turns the patch off entirely.
   *
   * The whole-world fine grid already answers at the patch's own step, so
   * running both would redraw cells that are already there. Worth asking
   * only below that step, at the deepest zoom.
   */
  enabled = true,
) {
  const run = useMapRun(from, band, reportedHour);
  const client = useQueryClient();
  // The finer lattice, not the coarse one under the map. At the deepest
  // zoom this sits on the whole-world fine grid, and two regions
  // corrected from different lattices meet at a visible seam.
  const centres = useFineCentres(from, band, reportedHour, enabled);
  const station = useStation();
  const kp = nowcastFrom(useSpaceWeather().data)?.kpMax24h ?? null;
  // The same delay the hour gets: a pinch or a drag is a stream of
  // values, and a run per frame answers views already left.
  const region = useSettled(reportedRegion, 350);
  // Two views producing the same grid share an answer, so panning within
  // one cell costs nothing. `patchGrid` snaps to the engine's own
  // lattice, which is what makes that exactly rather than nearly true.
  const grid = region
    ? patchGrid(region.lat, region.lon, region.halfLatDeg)
    : patchGrid(from.lat, from.lon);

  // The rectangle is part of the identity here and nowhere else: the
  // globe answers every view it holds, this is asked about the view.
  const here = [patchKey(grid)];

  const query = useQuery({
    queryKey: run.key('coveragePatch', band, here),
    queryFn: async () => {
      if (run.local) {
        const all = await coverPatchAllBandsLocally({ ...run.engine, region });
        // Null near the antimeridian, where there is no rectangle to
        // run. Nothing to share then, and every band is equally absent.
        if (all === null) return null;
        seedBands(
          client,
          band,
          all,
          (other) => run.key('coveragePatch', other, here),
        );
        return all[band];
      }
      return await fetchCoveragePatch({ ...run.request, region });
    },
    enabled: enabled && run.enabled,
    ...run.keeping,
    // No retry. The coarse map is the answer and this is detail on top,
    // so a second attempt spends a run on something nothing depends on.
    retry: false,
  });

  // Corrected on read like the coarse map, but from the finer lattice for
  // the reason above. A few hundred points, so it costs nothing worth
  // measuring and saves running the rectangle again for a better lattice.
  const data = useMemo(() => {
    const patch = query.data;
    if (patch === undefined || patch === null || !run.local) return patch;
    return correctedPatch(patch, centres.data ?? null, station.station, kp);
  }, [query.data, centres.data, run.local, station.station, kp]);

  return { ...query, data };
}
