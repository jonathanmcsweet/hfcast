/**
 * How long a computed map outlives the reader's attention, and how many
 * of the big ones are kept.
 *
 * Its own module because it is ordinary logic over a cache — no React,
 * no React Native, nothing from the engine — so it can be tested by
 * running it, which is not true of `queries.ts`.
 */
import type { QueryClient } from '@tanstack/react-query';

/**
 * How long a computed map is kept after the reader stops looking at it.
 *
 * `staleTime` already stops these being recomputed while something is
 * watching them; this is the other half, and the half that was missing.
 * React Query drops an unwatched answer after five minutes by default,
 * so scrubbing the clock away from an hour and back recomputed a map
 * that had been correct all along — a second or two of engine time to
 * rebuild something that was thrown away to save 276 KB.
 *
 * An hour, measured from the last time the reader looked. What makes
 * that safe rather than merely convenient is that everything which
 * would change the answer is already in the query key: the band, the
 * hour, the date, the station, and the space weather reading. A cached
 * map cannot be stale in the sense that matters — a new reading gives a
 * new key and a fresh run.
 */
export const MAP_CACHE_MS = 60 * 60 * 1000;

/**
 * How many whole-world fine grids are kept at once.
 *
 * They are the only answers here big enough to matter: 34,560 points as
 * two `Float32Array`s is 276 KB each, against a few kilobytes for a
 * coarse map or a patch. Twenty-four is a full day's scrubbing on one
 * band, about 6.6 MB, and it stops a reader who tries every band at
 * every hour from holding sixty.
 */
export const FINE_GLOBE_CACHE = 24;

/**
 * Drops the least recently used fine grids past `FINE_GLOBE_CACHE`.
 *
 * React Query bounds its cache by age and not by size, which is the
 * right default for answers measured in kilobytes and the wrong one for
 * these. Holding an hour of them was the point of `MAP_CACHE_MS`;
 * holding an unbounded number of them was not.
 *
 * Anything still being watched is left alone whatever its age — it is on
 * the screen, and evicting it would recompute it immediately.
 */
export function pruneFineGlobes(
  client: QueryClient,
  keep: number = FINE_GLOBE_CACHE,
): number {
  const cache = client.getQueryCache();
  const idle = cache
    .findAll({ queryKey: ['fineGlobe'] })
    .filter((query) => query.getObserversCount() === 0)
    .filter((query) => query.state.data !== undefined);
  if (idle.length <= keep) return 0;
  // Oldest use first, so the ones dropped are the ones the reader has
  // gone furthest from.
  const byAge = [...idle].sort(
    (a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt,
  );
  const doomed = byAge.slice(0, idle.length - keep);
  for (const query of doomed) cache.remove(query);
  return doomed.length;
}
