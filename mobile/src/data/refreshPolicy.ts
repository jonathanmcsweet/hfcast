/**
 * How often a reader may pull the screen down to ask for new readings.
 *
 * The space weather and the ionosonde readings come from other people's
 * services, called without a key and with no contract: NOAA SWPC and
 * GIRO. The app already polls them on a timer it controls. A pull-down
 * hands that rate to whoever is holding the phone, so it needs a floor.
 *
 * The floor depends on how the last attempt ended. An answered request
 * holds for the full poll interval: the readings have a natural cadence
 * — SWPC publishes the flux once a day and the K index every few hours,
 * GIRO's sounders report every quarter of an hour at best — so inside
 * it there is nothing new to fetch. A failed request may be retried
 * after a minute: the operator who walked out of a dead zone should not
 * wait a quarter of an hour to try again, and a minute still stops a
 * service that is down from being asked ten times a minute.
 *
 * Its own module, and pure arithmetic over timestamps, so the rule can
 * be tested by running it rather than by pulling on a screen.
 */

/** The floor after an attempt that failed. */
export const REFRESH_COOLDOWN_MS = 60 * 1000;

/**
 * The floor after an attempt that was answered.
 *
 * The same quarter hour as the app's own poll, so a pull-down can never
 * ask more often than the timer the README promises.
 */
export const REFRESH_SETTLED_MS = 15 * 60 * 1000;

/**
 * How long one attempt holds the floor, in ms.
 *
 * Zero is React Query's "nothing has happened here yet", which is not a
 * time and must not be treated as one — the epoch is a long time ago,
 * and subtracting from it would allow a refresh either way, but saying
 * so outright is what stops a future cooldown from reading it as
 * "asked in 1970".
 */
function waitFrom(since: number, now: number, cooldown: number): number {
  if (since === 0) return 0;
  const left = cooldown - (now - since);
  // A clock moved backwards — a time zone change, or the user setting
  // it — would otherwise lock the pull for as long as the jump.
  if (left > cooldown) return 0;
  return left > 0 ? left : 0;
}

/**
 * How long until another manual refresh will be allowed, in ms.
 *
 * The later attempt decides which rule applies: a failure after old
 * data allows the quick retry, and an answer after an old failure holds
 * the long floor.
 */
export function refreshWaitMs(
  dataUpdatedAt: number,
  errorUpdatedAt: number,
  now: number,
): number {
  return errorUpdatedAt > dataUpdatedAt
    ? waitFrom(errorUpdatedAt, now, REFRESH_COOLDOWN_MS)
    : waitFrom(dataUpdatedAt, now, REFRESH_SETTLED_MS);
}

/** Whether a manual refresh may go to the network now. */
export const mayRefresh = (
  dataUpdatedAt: number,
  errorUpdatedAt: number,
  now: number,
): boolean => refreshWaitMs(dataUpdatedAt, errorUpdatedAt, now) === 0;
