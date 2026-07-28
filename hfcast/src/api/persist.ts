import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

/**
 * The cache is written to device storage so a forecast survives leaving
 * the app and losing the network.
 *
 * This is a field-use requirement rather than a speed optimisation. A
 * prediction is monthly climatology, so one fetched this morning is
 * still right this afternoon, and one fetched last week is still right
 * for the rest of the month. Only the now-cast decays, and it decays
 * into the climatology it was refining rather than into nothing.
 */

/**
 * Bump when a cached shape stops being readable by this build — a
 * change to `PathPrediction`, to a query key, or to the server's
 * response.
 *
 * Nothing validates a restored entry against the current types, so a
 * stale shape would reach the UI as `undefined` fields rather than as
 * an error. The buster is what prevents that: on a mismatch the whole
 * cache is dropped and refetched.
 */
export const CACHE_BUSTER = '1-prediction-v1';

const STORAGE_KEY = 'hfcast.query-cache';

/**
 * How long an unobserved entry is kept. React Query's default is five
 * minutes, which would drop a prediction while the user was still
 * looking at a different day, and would guarantee an empty cache on
 * every launch. A week covers a field weekend with room around it.
 */
export const OFFLINE_GC_TIME = 7 * 24 * 60 * 60 * 1000;

/**
 * One client for the app. Predictions are climatology, so the defaults
 * lean away from refetching; each query sets the `staleTime` that suits
 * its data.
 *
 * `retry: 1` rather than more: on a dead connection further attempts
 * only delay showing the cached forecast, which is the thing the user
 * actually wants.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      gcTime: OFFLINE_GC_TIME,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: STORAGE_KEY,
  // Geocode results are the one thing not worth keeping: they are only
  // useful while choosing a location, which needs the network anyway.
  throttleTime: 1000,
});

/** Persisted queries, and only those: see `persister` on why geocode is not. */
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === 'prediction';
}
