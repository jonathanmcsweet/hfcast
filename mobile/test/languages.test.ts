import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

/**
 * The language facts, checked against themselves.
 *
 * The one that can fail quietly is which languages the bundled font can
 * draw. Naming IBM Plex Sans for a script it has no letters for does not
 * throw and does not warn: Android substitutes a font that can, so the
 * screen mixes two typefaces, and a device stripped of the fonts for
 * that script shows empty boxes instead. Nobody testing in English ever
 * sees either.
 *
 * So the list is checked against the one piece of evidence in the file
 * that is written in the language itself — its endonym. A language whose
 * own name cannot be drawn with the bundled font must not claim it.
 */

mock.module('expo-localization', {
  namedExports: { getLocales: () => [{ languageCode: 'en' }] },
});

const stub = () => import('../src/i18n/languages.ts');

/**
 * What IBM Plex Sans has letters for: Latin and its extensions, Greek
 * and Cyrillic. Everything else needs the device's own font.
 *
 * An accented letter is matched in its single-character form, which is
 * what every name here uses. A name written with a separate combining
 * accent would fail this, and writing it the ordinary way is the right
 * answer to that.
 */
const COVERED = /^[\u0020-\u024F\u0370-\u03FF\u0400-\u04FF]+$/;

describe('the languages the app ships', () => {
  it('claims the bundled font only for scripts it can draw', async () => {
    const { BUNDLED_FONT_LANGUAGES, LANGUAGE_NAMES } = await stub();
    for (const lang of BUNDLED_FONT_LANGUAGES) {
      const endonym = LANGUAGE_NAMES[lang];
      assert.match(
        endonym,
        COVERED,
        `${lang} is listed as drawable in the bundled font, but its own
           name "${endonym}" needs a script the font does not carry`,
      );
    }
  });

  it('leaves a language off that list rather than guessing', async () => {
    // The safe direction. A language nobody checked gets the device's own
    // font, which is certain to have letters for it, so this asserts only
    // that every name on the list is a language the app actually has.
    const { BUNDLED_FONT_LANGUAGES, SUPPORTED } = await stub();
    for (const lang of BUNDLED_FONT_LANGUAGES) {
      assert.ok(
        (SUPPORTED as readonly string[]).includes(lang),
        `${lang} is not a language the app ships`,
      );
    }
  });

  it('names a direction and a font decision for every language', async () => {
    const { BUNDLED_FONT_LANGUAGES, RTL_LANGUAGES, SUPPORTED } = await stub();
    for (const lang of RTL_LANGUAGES) {
      assert.ok(
        (SUPPORTED as readonly string[]).includes(lang),
        `${lang} is right-to-left but is not shipped`,
      );
      assert.ok(
        !BUNDLED_FONT_LANGUAGES.includes(lang),
        `${lang} is right-to-left, so it is not a Latin script and
           cannot use the bundled font`,
      );
    }
  });

  it('gives every language an endonym and an Intl locale', async () => {
    const { INTL_LOCALES, LANGUAGE_NAMES, SUPPORTED } = await stub();
    for (const lang of SUPPORTED) {
      assert.ok(LANGUAGE_NAMES[lang], `${lang} has no name of its own`);
      assert.match(
        INTL_LOCALES[lang] ?? '',
        /^[a-z]{2}-[A-Z]{2}$/,
        `${lang} needs a BCP 47 tag for Intl`,
      );
    }
  });
});
