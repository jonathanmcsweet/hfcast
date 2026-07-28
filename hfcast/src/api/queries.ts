import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Endpoint } from '../data/types';
import { dateForOffset, MAX_DAY_OFFSET } from '../store/usePathStore';
import { fetchForecast, fetchGeocode, fetchPrediction } from './client';

/**
 * All network state goes through React Query. Query keys carry every input the
 * request depends on, so changing the path, the day, or the language refetches
 * without any manual invalidation.
 */

export const queryKeys = {
  prediction: (from: string, to: string, date: string, nowcast: boolean) =>
    ['prediction', from, to, date, nowcast] as const,
  forecast: (from: string, to: string, date: string, days: number) =>
    ['forecast', from, to, date, days] as const,
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

/**
 * Fills the cache for the days the selector offers beyond today, so the
 * selector still works with no signal.
 *
 * One request rather than six `prefetchQuery` calls. The server answers
 * `/api/forecast` with one entry per day, and on the slow or intermittent
 * link somebody has just before losing signal, one round trip that either
 * works or does not beats six that can half-succeed. The days are then
 * written into the same per-day keys `usePrediction` reads, so the cache
 * stays keyed per day and a later single-day fetch replaces a seeded
 * entry rather than duplicating it.
 *
 * Today is deliberately excluded. Only today can be a now-cast, and
 * `/api/forecast` never now-casts, so seeding today's key from it would
 * quietly downgrade the one day that carries live readings.
 *
 * `enabled` is the caller's answer to "did the network just work?".
 * Prefetching while offline would only add a second failing request.
 */
export function usePrefetchDays(
  from: Endpoint,
  to: Endpoint,
  enabled: boolean,
) {
  const client = useQueryClient();
  const start = dateForOffset(1);
  const days = MAX_DAY_OFFSET;

  const { data } = useQuery({
    queryKey: queryKeys.forecast(from.grid, to.grid, start, days),
    queryFn: () =>
      fetchForecast({
        from: `${from.lat},${from.lon}`,
        to: `${to.lat},${to.lon}`,
        fromLabel: from.label,
        toLabel: to.label,
        date: start,
        days,
      }),
    enabled,
    staleTime: 60 * 60 * 1000,
    // The batch itself is not worth storing: it exists only to seed the
    // per-day entries, and those are what `shouldPersistQuery` keeps.
    gcTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (!data) return;
    for (const entry of data) {
      const key = queryKeys.prediction(
        from.grid,
        to.grid,
        entry.prediction.date,
        false,
      );
      // Seed only what is missing. Overwriting a day the user has since
      // fetched directly would reset its timestamp for no gain, and the
      // offline banner reads that timestamp.
      if (client.getQueryData(key) === undefined) {
        client.setQueryData(key, entry);
      }
    }
  }, [client, data, from.grid, to.grid]);
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
