import { useQuery } from '@tanstack/react-query';

import type { BandKey, Endpoint } from '../data/types';
import { today } from '../store/usePathStore';
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
  prediction: (from: string, to: string, date: string, nowcast: boolean) =>
    ['prediction', from, to, date, nowcast] as const,
  geocode: (query: string, lang: string) => ['geocode', query, lang] as const,
  sounding: (lat: number, lon: number) => ['sounding', lat, lon] as const,
  coverage: (from: string, band: string, hour: number, date: string) =>
    ['coverage', from, band, hour, date] as const,
};

/**
 * Today's prediction for the path, covering all 24 hours.
 *
 * One request, not one per hour: the response already carries every band at
 * every hour, so moving the clock is a lookup rather than a fetch.
 */
export function usePrediction(from: Endpoint, to: Endpoint) {
  const date = today();
  const nowcast = true;

  return useQuery({
    queryKey: queryKeys.prediction(from.grid, to.grid, date, nowcast),
    queryFn: () =>
      fetchPrediction({
        from: `${from.lat},${from.lon}`,
        to: `${to.lat},${to.lon}`,
        fromLabel: from.label,
        toLabel: to.label,
        date,
        nowcast,
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
  return useQuery({
    queryKey: queryKeys.sounding(from.lat, from.lon),
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
 * One request per hour, because an area run computes one hour. Kept
 * generous on staleness for the same reason a prediction is: the
 * climatology underneath does not move within a month, and a user
 * sweeping the clock should not refetch an hour they have already seen.
 */
export function useCoverage(
  from: Endpoint,
  band: BandKey,
  hour: number,
) {
  const date = today();
  return useQuery({
    queryKey: queryKeys.coverage(from.grid, band, hour, date),
    queryFn: () =>
      fetchCoverage({
        from: `${from.lat},${from.lon}`,
        fromLabel: from.label,
        band,
        hour,
        date,
        nowcast: true,
      }),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}
