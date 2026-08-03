/**
 * How often a reader may pull the screen down to ask for new readings.
 *
 * The space weather and the ionosonde readings come from other people's
 * services, called without a key and with no contract: NOAA SWPC and
 * GIRO. The app already polls them on a timer it controls. A pull-down
 * hands that rate to whoever is holding the phone, so it needs a floor.
 *
 * Its own module, and pure arithmetic over two timestamps, so the rule
 * can be tested by running it rather than by pulling on a screen.
 */

/**
 * The floor between two manual refreshes.
 *
 * A minute, which cannot cost either service anything and cannot lose
 * the reader anything either: SWPC publishes the flux once a day and the
 * K index every three hours, and GIRO's sounders report every quarter of
 * an hour at best. Nothing new can exist a second time within a minute,
 * so this only refuses requests that had no answer to find.
 */
export const REFRESH_COOLDOWN_MS = 60 * 1000;

/**
 * The last time the app asked, whether or not it got an answer.
 *
 * Both halves matter. Counting only successes would let a device with no
 * network retry as fast as a reader can pull, which is the case where
 * restraint matters most — a service that is down is a service that
 * should not be asked ten times a minute.
 */
export function lastAttempt(
  dataUpdatedAt: number,
  errorUpdatedAt: number,
): number {
  return Math.max(dataUpdatedAt, errorUpdatedAt);
}

/** How long until another manual refresh will be allowed, in ms. */
export function refreshWaitMs(
  since: number,
  now: number,
  cooldown: number = REFRESH_COOLDOWN_MS,
): number {
  // Zero is React Query's "nothing has happened here yet", which is not
  // a time and must not be treated as one — the epoch is a long time
  // ago, and subtracting from it would allow a refresh either way, but
  // saying so outright is what stops a future cooldown from reading it
  // as "asked in 1970".
  if (since === 0) return 0;
  const left = cooldown - (now - since);
  // A clock moved backwards — a time zone change, or the user setting
  // it — would otherwise lock the pull for as long as the jump.
  if (left > cooldown) return 0;
  return left > 0 ? left : 0;
}

/** Whether a manual refresh may go to the network now. */
export const mayRefresh = (
  since: number,
  now: number,
  cooldown: number = REFRESH_COOLDOWN_MS,
): boolean => refreshWaitMs(since, now, cooldown) === 0;
