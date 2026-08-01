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
 * React Native cannot be loaded under Node, so `theme.ts`'s two imports
 * are replaced with the little it uses — the same arrangement, and for
 * the same reason, as `theme.test.ts`.
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

describe('every text the fixed header shows, on the header', () => {
  it('is readable in both themes', async () => {
    for (const [name, ui] of await themes()) {
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
    // true black — there is nothing below black to step down to, and
    // that theme separates the two with its border instead. Requiring a
    // strict step would force a lit header on the one theme whose whole
    // purpose is that nothing is lit.
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
  it('stay readable in both themes', async () => {
    for (const [name, ui] of await themes()) {
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

describe('the low-light theme emits no short wavelengths', () => {
  it('has no green and no blue in any surface or text role', async () => {
    // The whole point of the theme. Rod cells carry dark adaptation and
    // are nearly blind past 620 nm, so red can be read without spending
    // it — and a single green or blue channel anywhere undoes that for
    // the whole screen. This is the property most easily lost by an
    // ordinary-looking edit, which is why it is checked rather than
    // documented.
    const { uiLowLight } = await import('../src/theme.ts');
    for (const [role, value] of Object.entries(uiLowLight)) {
      const [, green, blue] = channels(value);
      assert.equal(green, 0, `${role} is ${value}, which has green in it`);
      assert.equal(blue, 0, `${role} is ${value}, which has blue in it`);
    }
  });

  it('reaches the ceiling red on black allows, and no further', async () => {
    // 5.25 is what pure red on black comes to. Stated so that a later
    // reader who finds the text hierarchy flat knows it is a limit of
    // the physics and not a choice that can be undone.
    const { uiLowLight } = await import('../src/theme.ts');
    assert.ok(Math.abs(contrast('#FF0000', '#000000') - 5.25) < 0.01);
    assert.equal(uiLowLight.ink, '#FF0000');
    assert.equal(uiLowLight.page, '#000000');
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
