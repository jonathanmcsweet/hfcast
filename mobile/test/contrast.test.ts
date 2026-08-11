import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  AA_LARGE,
  AA_TEXT,
  channels,
  contrast,
  luminance,
} from '../src/contrast.ts';
import { slate } from '../src/palette.ts';

/**
 * WCAG contrast, checked rather than trusted.
 *
 * Contrast compliance is required of this app, and until now nothing
 * measured it — the palette was chosen carefully and left to be correct.
 * It stopped being correct the moment a background moved: a header one
 * step darker dropped the caption role on it from 4.66 to 4.34 against a
 * pass mark of 4.5. That is invisible by eye and fails outright, which
 * is exactly the kind of thing a test should be holding.
 *
 * The pairs below are the ones the design puts on screen. A colour
 * changed in `palette.ts` now fails here rather than on somebody's phone
 * in daylight.
 *
 * React Native cannot be loaded under Node, so `theme.ts`'s imports of it
 * are replaced with the little it uses — the same arrangement, and for
 * the same reason, as `theme.test.ts`. The device's language is stubbed
 * for the same reason: the theme asks for it to know whether the bundled
 * font has letters for it, and none of the colours below depend on the
 * answer.
 */

const fonts = {
  bodyLarge: { fontFamily: 'System', fontWeight: '400', fontSize: 16 },
  titleMedium: { fontFamily: 'System', fontWeight: '500', fontSize: 16 },
  labelLarge: { fontFamily: 'System', fontWeight: '600', fontSize: 14 },
  default: { fontFamily: 'System', fontWeight: '400' },
};

mock.module('react-native', {
  namedExports: { StyleSheet: { create: (o: unknown) => o } },
});
mock.module('react-native-paper', {
  namedExports: {
    MD3LightTheme: { colors: {}, fonts },
    MD3DarkTheme: { colors: {}, fonts },
  },
});
mock.module('expo-localization', {
  namedExports: { getLocales: () => [{ languageCode: 'en' }] },
});

const themes = async () => {
  const theme = await import('../src/theme.ts');
  return [
    ['light', theme.uiLight],
    ['dark', theme.uiDark],
    ['lowLight', theme.uiLowLight],
  ] as const;
};

describe('the contrast arithmetic', () => {
  it('puts black at zero and white at one', () => {
    assert.equal(luminance('#000000'), 0);
    assert.equal(luminance('#FFFFFF'), 1);
  });

  it('gives the extreme pair the maximum ratio WCAG defines', () => {
    assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21);
  });

  it('does not care which way round the pair is given', () => {
    assert.equal(
      contrast('#123456', '#FEDCBA'),
      contrast('#FEDCBA', '#123456'),
    );
  });

  it('reads short hex the same as long', () => {
    assert.equal(luminance('#FFF'), luminance('#FFFFFF'));
  });

  it('refuses a colour it cannot read rather than returning a number', () => {
    assert.throws(() => luminance('rebeccapurple'));
    assert.throws(() => luminance('#12345'));
  });

  it('uses the sRGB curve and not a plain gamma', () => {
    // Mid grey is where the two disagree enough to matter: the sRGB
    // transfer function puts #808080 at 0.2159 and a gamma of 2.2 at
    // 0.2176. Small — but it is the difference between 4.50 and 4.49 on
    // a pair sitting on the pass mark, which is where this gets used.
    assert.ok(Math.abs(luminance('#808080') - 0.2159) < 0.0005);
  });
});

/**
 * The two themes WCAG applies to.
 *
 * Low light is deliberately outside it (user, 2026-08-01): it is for a
 * niche situation, it is never selected by accident, and holding it to
 * 4.5 would confine the whole interface to the top of a ramp whose
 * ceiling is 5.25 — which produced a night theme with no hierarchy that
 * was also too bright. It has its own suite further down.
 */
const compliant = async () =>
  (await themes()).filter(([n]) => n !== 'lowLight');

describe('every text the fixed header shows, on the header', () => {
  it('is readable in the two compliant themes', async () => {
    for (const [name, ui] of await compliant()) {
      // The band label is short uppercase at 11pt bold, which WCAG
      // counts as large text. Everything else is ordinary text.
      const shown = [
        ['place name', ui.ink, AA_TEXT],
        ['change link', ui.accent, AA_TEXT],
        ['path summary', ui.text2, AA_TEXT],
        ['band label', ui.text3, AA_LARGE],
      ] as const;
      for (const [what, colour, mark] of shown) {
        const ratio = contrast(colour, ui.headerBg);
        assert.ok(
          ratio >= mark,
          `${name}: ${what} on the header is ${
            ratio.toFixed(2)
          }, needs ${mark}`,
        );
      }
    }
  });

  it('does not use the caption role there, which would fail', async () => {
    // Stated rather than left to be rediscovered. `text3` on the light
    // header is 4.34, so the header's own summary line uses `text2`.
    // If someone moves it back, this says why they should not.
    const [[, light]] = await themes();
    assert.ok(contrast(light.text3, light.headerBg) < AA_TEXT);
  });
});

describe('the header sits darker than the page below it', () => {
  it('is never lighter than the page', async () => {
    // Never lighter, rather than always darker. Low light puts both at
    // the same near-black and separates them with its border instead —
    // a step down from there would be a step toward black on the one
    // theme where every surface is already as dark as it should go.
    for (const [name, ui] of await themes()) {
      assert.ok(
        luminance(ui.headerBg) <= luminance(ui.page),
        `${name}: the header is lighter than the page`,
      );
    }
  });

  it('steps down in the two themes that have room to', async () => {
    for (const [name, ui] of await themes()) {
      if (name === 'lowLight') continue;
      assert.ok(
        luminance(ui.headerBg) < luminance(ui.page),
        `${name}: the header does not step down from the page`,
      );
    }
  });

  it('keeps the rule under it visible against both surfaces', async () => {
    for (const [name, ui] of await themes()) {
      assert.ok(
        contrast(ui.line2, ui.headerBg) >= 1.2,
        `${name}: the rule disappears into the header`,
      );
      assert.ok(
        contrast(ui.line, ui.page) >= 1.1,
        `${name}: the rule disappears into the page`,
      );
    }
  });
});

describe('the ordinary text roles, on the surfaces they are used on', () => {
  it('stay readable in the two compliant themes', async () => {
    for (const [name, ui] of await compliant()) {
      const surfaces = [
        ['page', ui.page],
        ['card', ui.card],
        ['inset', ui.inset],
      ] as const;
      const roles = [
        ['ink', ui.ink],
        ['text2', ui.text2],
        ['text3', ui.text3],
      ] as const;
      for (const [where, bg] of surfaces) {
        for (const [what, colour] of roles) {
          const ratio = contrast(colour, bg);
          assert.ok(
            ratio >= AA_TEXT,
            `${name}: ${what} on ${where} is ${ratio.toFixed(2)}`,
          );
        }
      }
    }
  });
});

describe('the low-light theme stays red, and stays dark', () => {
  it('never lets green or blue lead, in any role', async () => {
    // An earlier version used the red channel alone, which was harsh and
    // capped contrast at 5.25. The light end is desaturated now (user,
    // 2026-08-01, with a reference design), so green and blue are no
    // longer zero — but red still has to lead everywhere, or the theme
    // stops being a red theme.
    const { uiLowLight } = await import('../src/theme.ts');
    for (const [role, value] of Object.entries(uiLowLight)) {
      const [red, green, blue] = channels(value);
      assert.ok(red >= green, `${role} is ${value}: green is above red`);
      assert.ok(red >= blue, `${role} is ${value}: blue is above red`);
    }
  });

  it('keeps green and blue equal, so the hue does not drift', async () => {
    // Equal green and blue is what keeps the hue on red. Let them apart
    // and the theme slides toward orange one way or violet the other,
    // and the further it goes the more short-wavelength light it emits.
    const { uiLowLight } = await import('../src/theme.ts');
    for (const [role, value] of Object.entries(uiLowLight)) {
      const [, green, blue] = channels(value);
      assert.ok(
        Math.abs(green - blue) <= 4,
        `${role} is ${value}: green and blue differ by ${
          Math.abs(green - blue)
        }`,
      );
    }
  });

  it('keeps every surface genuinely dark', async () => {
    // The surfaces are most of the screen, so they are where the light
    // actually comes from. Text can be bright because there is little of
    // it; a page cannot.
    const { uiLowLight: ui } = await import('../src/theme.ts');
    for (
      const [role, value] of [
        ['page', ui.page],
        ['headerBg', ui.headerBg],
        ['card', ui.card],
        ['inset', ui.inset],
      ] as const
    ) {
      assert.ok(
        luminance(value) < 0.02,
        `${role} is ${value}, at ${luminance(value).toFixed(4)}`,
      );
    }
  });

  it('keeps the answer and the controls legible', async () => {
    // The two roles worth spending light on: `ink` is the answer and
    // `accent` is what can be pressed. Desaturating bought the room to
    // hold both well above the marks rather than at them.
    const { uiLowLight: ui } = await import('../src/theme.ts');
    assert.ok(
      contrast(ui.ink, ui.page) >= AA_TEXT,
      `ink is ${contrast(ui.ink, ui.page).toFixed(2)}`,
    );
    assert.ok(
      contrast(ui.accent, ui.page) >= AA_LARGE,
      `accent is ${contrast(ui.accent, ui.page).toFixed(2)}`,
    );
  });

  it('steps down a real ladder rather than shades of one red', async () => {
    // Pure red could not do this: its ceiling of 5.25 left no room for
    // five distinct levels. This is what the desaturation bought.
    const { uiLowLight: ui } = await import('../src/theme.ts');
    const ladder = [ui.ink, ui.text2, ui.text3, ui.text4];
    for (const [i, colour] of ladder.entries()) {
      if (i === 0) continue;
      assert.ok(
        luminance(colour) < luminance(ladder[i - 1] as string),
        `step ${i} (${colour}) is not dimmer than the one above it`,
      );
    }
    // And the range is wide enough to be worth having.
    assert.ok(contrast(ui.ink, ui.page) / contrast(ui.text4, ui.page) > 2);
  });
});

describe('the palette itself', () => {
  it('runs light to dark without doubling back', () => {
    // A ramp that is not monotonic makes every "one step darker" choice
    // a guess, and the header change was exactly that choice.
    const steps = [
      0,
      25,
      50,
      100,
      200,
      300,
      400,
      500,
      600,
      700,
      800,
      900,
      950,
      1000,
    ] as const;
    const lit = steps.map((step) => luminance(slate[step]));
    for (const [i, value] of lit.entries()) {
      if (i === 0) continue;
      assert.ok(
        value < (lit[i - 1] as number),
        `slate[${steps[i]}] is not darker than slate[${steps[i - 1]}]`,
      );
    }
  });
});
