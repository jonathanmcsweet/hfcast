/**
 * Raw ramps. Nothing outside `theme.ts` should import from here — components
 * read semantic roles, not hex values.
 *
 * The palette is built around one idea from the subject: a path between the
 * lit and unlit sides of the earth. Neutrals are cold and violet-shifted like
 * the terminator, the signal ramp runs plasma-cyan through indigo into slate,
 * and a single warm amber is reserved for the one solar-driven number.
 *
 * Ramps were spaced in OKLCH for even perceptual steps, then flattened to hex
 * because React Native's style engine has no `oklch()` support.
 */

/** Cool neutral. Slightly violet at the dark end, never pure grey. */
export const slate = {
  0: '#FFFFFF',
  25: '#F7F8FC',
  50: '#EEF0F7',
  100: '#E2E5F0',
  200: '#CBD0E1',
  300: '#AAB2C8',
  400: '#8590AB',
  500: '#65708C',
  600: '#4B5570',
  700: '#39415A',
  800: '#272D40',
  900: '#1A1F2E',
  950: '#12151F',
  1000: '#0B0D14',
} as const;

/** Plasma. The top of the signal ramp and the app's primary. */
export const cyan = {
  50: '#ECFDFF',
  100: '#CFF5FC',
  200: '#A5EEFA',
  400: '#22D3EE',
  500: '#06B6D4',
  600: '#0E8CA8',
  700: '#0E7490',
  800: '#0B4C5C',
  900: '#03303D',
} as const;

/** Mid-ramp. Also the secondary role. */
export const indigo = {
  50: '#EEF0FF',
  100: '#E0E3FF',
  200: '#C7D0FE',
  300: '#A5B4FC',
  400: '#7A6BD8',
  500: '#5B8DEF',
  600: '#4F7BD9',
  700: '#4C3FA8',
  800: '#2C2461',
  900: '#1B1454',
} as const;

/** Solar. Reserved for sun-driven values — used exactly once, on purpose. */
export const amber = {
  100: '#FFE7BE',
  200: '#FFDFA0',
  400: '#FFC24B',
  600: '#C2810A',
  700: '#A85D00',
  800: '#573A00',
  900: '#2E1C00',
} as const;

/**
 * Propagation quality, and only that.
 *
 * A ramp of its own so quality never competes with the interface: cyan is
 * what the user can press, violet is what the ionosphere is doing. The
 * values come from the design handoff (see `design/`), which chose them
 * for even steps of lightness rather than of hue — the scale has to be
 * ordinal, so lightness is the axis that carries meaning and the one that
 * survives greyscale, sunlight and colour blindness.
 *
 * Two spacings are defined. The `grid` steps are for solid fills. The
 * wider `map` steps exist because white coastlines and partial fill
 * opacity compress perceived contrast on the globe, so the same four
 * states need pulling further apart to read as four.
 */
export const violet = {
  50: '#F5F0FF',
  75: '#F3ECFF',
  100: '#F1EFF8',
  200: '#E0D7FA',
  300: '#D6C6FA',
  400: '#C9B4F7',
  500: '#9B78E8',
  600: '#8A5FDC',
  700: '#7C4BD0',
  800: '#5B2FB0',
  850: '#4A2F7D',
  900: '#43267A',
  925: '#3B1F72',
  950: '#2A1656',
} as const;

/** Error only. Warmer and less institutional than Material's default red. */
export const rose = {
  100: '#FFE0E5',
  200: '#FFD7DE',
  400: '#FB7185',
  600: '#BE123C',
  800: '#7A1030',
  900: '#48001A',
} as const;

/**
 * The low-light theme, and the only ramp in this file with no blue or
 * green in it at all.
 *
 * Dark adaptation is destroyed by short wavelengths and is barely
 * touched by long ones: the rod cells that carry night vision are almost
 * blind past about 620 nm. So every value here has its green and blue
 * channels at zero. A red that looks "warm" by mixing in a little green
 * would undo the whole point, which is why the ramp is the red channel
 * alone rather than a tinted grey.
 *
 * The consequence is a hard ceiling on contrast. Pure red on black is
 * 5.25:1 — the most this theme can ever reach, against 21 for white on
 * black. It clears the 4.5 that ordinary text needs and nothing more, so
 * only the top of this ramp can carry text, and hierarchy in that theme
 * is carried by size and weight instead of by brightness.
 *
 * Numbered by lightness like the others, so the ramp reads the same way.
 */
export const nightRed = {
  100: '#FF0000',
  200: '#F70000',
  300: '#F20000',
  400: '#D60000',
  500: '#B80000',
  600: '#990000',
  700: '#7A0000',
  800: '#5C0000',
  900: '#3D0000',
  950: '#260000',
  975: '#1A0000',
  1000: '#0D0000',
} as const;
