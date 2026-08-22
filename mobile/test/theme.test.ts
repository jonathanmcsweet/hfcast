import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

/**
 * The theme has to survive being imported.
 *
 * This is not a style check. `theme.ts` runs code at module scope — it
 * rewrites Paper's font variants as the module evaluates — and every
 * component imports it. An error there throws before React mounts, so
 * there is no error boundary and no message: the app is a white screen.
 *
 * Nothing else catches it. The type checker accepts a `const` read inside
 * a function declared above it, the bundler happily bundles it, and the
 * other suites test pure functions that never touch the theme. The bug
 * this guards against shipped exactly that way.
 *
 * React Native cannot be loaded under Node, so its two modules are
 * replaced with the little that `theme.ts` actually uses.
 */

const fonts = {
  bodyLarge: { fontFamily: 'System', fontWeight: '400', fontSize: 16 },
  titleMedium: { fontFamily: 'System', fontWeight: '500', fontSize: 16 },
  labelLarge: { fontFamily: 'System', fontWeight: '600', fontSize: 14 },
  default: { fontFamily: 'System', fontWeight: '400' },
};

// Registered once for the whole file: a module can only be mocked once per
// process, and the import is cached after the first load anyway.
mock.module('react-native', {
  namedExports: { StyleSheet: { create: (o: unknown) => o } },
});
mock.module('react-native-paper', {
  namedExports: {
    MD3LightTheme: { colors: {}, fonts },
    MD3DarkTheme: { colors: {}, fonts },
  },
});
// The theme asks the device what language it is in, to know whether the
// bundled font has letters for it. English here, so the assertions below
// describe the bundled-font case; the other case is checked as a rule in
// `languages.test.ts`, which needs no theme at all.
mock.module('expo-localization', {
  namedExports: { getLocales: () => [{ languageCode: 'en' }] },
});

const stub = () => import('../src/theme.ts');

describe('the theme module', () => {
  it('evaluates without throwing', async () => {
    // If this fails, the app renders nothing at all.
    const theme = await stub();
    assert.ok(theme.lightTheme, 'the light theme must exist');
    assert.ok(theme.darkTheme, 'the dark theme must exist');
  });

  it('gives the map only colours the native canvas can parse', async () => {
    // The system renderer hands these straight to Android's
    // `Color.parseColor`, which takes a hex string or one of a few names
    // and throws on anything else. `rgba(...)` is used elsewhere in this
    // file and would be caught here rather than as a magenta map on a
    // phone.
    const { lightTheme, darkTheme, lowLightTheme } = await stub();
    for (const theme of [lightTheme, darkTheme, lowLightTheme]) {
      const { map, ui } = theme.colors;
      const drawn = [
        ui.card,
        ui.nvisDot,
        ...Object.values(map).map((state) => state.fill),
      ];
      for (const colour of drawn) {
        assert.match(colour, /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/);
      }
    }
  });

  it('names a font face for every weight it offers', async () => {
    const { face } = await stub();
    for (const [weight, style] of Object.entries(face)) {
      assert.match(
        style.fontFamily ?? '',
        /^IBMPlexSans_\d{3}/,
        `${weight} must name a face`,
      );
    }
  });

  it('gives every type scale entry a face rather than a weight', async () => {
    // React Native cannot synthesise a weight, so a `fontWeight` here would
    // silently render as regular. This holds for the bundled font only: the
    // device's own font is one family with real weights, and asking it by
    // weight is the only way to reach them.
    const { typography } = await stub();
    for (const [name, style] of Object.entries(typography)) {
      const s = style as { fontFamily?: string; fontWeight?: string; };
      assert.ok(s.fontFamily, `${name} must name a face`);
      assert.equal(s.fontWeight, undefined, `${name} must not set a weight`);
    }
  });

  it("rewrites Paper's own variants onto the same faces", async () => {
    // Without this the location picker renders in the system font while
    // everything around it is Plex.
    const { lightTheme, darkTheme } = await stub();
    for (const theme of [lightTheme, darkTheme]) {
      for (const [variant, style] of Object.entries(theme.fonts)) {
        const s = style as { fontFamily?: string; fontWeight?: string; };
        if (typeof s !== 'object' || s === null) continue;
        assert.match(
          s.fontFamily ?? '',
          /^IBMPlexSans_/,
          `${variant} must use a bundled face`,
        );
        assert.equal(
          s.fontWeight,
          undefined,
          `${variant} must not set a weight`,
        );
      }
    }
  });

  it('maps each Paper weight to the matching face', async () => {
    const { lightTheme, face } = await stub();
    const f = lightTheme.fonts as Record<string, { fontFamily: string; }>;
    assert.equal(f.bodyLarge?.fontFamily, face.regular.fontFamily);
    assert.equal(f.titleMedium?.fontFamily, face.medium.fontFamily);
    assert.equal(f.labelLarge?.fontFamily, face.semibold.fontFamily);
  });

  it('carries the design surfaces both themes are read through', async () => {
    // Every screen reads `theme.colors.ui`. A missing key is a crash in a
    // component rather than here, which is harder to place.
    const { lightTheme, darkTheme } = await stub();
    const keys = ['page', 'card', 'inset', 'line', 'ink', 'accent'] as const;
    for (const theme of [lightTheme, darkTheme]) {
      for (const key of keys) {
        assert.match(
          theme.colors.ui[key] ?? '',
          /^#|^rgb/,
          `ui.${key} must be a colour`,
        );
      }
    }
  });
});
