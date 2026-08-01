import { StyleSheet } from 'react-native';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
// The extension is explicit so this module can be imported by a test under
// Node, which does not infer one. Metro resolves it either way.
import { amber, cyan, indigo, rose, slate, violet } from './palette.ts';

/**
 * Propagation quality is a four-state scale, not a continuous gradient.
 * MD3 has no role for "this band is patchy", so the scheme is extended with
 * a parallel set that follows the same contrast rules as the built-in roles.
 *
 * The state names are the words shown to the user, so they say what to do
 * rather than grade the number: a band is `patchy` because it comes and
 * goes, not because it scored in a middle band.
 */
export type QualityKey = 'reliable' | 'patchy' | 'weak' | 'closed';

/**
 * A fill and the text that goes on it — the only two colours a state has.
 *
 * Deliberately not the container/on-container pair MD3 uses. The design
 * puts quality on solid fills throughout (heatmap cells, bars, badges), so
 * a lighter container tone would be a value nothing specifies and nothing
 * draws.
 */
type QualityColors = Record<QualityKey, { base: string; onBase: string; }>;

/**
 * Two scales ship. `signal` is the default.
 *
 * `signal` is ordinal: quality maps to lightness against the page, so it
 * stays readable in greyscale and under every form of colour blindness.
 * Darker against a light page, brighter against a dark one — the ramp
 * inverts between themes, and either way more contrast means more signal.
 *
 * It is violet rather than the interface's cyan so the two never compete:
 * cyan is what the user can press, violet is what the ionosphere is doing.
 *
 * `traffic` is the familiar green/amber/red. It trades those accessibility
 * properties for instant recognition. Switch if testing says the ordinal ramp
 * costs more than it gains.
 */
export type QualityScale = 'signal' | 'traffic';
export const QUALITY_SCALE: QualityScale = 'signal';

/**
 * Both ramps have a floor: the darkest state still has to read as a filled
 * cell against the card behind it.
 *
 * The first version did not. `closed` sat at 1.11:1 against the dark card
 * and 1.14:1 against the light one, so a path where every band is shut —
 * which is a real answer, and the one a very long path gives — drew a grid
 * that looked empty rather than closed. "Nothing works" and "nothing
 * loaded" are different things and must not look the same.
 *
 * `closed` is the one state outside the signal hue. It was violet for a
 * while, which made a grid where every band is shut read as a solid block
 * of signal — the opposite of what it says. Violet means the band does
 * something; anything else means it does not.
 *
 * On the dark theme that is black: the cell falls below the card rather
 * than sitting on it, so the gaps between cells become the lattice and a
 * closed band reads as a hole. The light theme cannot do the same thing —
 * nothing is lighter than a white card — so its closed state is the palest
 * neutral that still reads as a tile.
 *
 * Contrast against the card, weakest state last:
 *   light  11.69 / 5.56 / 3.36 / 1.54
 *   dark    9.85 / 3.27 / 2.15 / 1.15
 * Black's 1.15 is the lowest figure here and is deliberate: it is darker
 * than the card rather than lighter, which the others are not, so it is
 * told apart by direction as well as by amount. Both ramps stay ordered by
 * lightness, which is what keeps the scale readable in greyscale and under
 * any form of colour blindness, and every `onBase` clears 4.5:1 on its own
 * fill. The table alternative under the grid is the answer for anyone this
 * still fails.
 */
const signalLight: QualityColors = {
  reliable: { base: violet[900], onBase: violet[75] },
  patchy: { base: violet[700], onBase: violet[50] },
  weak: { base: violet[500], onBase: violet[950] },
  closed: { base: slate[200], onBase: slate[700] },
};

const signalDark: QualityColors = {
  reliable: { base: violet[400], onBase: violet[950] },
  patchy: { base: violet[700], onBase: violet[50] },
  weak: { base: violet[800], onBase: violet[200] },
  closed: { base: '#000000', onBase: slate[400] },
};

/**
 * The same four states for the coverage globe.
 *
 * Wider spacing than the grid ramp, because white coastlines over partial
 * fill opacity compress perceived contrast — at the grid's spacing the
 * middle two states stop reading as two. Nothing consumes this yet; it
 * lands with the map.
 */
export const qualityMap = {
  light: {
    reliable: { fill: violet[925], opacity: 0.95 },
    patchy: { fill: violet[600], opacity: 0.88 },
    weak: { fill: violet[400], opacity: 0.8 },
    closed: { fill: violet[100], opacity: 0.6 },
  },
  dark: {
    // One step down the ramp, because at violet[300] the brightest reach
    // washed out the coastlines drawn over it (user, 2026-08-01). The
    // ramp is spaced in OKLCH, so one step is a measured perceptual step
    // and it stays clear of `patchy` below it.
    reliable: { fill: violet[400], opacity: 0.95 },
    patchy: { fill: violet[500], opacity: 0.88 },
    weak: { fill: violet[850], opacity: 0.8 },
    closed: { fill: slate[900], opacity: 0.6 },
  },
} as const;

const trafficLight: QualityColors = {
  reliable: { base: '#2F7D32', onBase: '#FFFFFF' },
  patchy: { base: '#9A6200', onBase: '#FFFFFF' },
  weak: { base: '#B3261E', onBase: '#FFFFFF' },
  closed: { base: '#C3C9D9', onBase: slate[600] },
};

const trafficDark: QualityColors = {
  reliable: { base: '#7BC97F', onBase: '#0E2B10' },
  patchy: { base: '#F0B152', onBase: '#331F00' },
  weak: { base: '#F2857D', onBase: '#410E0B' },
  closed: { base: '#3E4459', onBase: slate[300] },
};

const quality = {
  light: QUALITY_SCALE === 'signal' ? signalLight : trafficLight,
  dark: QUALITY_SCALE === 'signal' ? signalDark : trafficDark,
};

/**
 * The design's own surface names, kept alongside the Material roles rather
 * than mapped onto them.
 *
 * They do not line up. The design's `inset` — a recessed panel inside a card —
 * is a near-white, while MD3's nearest role, `surfaceVariant`, is the hairline
 * grey. Forcing one onto the other would have meant every component quietly
 * choosing which meaning it wanted. These are named as the handoff names them,
 * so a value in the specification can be found in the code by searching for it.
 *
 * Elevation is carried by hairline borders, in both themes. That was an
 * explicit product decision: Material tints raised surfaces with the primary
 * hue, which at this chroma washes the whole screen cyan.
 */
interface UiColors {
  /** Screen background. */
  page: string;
  /** Raised surfaces. */
  card: string;
  /** Recessed panels inside a card — readouts, stat tiles. */
  inset: string;
  /** Hairline borders. These carry elevation. */
  line: string;
  /** Stronger borders and control outlines. */
  line2: string;
  /** Primary text, and selection outlines. */
  ink: string;
  /** Text on an `ink` fill. */
  inkInv: string;
  /** Secondary text. */
  text2: string;
  /** Captions. */
  text3: string;
  /** Labels, axis ticks, footnotes. */
  text4: string;
  /** Anything the user can act on: selected chip, link, slider. */
  accent: string;
  /** Text on `accent`. */
  accentInk: string;
  /** The solar value, and the selected-hour column marker. */
  amberNum: string;
  amberBg: string;
  amberFg: string;
  /** The measured-ionosonde card, the one number that is not modelled. */
  ionoBg: string;
  ionoTitle: string;
  ionoSub: string;
  tagBg: string;
  tagFg: string;
  /** The disclaimer surface. */
  discBg: string;
  /**
   * Coastlines on the globe.
   *
   * These were white in both themes, which works over a dark disc and
   * disappears over a light one — the light map was drawing the continents
   * in white on white. A map's own lines have to be read against the
   * surface they are on, so they are a token rather than a constant.
   */
  mapLine: string;
  /** Distance rings and the terminator. Quieter than the coastlines. */
  mapGuide: string;
}

// Exported for the error boundary, which cannot call `useTheme` — it has to
// render when the tree around it has failed.
export const uiLight: UiColors = {
  page: slate[25],
  card: slate[0],
  inset: slate[25],
  line: slate[100],
  line2: slate[200],
  ink: slate[950],
  inkInv: slate[25],
  text2: slate[700],
  text3: slate[500],
  text4: slate[400],
  accent: cyan[700],
  accentInk: cyan[50],
  amberNum: amber[700],
  amberBg: amber[100],
  amberFg: amber[800],
  ionoBg: cyan[50],
  ionoTitle: cyan[900],
  ionoSub: cyan[700],
  tagBg: cyan[200],
  tagFg: cyan[800],
  discBg: slate[50],
  mapLine: slate[600],
  mapGuide: slate[400],
};

const uiDark: UiColors = {
  page: slate[1000],
  card: slate[950],
  inset: slate[900],
  line: slate[800],
  line2: slate[700],
  ink: slate[25],
  inkInv: slate[1000],
  text2: slate[200],
  text3: slate[300],
  text4: slate[400],
  accent: cyan[400],
  accentInk: cyan[900],
  amberNum: amber[400],
  amberBg: amber[800],
  amberFg: amber[200],
  ionoBg: cyan[900],
  ionoTitle: cyan[100],
  ionoSub: cyan[200],
  tagBg: cyan[700],
  tagFg: cyan[50],
  discBg: slate[900],
  // Two steps lighter than they were, so the coastlines read through the
  // reach fills over them (user, 2026-08-01). Two rather than one because
  // one step is exactly `mapGuide`, and coastlines the same colour as the
  // terminator are worse than coastlines that are too dark.
  //
  // This also settles what the comment on the token already claimed. It
  // says the guide is quieter than the coastlines, which was true of the
  // light theme and backwards here — the guide was the brighter of the
  // two. Now it holds in both.
  mapLine: slate[200],
  mapGuide: slate[300],
};

const lightColors = {
  ui: uiLight,
  primary: cyan[700],
  onPrimary: slate[0],
  primaryContainer: cyan[100],
  onPrimaryContainer: cyan[900],
  secondary: indigo[700],
  onSecondary: slate[0],
  secondaryContainer: indigo[100],
  onSecondaryContainer: indigo[900],
  tertiary: amber[700],
  onTertiary: slate[0],
  tertiaryContainer: amber[100],
  onTertiaryContainer: amber[900],
  error: rose[600],
  onError: slate[0],
  errorContainer: rose[100],
  onErrorContainer: rose[900],
  background: slate[25],
  onBackground: slate[950],
  surface: slate[25],
  onSurface: slate[950],
  surfaceVariant: slate[100],
  onSurfaceVariant: slate[600],
  outline: slate[400],
  outlineVariant: slate[200],
  shadow: '#000000',
  scrim: '#000000',
  inverseSurface: slate[900],
  inverseOnSurface: slate[50],
  inversePrimary: cyan[400],
  surfaceDisabled: 'rgba(18, 21, 31, 0.12)',
  onSurfaceDisabled: 'rgba(18, 21, 31, 0.38)',
  backdrop: 'rgba(26, 31, 46, 0.4)',
  elevation: {
    level0: 'transparent',
    level1: slate[0],
    level2: slate[0],
    level3: slate[0],
    level4: slate[0],
    level5: slate[0],
  },
  quality: quality.light,
};

const darkColors = {
  ui: uiDark,
  primary: cyan[400],
  onPrimary: cyan[900],
  primaryContainer: cyan[800],
  onPrimaryContainer: cyan[200],
  secondary: indigo[300],
  onSecondary: indigo[900],
  secondaryContainer: indigo[800],
  onSecondaryContainer: indigo[200],
  tertiary: amber[400],
  onTertiary: amber[900],
  tertiaryContainer: amber[800],
  onTertiaryContainer: amber[200],
  error: rose[400],
  onError: rose[900],
  errorContainer: rose[800],
  onErrorContainer: rose[200],
  background: slate[1000],
  onBackground: '#E6E9F2',
  surface: slate[1000],
  onSurface: '#E6E9F2',
  surfaceVariant: slate[800],
  onSurfaceVariant: '#A3ABC4',
  outline: slate[600],
  outlineVariant: slate[800],
  shadow: '#000000',
  scrim: '#000000',
  inverseSurface: slate[50],
  inverseOnSurface: slate[900],
  inversePrimary: cyan[700],
  surfaceDisabled: 'rgba(230, 233, 242, 0.12)',
  onSurfaceDisabled: 'rgba(230, 233, 242, 0.38)',
  backdrop: 'rgba(11, 13, 20, 0.6)',
  /**
   * Material tints elevated surfaces with the primary hue. At this chroma that
   * reads as a cyan wash over everything, so these step through the neutral
   * ramp instead and let hairline borders carry the elevation.
   */
  elevation: {
    level0: 'transparent',
    level1: slate[950],
    level2: slate[900],
    level3: slate[800],
    level4: slate[800],
    level5: slate[700],
  },
  quality: quality.dark,
};

/**
 * IBM Plex Sans, one file per weight.
 *
 * React Native cannot synthesise a weight from a font it has loaded: asking
 * for `fontWeight: '600'` on a family whose only registered face is regular
 * gives either the regular face or a smeared fake bold, depending on the
 * platform. So the weight is chosen by naming the face, and `fontWeight`
 * appears nowhere in the scale below.
 *
 * The names are the keys `@expo-google-fonts/ibm-plex-sans` exports, and
 * `App.tsx` must load exactly these four before rendering.
 *
 * Declared here, above `plexFonts`, because that function reads it while this
 * module is still evaluating. Below its first use it is in the temporal dead
 * zone, and every import of the theme throws before React mounts.
 */
export const face = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
} as const;

/**
 * The same faces for Paper's own components.
 *
 * Paper's variants carry a `fontWeight`, which is exactly what cannot select
 * a face here — so each variant is rewritten to name the face matching the
 * weight it asked for, and the weight is dropped. Without this the location
 * picker's buttons and list rows render in the system font while everything
 * around them is Plex.
 */
function plexFonts(base: typeof MD3LightTheme.fonts) {
  const byWeight: Record<string, string> = {
    '400': face.regular,
    '500': face.medium,
    '600': face.semibold,
    '700': face.bold,
  };
  return Object.fromEntries(
    Object.entries(base).map(([variant, style]) => {
      if (typeof style !== 'object' || style === null) return [variant, style];
      const { fontWeight, ...rest } = style as { fontWeight?: string; };
      return [variant, {
        ...rest,
        fontFamily: byWeight[fontWeight ?? '400'] ?? face.regular,
      }];
    }),
  ) as typeof base;
}

export const lightTheme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, ...lightColors },
  fonts: plexFonts(MD3LightTheme.fonts),
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, ...darkColors },
  fonts: plexFonts(MD3DarkTheme.fonts),
};

export type AppTheme = typeof lightTheme;

/**
 * Percentages, frequencies and hours all sit in columns that must not jitter
 * as values change. `fontVariant` is honoured on iOS; on Android it depends on
 * the bundled font exposing the `tnum` feature — see README.
 */
export const numeric = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
}).tabular;

/**
 * The spacing scale.
 *
 * Six steps, every one a multiple of four, so they drop into style objects
 * as plain numbers. **Gaps grow as the relationship weakens** — that rule is
 * the scale; the numbers are just where it lands.
 *
 * Before this existed every margin was written inline, which is why the app
 * had a considered colour system and no rhythm at all.
 */
export const spacing = {
  /** A label and its own value; padding inside a chip. */
  xs: 4,
  /** Dense table rows, a swatch and its text, gaps between chips or tiles. */
  sm: 8,
  /** Elements inside one card. */
  md: 12,
  /** Card padding, screen gutters. */
  lg: 16,
  /** Between cards. */
  xl: 24,
  /** The bottom of a scroll, so the last card clears the gesture area. */
  xxl: 32,
} as const;

/**
 * Screen padding, which is not a single step: the top is deliberately tight
 * because the header sits close to what follows it.
 */
export const screenPadding = {
  phone: {
    paddingTop: 4,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  tablet: {
    paddingTop: spacing.sm,
    paddingHorizontal: 20,
    paddingBottom: spacing.xxl,
  },
} as const;

/** Corner radii, largest to smallest surface. */
export const radius = {
  /** The device frame in the design; sheets and full-screen panes. */
  frame: 28,
  /** Cards. */
  card: 20,
  /** Buttons and fields. */
  control: 14,
  /** Chips, and recessed panels inside a card. */
  inset: 12,
  /** Heatmap cells. */
  cell: 3,
} as const;

/**
 * The type scale.
 *
 * One family throughout, with numbers separated from labels by weight and
 * tracking rather than by a second family. Sizes are the design's; the M3
 * role each one replaces is named so a Paper `variant` can be swapped for
 * an entry here without guessing.
 *
 * **Nothing goes below 11px.** The app is read outdoors in direct sunlight,
 * which is a stronger constraint than any density argument.
 *
 * Japanese wants roughly +2px of line height at body size and below, and
 * German runs about 35% longer than English — so every label slot has to
 * wrap rather than truncate, and no chip may carry a fixed width.
 */
export const typography = {
  /**
   * The title of a screen that fills the frame, which is the first-run pane
   * and nothing else. Larger than a card headline because it has no card
   * around it to give it weight. The design sets it at 28/34.
   */
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: face.bold,
    letterSpacing: -0.5,
  },
  /** Location name in the header. Replaces titleLarge. */
  locationName: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: face.bold,
    letterSpacing: -0.3,
  },
  /** The headline on a card. Replaces headlineSmall. */
  cardHeadline: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: face.semibold,
    letterSpacing: -0.3,
  },
  /** The plain-language answer. Lighter than a title on purpose — it reads
   * as a sentence, not a heading. Replaces titleMedium. */
  answer: {
    fontSize: 17,
    lineHeight: 24,
    fontFamily: face.medium,
    letterSpacing: 0,
  },
  /** A card's own title. Replaces titleMedium. */
  cardTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontFamily: face.semibold,
    letterSpacing: 0,
  },
  /** A large standalone figure, such as solar flux. Replaces headlineSmall. */
  statValue: {
    fontSize: 28,
    lineHeight: 32,
    fontFamily: face.semibold,
    letterSpacing: -0.5,
  },
  /** A figure inside a row or readout. Replaces titleLarge. */
  numberMedium: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: face.semibold,
    letterSpacing: 0,
  },
  /** Body text and input values. Replaces bodyLarge. */
  body: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: face.regular,
    letterSpacing: 0,
  },
  /** Body weight for a value that has to hold its own beside a label. */
  bodyStrong: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: face.semibold,
    letterSpacing: 0,
  },
  /** Text fields, which need to stay comfortable to read while typing. */
  input: {
    fontSize: 17,
    lineHeight: 24,
    fontFamily: face.regular,
    letterSpacing: 0,
  },
  /** Supporting text under a title. Replaces bodySmall. */
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: face.regular,
    letterSpacing: 0,
  },
  /** A caption carrying a value rather than prose. */
  captionStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: face.semibold,
    letterSpacing: 0,
  },
  /** The uppercase label above a value. Replaces labelSmall. */
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: face.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  /** Axis ticks and footnotes. The floor: never smaller than this. */
  axis: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: face.semibold,
    letterSpacing: 0,
  },
  /** The title on a full-screen setup pane. Tablet steps up to 34/40. */
  setupTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: face.semibold,
    letterSpacing: -0.6,
  },
  setupTitleTablet: {
    fontSize: 34,
    lineHeight: 40,
    fontFamily: face.semibold,
    letterSpacing: -0.6,
  },
} as const;
