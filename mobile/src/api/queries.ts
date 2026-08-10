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
};

/**
 * The three queries that answer "where does this band reach": the coarse
 * map, the fine grid over the world, and the patch under the view.
 *
 * Named here because the key each of them takes is the same key with a
 * different first part, and `useMapRun` builds all three.
 */
type MapQuery = 'coverage' | 'fineGlobe' | 'coveragePatch';

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
 * The part of a now-cast a lattice of daily middles depends on.
 *
 * The sunspot number and nothing else. A storm widens the spread below
 * the median and leaves the median where it is, so the K index cannot
 * move these numbers — and the whole-day runs are the expensive ones, so
 * recomputing every band's lattice each time a K index is polled would
 * be a lot of engine time spent to arrive back at the same answer.
 */
const centreNowcastKey = (nowcast: Nowcast | undefined): string =>
  nowcast ? `${nowcast.effectiveSsn}` : 'none';

/**
 * What a map run is about: this origin, this band, this hour, this day,
 * these readings, this station — and whether the engine in this build
 * answers or the server does.
 *
 * The three map queries differ in the request they make and in nothing
 * else. They took the same seven key parts in the same order, the same
 * arguments to the engine, the same query string to the server and the
 * same staleness rules, all written out three times. A part added to one
 * copy and missed in another does not fail: it serves a cached answer
 * computed for something else.
 */
function useMapRun(from: Endpoint, band: BandKey, reportedHour: number) {
  const date = today();
  const station = useStation();
  const local = canMapLocally();
  const nowcast = nowcastFrom(useSpaceWeather().data);
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
    // the expensive one.
    enabled: !station.editing,

    /**
     * The key for one of these queries.
     *
     * `forBand` is how a run that answered every band puts the others
     * where their own queries will look: same builder, so a key that
     * stopped matching stops the sharing rather than files one band's map
     * under another band's name.
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
        date,
        nowcastKey(nowcast),
        station.key,
        ...extra,
      ] as const,

    /**
     * The key for a lattice of daily middles.
     *
     * No hour in it, deliberately, and no K index. The middle of a day
     * is the same number whatever hour is on screen, so one answer
     * serves every hour the reader scrubs to — which is what keeps
     * scrubbing as quick as it was before the correction existed.
     */
    centreKey: (lattice: 'coarse' | 'fine', forBand: BandKey | 'all') =>
      [
        'centres',
        local ? 'device' : API_BASE,
        from.grid,
        forBand,
        lattice,
        date,
        centreNowcastKey(nowcast),
        station.key,
      ] as const,

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
    },

    /**
     * How long an answer lasts.
     *
     * On the device the readings this run was driven by are in the key, so
     * a stale entry can only be one whose conditions have not moved: there
     * is nothing to refetch, and the space weather poll is what brings a
     * new answer. The server picks its own readings, which this key cannot
     * see, so that path expires on the same interval instead.
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
 * 1,728 places rather than 192. It costs about as much as the fine grid
 * itself, and it has to land first: a fine grid is corrected when it is
 * packed and cannot be improved afterwards without being computed again.
 *
 * It does not depend on the hour, so it is computed once a band and then
 * every hour the reader scrubs to is as quick as it was before.
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
 * The band on screen is asked for in front of the reader by
 * `useFineCentres`; this fills the other eight in behind the map, and
 * reports how far it has got so the band grid can say so.
 */
export function useBandProgress(
  from: Endpoint,
  band: BandKey,
  reportedHour: number,
): BandFill {
  const run = useMapRun(from, band, reportedHour);
  // The device measures its own best thread count from here too: this
  // hook is mounted exactly when the map is, which is when the answer
  // matters. See `calibrate.ts`.
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
      // The other bands came back from the same run, so they are put
      // where the query for each of them will look. A band change then
      // reads from memory instead of running the engine again.
      seedBands(client, band, all, (other) => run.key('coverage', other));
      return all[band];
    },
    enabled: run.enabled,
    ...run.keeping,
    retry: 1,
  });

  // Corrected when it is read rather than when it was run. That is what
  // lets the map appear at once and become right a moment later without
  // the grid being computed twice. Nothing announces the change: the map
  // simply becomes more accurate (user, 2026-08-09).
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
 * A query of its own, and that is the whole point of it. The coarse map is
 * the answer to the question the screen asks, and it has to be drawn as
 * soon as it exists; this is a second, slower answer at a scale the coarse
 * one cannot reach. Putting both in one request would hold the map back
 * for the sake of detail nobody has asked to wait for, on every hour the
 * slider stops at.
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
  const run = useMapRun(from, band, reportedHour);
  // The finer lattice first, then the grid. Both are foreground work and
  // the order between them matters: a grid is corrected as it is packed,
  // so one built before its lattice arrived would have to be built again
  // to improve — 34,560 points, twice, to move a few colours.
  const centres = useFineCentres(
    from,
    band,
    reportedHour,
    enabled && hasSkia && run.enabled,
  );
  const centre = centres.data ?? null;
  // Settled means the lattice either arrived or failed. A failed one
  // still lets the grid run: an uncorrected fine grid is better than no
  // fine grid, and it is what this application drew until now.
  const centreSettled = !run.local || centres.isSuccess || centres.isError;

  const query = useQuery({
    queryKey: run.key('fineGlobe'),
    queryFn: () =>
      run.local
        ? coverFineLocally(run.engine, centre)
        : fetchFineGlobe(run.request),
    // `hasSkia` is a renderer limit, not a speed one: the legacy SVG
    // cell field cannot hold 34,560 shapes, so on that build the run
    // would cost seconds and change nothing on screen. Every device that
    // can draw the grid runs it (user, 2026-08-01).
    enabled: enabled && hasSkia && run.enabled && centreSettled,
    ...run.keeping,
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

  useFineGlobeCache(hashKey(run.key('fineGlobe')), query.dataUpdatedAt);
  return query;
}

/**
 * Keeps the fine grids an hour, and no more of them than will fit.
 *
 * Split from `useFineGlobe` so the query stays a query. It does two
 * things. It records that this grid is the one being read, which is what
 * decides the order they are dropped in — the query key changes whenever
 * the reader moves to another band or hour, so this runs on every move
 * to a grid, whether it was computed now or is being read back. Then it
 * counts what is held.
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
   * A whole-world fine grid already answers at the patch's own step, so
   * running it as well would spend a second engine run to redraw cells
   * that are already there. It is only worth asking again below that
   * step, at the deepest zoom, where the patch can still buy detail the
   * globe does not hold.
   */
  enabled = true,
) {
  const run = useMapRun(from, band, reportedHour);
  const client = useQueryClient();
  // The finer lattice, not the coarse one the map under this uses. The
  // patch is drawn on top of the whole-world fine grid at the deepest
  // zoom, so the two are side by side on the screen — and two regions
  // corrected from two different lattices meet at a seam the reader
  // would see and could not account for.
  const centres = useFineCentres(from, band, reportedHour, enabled);
  const station = useStation();
  const kp = nowcastFrom(useSpaceWeather().data)?.kpMax24h ?? null;
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

  // The rectangle is part of the identity here and of no other map query:
  // the globe answers every view it holds, and this one is asked about the
  // view itself.
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
    // No retry. The coarse map is the answer and this is detail on top of
    // it, so a second attempt spends an engine run, or a request, on
    // something whose absence nothing depends on.
    retry: false,
  });

  // Corrected on read, as the coarse map is, but from the finer lattice
  // for the reason above. The patch is a few hundred points, so doing it
  // here costs nothing worth measuring and saves the rectangle being run
  // a second time when a better lattice arrives.
  const data = useMemo(() => {
    const patch = query.data;
    if (patch === undefined || patch === null || !run.local) return patch;
    return correctedPatch(patch, centres.data ?? null, station.station, kp);
  }, [query.data, centres.data, run.local, station.station, kp]);

  return { ...query, data };
}
