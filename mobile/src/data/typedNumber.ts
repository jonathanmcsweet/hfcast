/**
 * A number the reader is part way through typing.
 *
 * Null rather than a fallback, so a half-typed value is left alone instead of
 * being parsed, clamped and written back under their fingers. Deleting the last
 * digit of "10" leaves "1", not 0 or 1 — the field keeps the text and the store
 * keeps its last usable value.
 *
 * Accepts a comma as the decimal separator, because most of the world writes it
 * that way and this field takes a number rather than a locale-formatted one.
 */
export function parseTypedNumber(text: string): number | null {
  const cleaned = text.replace(',', '.').trim();
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}
