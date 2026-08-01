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

  it('knows the ceiling it is working under', async () => {
    // 5.25 is what pure red on black comes to, against 21 for white on
    // black. Stated so a later reader knows the flat range is a limit of
    // the physics rather than a choice that can be undone.
    assert.ok(Math.abs(contrast('#FF0000', '#000000') - 5.25) < 0.01);
    const { uiLowLight } = await import('../src/theme.ts');
    assert.equal(uiLowLight.page, '#000000');
  });

  it('keeps the answer and the controls legible, and dims the rest', async () => {
    // The two roles worth spending light on: `ink` is the answer and
    // `accent` is what can be pressed. Everything below them is under
    // the WCAG marks on purpose — see the note on `compliant` above.
    const { uiLowLight: ui } = await import('../src/theme.ts');
    assert.ok(
      contrast(ui.ink, ui.page) >= AA_TEXT,
      `ink is ${contrast(ui.ink, ui.page).toFixed(2)}`,
    );
    assert.ok(
      contrast(ui.accent, ui.page) >= AA_LARGE,
      `accent is ${contrast(ui.accent, ui.page).toFixed(2)}`,
    );
    // And the rest genuinely are dimmer, which is the whole gain from
    // dropping the mark. If these crept back above it, the theme would
    // be bright again for no reason.
    assert.ok(contrast(ui.text3, ui.page) < AA_TEXT);
    assert.ok(contrast(ui.text4, ui.page) < AA_TEXT);
  });

  it('steps down a real ladder rather than three shades of one red', async () => {
    // The first version held every role above 4.5, which pinned them all
    // to the top three steps of the ramp — no hierarchy, and brighter
    // than a night theme should be. This is what replaced it.
    const { uiLowLight: ui } = await import('../src/theme.ts');
    const ladder = [ui.accent, ui.ink, ui.text2, ui.text3, ui.text4];
    for (const [i, colour] of ladder.entries()) {
      if (i === 0) continue;
      assert.ok(
        luminance(colour) < luminance(ladder[i - 1] as string),
        `step ${i} (${colour}) is not dimmer than the one above it`,
      );
    }
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
