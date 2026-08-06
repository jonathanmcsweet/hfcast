import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mayRefresh,
  REFRESH_COOLDOWN_MS,
  REFRESH_SETTLED_MS,
  refreshWaitMs,
} from '../src/data/refreshPolicy.ts';

/**
 * The rule that stops a pull-down from becoming a request rate.
 *
 * The readings come from NOAA SWPC and GIRO, called without a key. The
 * app's own polling is on a timer it controls; this is the other path,
 * and the one a reader can repeat as fast as a thumb allows.
 *
 * Arguments are (dataUpdatedAt, errorUpdatedAt, now): when the last
 * answer arrived, when the last failure happened, and the clock.
 */

const NOW = 1_700_000_000_000;

describe('when a manual refresh may go to the network', () => {
  it('allows the first one, before anything has been fetched', () => {
    // Zero is React Query's "nothing has happened here yet". Treated as
    // a timestamp it would be 1970, which allows the refresh by
    // accident; this checks it is allowed on purpose.
    assert.equal(refreshWaitMs(0, 0, NOW), 0);
    assert.ok(mayRefresh(0, 0, NOW));
  });

  it('holds an answer for the full poll interval', () => {
    // Inside it there is nothing new to fetch: SWPC publishes the flux
    // daily and the K index every few hours, GIRO's sounders report
    // every quarter of an hour at best.
    assert.ok(!mayRefresh(NOW - 1000, 0, NOW));
    assert.equal(refreshWaitMs(NOW - 1000, 0, NOW), REFRESH_SETTLED_MS - 1000);
    assert.ok(!mayRefresh(NOW - REFRESH_SETTLED_MS + 1, 0, NOW));
  });

  it('allows one exactly at the interval, and after it', () => {
    assert.ok(mayRefresh(NOW - REFRESH_SETTLED_MS, 0, NOW));
    assert.ok(mayRefresh(NOW - REFRESH_SETTLED_MS - 1, 0, NOW));
  });

  it('lets a failure be retried after a minute, not a quarter hour', () => {
    // The operator who walked out of a dead zone. The failure is the
    // later attempt, so the short rule applies.
    assert.ok(!mayRefresh(0, NOW - 1000, NOW));
    assert.equal(refreshWaitMs(0, NOW - 1000, NOW), REFRESH_COOLDOWN_MS - 1000);
    assert.ok(mayRefresh(0, NOW - REFRESH_COOLDOWN_MS, NOW));
  });

  it('applies the short rule to a failure after old data', () => {
    // Ten-minute-old readings, and a retry that failed a moment ago:
    // the next try waits on the failure's minute, not the answer's
    // quarter hour.
    const data = NOW - 10 * 60 * 1000;
    assert.ok(!mayRefresh(data, NOW - 1000, NOW));
    assert.equal(
      refreshWaitMs(data, NOW - 1000, NOW),
      REFRESH_COOLDOWN_MS - 1000,
    );
    assert.ok(mayRefresh(data, NOW - REFRESH_COOLDOWN_MS, NOW));
  });

  it('applies the long rule to an answer after an old failure', () => {
    // The retry that worked. Fresh readings hold the full interval even
    // though a failure came before them.
    const error = NOW - 10 * 60 * 1000;
    assert.ok(!mayRefresh(NOW - 1000, error, NOW));
    assert.equal(
      refreshWaitMs(NOW - 1000, error, NOW),
      REFRESH_SETTLED_MS - 1000,
    );
  });

  it('never reports a wait longer than its own floor', () => {
    // A clock moved backwards — a flight, a time zone, a user setting it
    // — would otherwise lock the pull for as long as the jump.
    assert.equal(refreshWaitMs(NOW + 60 * 60 * 1000, 0, NOW), 0);
    assert.equal(refreshWaitMs(0, NOW + 60 * 60 * 1000, NOW), 0);
  });

  it('keeps the floors in step with what upstream publishes', () => {
    // Stated so a future change has to argue with it. The settled floor
    // is the app's own poll interval, which is the rate the README
    // promises; the retry floor is short enough to recover in the field
    // and long enough that a dead service is not asked ten times a
    // minute.
    assert.equal(REFRESH_SETTLED_MS, 15 * 60_000);
    assert.equal(REFRESH_COOLDOWN_MS, 60_000);
  });
});
