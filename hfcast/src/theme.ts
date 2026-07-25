import { StyleSheet } from 'react-native';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { amber, cyan, indigo, rose, slate } from './palette';

/**
 * Propagation quality is a four-state scale, not a continuous gradient.
 * MD3 has no role for "this band is marginal", so we extend the scheme with a
 * parallel set of container/on-container pairs that follow the same contrast
 * rules as the built-in roles.
 */
export type QualityKey = 'reliable' | 'marginal' | 'poor' | 'closed';

type QualityColors = Record<
  QualityKey,
  { base: string; container: string; onContainer: string; }
>;

/**
 * Two scales ship. `signal` is the default.
 *
 * `signal` is ordinal: quality maps to contrast against the page, so it stays
 * readable in greyscale and under every form of colour blindness. Brighter
 * against a dark page, darker against a light one — either way, more contrast
 * means more signal.
 *
 * `traffic` is the familiar green/amber/red. It trades those accessibility
 * properties for instant recognition. Switch if testing says the ordinal ramp
 * costs more than it gains.
 */
export type QualityScale = 'signal' | 'traffic';
export const QUALITY_SCALE: QualityScale = 'signal';

const signalLight: QualityColors = {
  reliable: { base: cyan[700], container: cyan[100], onContainer: cyan[900] },
  marginal: { base: indigo[600], container: '#DEE7FF', onContainer: '#122353' },
  poor: { base: '#8B80DE', container: indigo[50], onContainer: '#241C5C' },
  closed: { base: '#C3C9D9', container: slate[50], onContainer: slate[600] },
};

const signalDark: QualityColors = {
  reliable: { base: cyan[400], container: cyan[800], onContainer: cyan[200] },
  marginal: { base: indigo[500], container: '#1B3468', onContainer: '#C3D6FF' },
  poor: { base: indigo[400], container: indigo[800], onContainer: '#D4CEFF' },
  closed: { base: '#3E4459', container: slate[900], onContainer: slate[300] },
};

const trafficLight: QualityColors = {
  reliable: { base: '#2F7D32', container: '#D3EDD4', onContainer: '#0E2B10' },
  marginal: { base: '#9A6200', container: '#FFE7BE', onContainer: '#331F00' },
  poor: { base: '#B3261E', container: '#FFDAD6', onContainer: '#410E0B' },
  closed: { base: '#C3C9D9', container: slate[50], onContainer: slate[600] },
};

const trafficDark: QualityColors = {
  reliable: { base: '#7BC97F', container: '#1B4D1F', onContainer: '#C6E9C8' },
  marginal: { base: '#F0B152', container: '#553800', onContainer: '#FFDFA0' },
  poor: { base: '#F2857D', container: '#5E1512', onContainer: '#FFDAD6' },
  closed: { base: '#3E4459', container: slate[900], onContainer: slate[300] },
};

const quality = {
  light: QUALITY_SCALE === 'signal' ? signalLight : trafficLight,
  dark: QUALITY_SCALE === 'signal' ? signalDark : trafficDark,
};

const lightColors = {
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

export const lightTheme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, ...lightColors },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, ...darkColors },
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
