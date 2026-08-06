/**
 * Local time from longitude.
 *
 * The app has no timezone database and no timezone field on an endpoint, so
 * local time is the solar approximation: one hour per 15° of longitude. It is
 * wrong by up to an hour wherever a country's legal time is offset from its
 * sun, and wrong by more under summer time.
 *
 * It is still worth showing. Every question this app answers is about where
 * the sun is — when the D layer absorbs, when the band goes long after dark —
 * and solar time is the quantity that actually governs those. Legal time is
 * the approximation to the physics, not the other way round.
 */

/** Hours to add to UTC at this longitude. */
export function utcOffsetHours(lon: number): number {
  return Math.round(lon / 15);
}

/** The local hour, 0..23, for a UTC hour at this longitude. */
export function localHour(utcHour: number, lon: number): number {
  return (((utcHour + utcOffsetHours(lon)) % 24) + 24) % 24;
}
