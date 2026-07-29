/**
 * Transmit power on a slider, and typed by hand.
 *
 * The range runs from a tenth of a watt to fifteen hundred: four decades.
 * A linear slider over that spends nine tenths of its travel above 150 W
 * and cannot reach a QRP setting at all, so the control is logarithmic —
 * which is also how power behaves. Every doubling is the same 3 dB
 * wherever it happens, so equal travel should mean equal decibels.
 */

/** Slider positions. Fine enough that a step is under a tenth of a dB. */
export const POWER_STEPS = 1000;

const log10 = Math.log10;

/** The watts a slider position means. */
export function wattsAt(
  position: number,
  { min, max }: { min: number; max: number; },
): number {
  const t = Math.min(1, Math.max(0, position / POWER_STEPS));
  const raw = 10 ** (log10(min) + t * (log10(max) - log10(min)));
  return roundPower(Math.min(max, Math.max(min, raw)));
}

/** The slider position for a power. */
export function positionOf(
  watts: number,
  { min, max }: { min: number; max: number; },
): number {
  const held = Math.min(max, Math.max(min, watts));
  const t = (log10(held) - log10(min)) / (log10(max) - log10(min));
  return Math.round(t * POWER_STEPS);
}

/**
 * Power rounded to what an operator would actually say.
 *
 * A logarithmic slider lands on values like 4.87 W, and nobody runs
 * 4.87 W. The steps widen with the number because that is how the
 * settings themselves are spaced: a QRP rig has a half-watt setting, a
 * hundred-watt radio does not have a 101-watt one.
 */
export function roundPower(watts: number): number {
  if (watts < 1) return Math.round(watts * 10) / 10;
  if (watts < 10) return Math.round(watts * 2) / 2;
  if (watts < 100) return Math.round(watts);
  if (watts < 1000) return Math.round(watts / 5) * 5;
  return Math.round(watts / 25) * 25;
}

/**
 * A typed power, or null when the text is not one yet.
 *
 * Null rather than a fallback, so a half-typed value is left alone
 * instead of being corrected under the reader's fingers. Accepts a comma
 * as the decimal separator, because most of the world writes it that way
 * and the field takes a number rather than a locale-formatted one.
 */
export function parsePower(text: string): number | null {
  const cleaned = text.replace(',', '.').trim();
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Power as text for the entry field: no trailing zeroes, no separators. */
export const powerText = (watts: number): string => String(watts);
