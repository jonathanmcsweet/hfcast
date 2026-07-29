/**
 * Feet or metres, miles or kilometres.
 *
 * Everything is stored and sent in metric: the engine takes metres, the
 * server takes metres, and a saved station stays readable whatever the
 * reader later switches to. This module is only about what a reader sees
 * and what a control they touch is calibrated in.
 */

/** What the reader asked for. `auto` follows the device's region. */
export type UnitPreference = 'auto' | 'metric' | 'imperial';

export const UNIT_PREFERENCES: UnitPreference[] = [
  'auto',
  'metric',
  'imperial',
];

/** What was resolved. Only these two ever reach a formatter. */
export type UnitSystem = 'metric' | 'imperial';

/**
 * Regions that measure an antenna in feet.
 *
 * Three countries have not adopted the metric system, and only one of them
 * has a large amateur population. Kept as a list rather than a single
 * check on `US` so the other two are visible rather than forgotten.
 *
 * The United Kingdom is deliberately not here. Road distances there are in
 * miles but a mast is in metres, and this setting is one switch. Metric
 * is the answer that is right about the antenna, which is what the switch
 * mostly governs; anyone who disagrees can set it by hand.
 */
const IMPERIAL_REGIONS = ['US', 'LR', 'MM'];

/**
 * The region part of a locale tag, or null when it carries none.
 *
 * `en` alone does not say which English. That is the ordinary case for a
 * language picked in-app rather than read from the device, and it has to
 * resolve to metric rather than guessing at the United States.
 */
export function regionOf(tag: string): string | null {
  const parts = tag.replace(/_/g, '-').split('-');
  const region = parts
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part));
  return region === undefined ? null : region.toUpperCase();
}

/**
 * Which system to use, given the reader's preference and their locale.
 *
 * Pure, and takes the locale rather than reading it, so the rule can be
 * tested without a device.
 */
export function resolveUnits(
  preference: UnitPreference,
  locale: string,
): UnitSystem {
  if (preference !== 'auto') return preference;
  const region = regionOf(locale);
  return region !== null && IMPERIAL_REGIONS.includes(region)
    ? 'imperial'
    : 'metric';
}

/** Exactly 0.3048 metres, by definition since 1959. */
export const METRES_PER_FOOT = 0.3048;
/** Exactly 1.609344 kilometres, by the same definition. */
export const KM_PER_MILE = 1.609344;

export const metresToFeet = (metres: number) => metres / METRES_PER_FOOT;
export const feetToMetres = (feet: number) => feet * METRES_PER_FOOT;
export const kmToMiles = (km: number) => km / KM_PER_MILE;

/**
 * The height range a slider covers, in whatever unit it is calibrated in.
 *
 * Derived from the metric limits rather than written twice, so the control
 * can never offer a height the server would clamp. Rounded inwards: a
 * slider that stopped at 328.08 ft would be the arithmetic showing
 * through, and 328 ft is inside 100 m where 329 would not be.
 */
export function heightRange(
  system: UnitSystem,
  metric: { min: number; max: number; },
): { min: number; max: number; step: number; } {
  if (system === 'metric') return { ...metric, step: 1 };
  return {
    min: Math.ceil(metresToFeet(metric.min)),
    max: Math.floor(metresToFeet(metric.max)),
    step: 1,
  };
}
