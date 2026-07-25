import { useQuery } from '@tanstack/react-query';

import type { Endpoint } from '../data/types';
import { dateForOffset } from '../store/usePathStore';
import { fetchGeocode, fetchPrediction } from './client';

/**
 * All network state goes through React Query. Query keys carry every input the
 * request depends on, so changing the path, the day, or the language refetches
 * without any manual invalidation.
 */

export const queryKeys = {
  prediction: (from: string, to: string, date: string, nowcast: boolean) =>
    ['prediction', from, to, date, nowcast] as const,
  geocode: (query: string, lang: string) => ['geocode', query, lang] as const,
};

/**
 * A prediction for one day of the path.
 *
 * Only today can be a now-cast: current solar indices say nothing about a
 * future day, so later days are climatology and are labelled as such.
 */
export function usePrediction(from: Endpoint, to: Endpoint, dayOffset: number) {
  const date = dateForOffset(dayOffset);
  const nowcast = dayOffset === 0;

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
    // Climatology for a given month does not move. The now-cast follows the
    // solar indices, which SWPC updates a few times a day.
    staleTime: nowcast ? 15 * 60 * 1000 : 60 * 60 * 1000,
    retry: 1,
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
