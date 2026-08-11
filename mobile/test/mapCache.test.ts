import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashKey, QueryClient } from '@tanstack/react-query';

import {
  FINE_GLOBE_CACHE,
  MAP_CACHE_MS,
  pruneFineGlobes,
  touchFineGlobe,
} from '../src/api/mapCache.ts';

/**
 * Keeping a computed map, and knowing when to stop.
 *
 * The engine is the expensive part of this app: a whole-world fine grid
 * is 34,560 predictions and one to two seconds on a phone. Recomputing
 * one the reader has already seen is the worst kind of slow, because
 * the answer was correct and was thrown away.
 *
 * These check the two halves. `MAP_CACHE_MS` is how long an unwatched
 * answer survives; `pruneFineGlobes` is how many of them do.
 */

const globeKey = (hour: number) => ['fineGlobe', 'device', 'FN42', '40m', hour];

/** Fills the cache with `n` fine grids, oldest first, none being watched. */
const withGlobes = (n: number): QueryClient => {
  const client = new QueryClient();
  for (let i = 0; i < n; i += 1) {
    client.setQueryData(['fineGlobe', 'device', 'FN42', '40m', i], {
      hour: i,
    });
    // React Query stamps `dataUpdatedAt` from the clock, and a loop this
    // fast can write several within one millisecond — which would make
    // "oldest first" arbitrary. Stated outright instead.
    const query = client
      .getQueryCache()
      .find({ queryKey: ['fineGlobe', 'device', 'FN42', '40m', i] });
    if (query) query.state.dataUpdatedAt = 1000 + i;
  }
  return client;
};

describe('keeping a map the reader has already waited for', () => {
  it('holds it long enough to scrub away and come back', () => {
    // The default is five minutes, which is shorter than a session
    // spent comparing bands — and that was the bug.
    assert.ok(MAP_CACHE_MS >= 60 * 60 * 1000);
  });

  it('keeps everything while there is room', () => {
    const client = withGlobes(FINE_GLOBE_CACHE);
    assert.equal(pruneFineGlobes(client), 0);
    assert.equal(
      client.getQueryCache().findAll({ queryKey: ['fineGlobe'] }).length,
      FINE_GLOBE_CACHE,
    );
  });

  it('drops the least recently used once it is full', () => {
    const client = withGlobes(FINE_GLOBE_CACHE + 5);
    assert.equal(pruneFineGlobes(client), 5);

    const left = client.getQueryCache().findAll({ queryKey: ['fineGlobe'] });
    assert.equal(left.length, FINE_GLOBE_CACHE);
    // The five oldest went, and the newest stayed.
    const hours = left.map((q) => (q.queryKey as unknown[])[4] as number);
    assert.equal(Math.min(...hours), 5);
    assert.ok(hours.includes(FINE_GLOBE_CACHE + 4));
  });

  it('never evicts a grid that is on the screen', () => {
    // The one being watched is the one the reader is looking at, so
    // dropping it would recompute it at once — the opposite of the point.
    const client = withGlobes(FINE_GLOBE_CACHE + 3);
    const oldest = client
      .getQueryCache()
      .find({ queryKey: ['fineGlobe', 'device', 'FN42', '40m', 0] });
    assert.ok(oldest);
    // Stand in for a mounted component, which is all `getObserversCount`
    // is asked about.
    oldest.observers = [{} as never];

    pruneFineGlobes(client);
    assert.ok(
      client
        .getQueryCache()
        .find({ queryKey: ['fineGlobe', 'device', 'FN42', '40m', 0] }),
    );
  });

  it('drops by when the reader last looked, not by when it arrived', () => {
    // This is the whole of what `touchFineGlobe` is for. React Query
    // stamps `dataUpdatedAt` once, when the answer arrives, and these
    // queries are held with `staleTime: Infinity`, so nothing moves it
    // again. Sorted on it, the grid the reader keeps returning to holds
    // the oldest stamp and goes first — a full 34,560-point rerun to
    // make room for grids that were seen once and left.
    const client = withGlobes(FINE_GLOBE_CACHE + 1);
    // The oldest answer, and the one being read.
    touchFineGlobe(client, hashKey(globeKey(0)));

    assert.equal(pruneFineGlobes(client), 1);
    assert.ok(
      client.getQueryCache().find({ queryKey: globeKey(0) }),
      'the grid the reader came back to was dropped',
    );
    // The one that went is the oldest of those nobody read.
    assert.equal(
      client.getQueryCache().find({ queryKey: globeKey(1) }),
      undefined,
    );
  });

  it('drops the reads in the order they happened', () => {
    const client = withGlobes(FINE_GLOBE_CACHE + 2);
    // Read every grid, newest first, so the read order is the reverse of
    // the arrival order. Nothing else about the cache changes.
    for (let i = FINE_GLOBE_CACHE + 1; i >= 0; i -= 1) {
      touchFineGlobe(client, hashKey(globeKey(i)));
    }

    assert.equal(pruneFineGlobes(client), 2);
    const left = client.getQueryCache().findAll({ queryKey: ['fineGlobe'] });
    const hours = left.map((q) => (q.queryKey as unknown[])[4] as number);
    // The two read longest ago are the two newest answers.
    assert.ok(!hours.includes(FINE_GLOBE_CACHE + 1));
    assert.ok(!hours.includes(FINE_GLOBE_CACHE));
    assert.ok(hours.includes(0));
  });

  it('forgets grids the cache no longer holds', () => {
    // The order is the one thing here that could grow for the life of
    // the process: `MAP_CACHE_MS` removes a query without saying so.
    const client = withGlobes(1);
    touchFineGlobe(client, hashKey(globeKey(0)));
    const removed = client.getQueryCache().find({ queryKey: globeKey(0) });
    assert.ok(removed);
    client.getQueryCache().remove(removed);

    pruneFineGlobes(client);
    // Put the same key back with a fresh answer. Were the old place in
    // the order still held, this grid would count as read long ago
    // rather than as one nobody has read.
    client.setQueryData(globeKey(0), { hour: 0 });
    assert.equal(pruneFineGlobes(client), 0);
  });

  it('leaves the small answers alone', () => {
    // Coarse maps and patches are kilobytes, so they are bounded by age
    // and not by count. Pruning them would spend engine time to save
    // nothing worth saving.
    const client = withGlobes(FINE_GLOBE_CACHE + 2);
    for (let i = 0; i < 50; i += 1) {
      client.setQueryData(['coverage', 'device', 'FN42', '40m', i], { i });
    }
    pruneFineGlobes(client);
    assert.equal(
      client.getQueryCache().findAll({ queryKey: ['coverage'] }).length,
      50,
    );
  });

  it('counts only the grids that hold an answer', () => {
    // A query that failed or has not run yet holds nothing, so it costs
    // nothing to keep and must not push a real answer out.
    const client = withGlobes(FINE_GLOBE_CACHE);
    for (let i = 0; i < 5; i += 1) {
      client.setQueryData(['fineGlobe', 'empty', i], undefined);
    }
    assert.equal(pruneFineGlobes(client), 0);
  });
});
