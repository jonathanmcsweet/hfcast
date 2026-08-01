/**
 * Contrast ratios, so the palette can be checked rather than trusted.
 *
 * WCAG 2.1 defines a ratio between two relative luminances and sets the
 * pass marks at 4.5 for ordinary text, 3 for large text and for the
 * boundary of a control. This app is read outdoors on a phone, which is
 * the worst case those numbers were written for, so the marks are floors
 * here and not targets.
 *
 * Its own module, and pure arithmetic over hex strings, so it can be
 * tested by running it — `theme.ts` reaches into React Native Paper and
 * cannot be. The same reason `mapCache.ts` is separate from `queries.ts`.
 *
 * The formulae are from WCAG 2.1 "relative luminance" and "contrast
 * ratio" and are written out rather than approximated: the sRGB transfer
 * function is not gamma 2.2, and using 2.2 moves ratios enough to pass a
 * pair that should fail.
 */

/**
 * `#RGB` or `#RRGGBB`, to three channels of 0-255.
 *
 * Exported because the low-light theme's defining property is that its
 * green and blue channels are zero, and that is checked by reading them
 * rather than by trusting the hex strings to look right.
 */
export function channels(hex: string): [number, number, number] {
  const text = hex.replace('#', '');
  const wide = text.length === 3
    ? text.split('').map((c) => c + c).join('')
    : text;
  if (!/^[0-9a-fA-F]{6}$/.test(wide)) {
    throw new Error(`not a colour this can read: ${hex}`);
  }
  return [
    Number.parseInt(wide.slice(0, 2), 16),
    Number.parseInt(wide.slice(2, 4), 16),
    Number.parseInt(wide.slice(4, 6), 16),
  ];
}

/** One channel, from sRGB to linear light. */
const linear = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 for black and 1 for white. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * The contrast ratio between two colours, from 1 to 21.
 *
 * Order does not matter: the lighter of the two is always the numerator.
 */
export function contrast(a: string, b: string): number {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** The pass marks, named so a test reads as the rule it is checking. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
