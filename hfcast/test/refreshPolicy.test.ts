import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  lastAttempt,
  mayRefresh,
  REFRESH_COOLDOWN_MS,
  refreshWaitMs,
} from '../src/data/refreshPolicy.ts';

/**
 * The rule that stops a pull-down from becoming a request rate.
 *
 * The readings come from NOAA SWPC and GIRO, called without a key. The
 * app's own polling is on a timer it controls; this is the other path,
 * and the one a reader can repeat as fast as a thumb allows.
 */

const NOW = 1_700_000_000_000;

describe('when a manual refresh may go to the network', () => {
  it('allows the first one, before anything has been fetched', () => {
    // Zero is React Query's "nothing has happened here yet". Treated as
    // a timestamp it would be 1970, which allows the refresh by
    // accident; this checks it is allowed on purpose.
    assert.equal(refreshWaitMs(0, NOW), 0);
    assert.ok(mayRefresh(0, NOW));
  });

  it('refuses a second one inside the cooldown', () => {
    assert.ok(!mayRefresh(NOW - 1000, NOW));
    assert.equal(refreshWaitMs(NOW - 1000, NOW), REFRESH_COOLDOWN_MS - 1000);
  });

  it('allows one exactly at the cooldown', () => {
    assert.ok(mayRefresh(NOW - REFRESH_COOLDOWN_MS, NOW));
  });

  it('allows one after it', () => {
    assert.ok(mayRefresh(NOW - REFRESH_COOLDOWN_MS - 1, NOW));
  });

  it('never reports a wait longer than the cooldown', () => {
    // A clock moved backwards — a flight, a time zone, a user setting it
    // — would otherwise lock the pull for as long as the jump.
    assert.equal(refreshWaitMs(NOW + 60 * 60 * 1000, NOW), 0);
  });

  it('is a minute, which is shorter than anything upstream publishes', () => {
    // Stated so a future change has to argue with it. SWPC publishes the
    // flux daily and the K index every three hours; GIRO's sounders
    // report four times an hour at best. A shorter floor would ask more
    // often than answers can change.
    assert.equal(REFRESH_COOLDOWN_MS, 60_000);
  });
});

describe('what counts as having asked', () => {
  it('counts a successful fetch', () => {
    assert.equal(lastAttempt(NOW, 0), NOW);
  });

  it('counts a failed one too', () => {
    // The case that matters most: a device with no network would
    // otherwise retry as fast as a reader can pull, and a service that
    // is down is exactly the one that should not be asked ten times a
    // minute.
    assert.equal(lastAttempt(0, NOW), NOW);
    assert.ok(!mayRefresh(lastAttempt(0, NOW), NOW));
  });

  it('takes the more recent of the two', () => {
    assert.equal(lastAttempt(NOW - 5000, NOW), NOW);
    assert.equal(lastAttempt(NOW, NOW - 5000), NOW);
  });
});
