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
 *
 * One grid is the unit again. 0.49.0 briefly made it an hour at every
 * band, and raised this to thirty-six to hold whole sets; the run that
 * produced those sets is gone, so the reason is gone with it.
 */
export const FINE_GLOBE_CACHE = 24;

/**
 * The order the grids were last read in, one order per client.
 *
 * Against the client rather than in one shared value, so two clients —
 * which is what every test makes — do not share an order, and so the
 * order is collected with the client it belongs to.
 *
 * The number is a place in a queue, not a time. Nothing here needs to
 * know when a grid was read, only which grid was read before which.
 */
interface ReadOrder {
  readonly at: Map<string, number>;
  next: number;
}

const readOrders = new WeakMap<QueryClient, ReadOrder>();

function readOrder(client: QueryClient): ReadOrder {
  const existing = readOrders.get(client);
  if (existing !== undefined) return existing;
  const fresh: ReadOrder = { at: new Map(), next: 1 };
  readOrders.set(client, fresh);
  return fresh;
}

/**
 * Records that a fine grid is the one being read.
 *
 * React Query cannot answer this. It stamps `dataUpdatedAt` when an
 * answer arrives and never again, and these queries are kept with
 * `staleTime: Infinity`, so no refetch ever moves it. Sorting on it
 * evicts by age of the answer rather than by how long ago the reader
 * looked at it — which drops the grid they keep coming back to, at a
 * cost of a full 34,560-point rerun, and keeps the ones they saw once.
 */
export function touchFineGlobe(client: QueryClient, queryHash: string): void {
  const order = readOrder(client);
  order.at.set(queryHash, order.next);
  order.next += 1;
}

/**
 * Drops the least recently read fine grids past `FINE_GLOBE_CACHE`.
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
  const order = readOrder(client);
  forgetDeadEntries(cache.getAll(), order);

  const idle = cache
    .findAll({ queryKey: ['fineGlobe'] })
    .filter((query) => query.getObserversCount() === 0)
    .filter((query) => query.state.data !== undefined);
  if (idle.length <= keep) return 0;

  // Least recently read first, so the ones dropped are the ones the
  // reader has gone furthest from. A grid nobody has read since it
  // arrived has no place in the order and sorts before every grid that
  // has one; between two of those, the older answer goes first.
  const readAt = (hash: string) => order.at.get(hash) ?? 0;
  const byLastRead = [...idle].sort((a, b) =>
    readAt(a.queryHash) - readAt(b.queryHash)
    || a.state.dataUpdatedAt - b.state.dataUpdatedAt
  );
  const doomed = byLastRead.slice(0, idle.length - keep);
  for (const query of doomed) {
    cache.remove(query);
    order.at.delete(query.queryHash);
  }
  return doomed.length;
}

/**
 * Drops places in the order for grids the cache no longer holds.
 *
 * Without this the order is the one thing here that grows for the life
 * of the process: `MAP_CACHE_MS` removes a query without telling us.
 */
function forgetDeadEntries(
  live: readonly { queryHash: string; }[],
  order: ReadOrder,
): void {
  if (order.at.size === 0) return;
  const held = new Set(live.map((query) => query.queryHash));
  const gone = [...order.at.keys()].filter((hash) => !held.has(hash));
  for (const hash of gone) order.at.delete(hash);
}
