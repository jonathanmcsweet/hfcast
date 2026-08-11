import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every language carries every key.
 *
 * A missing key renders as its own dotted path — "disclaimer.title.nowcast"
 * where a sentence should be — which is not an error anywhere and is only
 * found by opening the app in that language. Five locales are enough that
 * adding a string by hand and missing one is the normal outcome rather than
 * the unlucky one.
 */

/** The languages that carry a whole translation of their own. */
const LANGUAGES = ['en', 'de', 'es', 'ja', 'ar'] as const;

/**
 * The Englishes that carry only what they spell differently.
 *
 * i18next resolves anything they do not hold against `en`, so they are
 * partial on purpose and the parity check above would be wrong for them.
 * What they need instead is that every key they do hold is a real one,
 * that it says something different from American English, and that it
 * keeps the placeholders — a variant is a spelling, not a rewrite.
 */
const VARIANTS = ['en-GB', 'en-CA'] as const;

const locale = (lang: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      path.join(
        import.meta.dirname,
        '..',
        'src',
        'i18n',
        'locales',
        `${lang}.json`,
      ),
      'utf8',
    ),
  );

/** Every leaf's dotted path, so a nested section is compared as a whole. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) =>
      keyPaths(child, prefix === '' ? key : `${prefix}.${key}`)
    );
}

describe('the five locales', () => {
  const english = keyPaths(locale('en')).sort();

  it('has something to translate at all', () => {
    assert.ok(english.length > 150, `only ${english.length} keys in English`);
  });

  for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
    it(`${lang} has the same keys as English`, () => {
      const theirs = keyPaths(locale(lang)).sort();
      const missing = english.filter((key) => !theirs.includes(key));
      const extra = theirs.filter((key) => !english.includes(key));
      assert.deepEqual(
        missing,
        [],
        `${lang} is missing: ${missing.join(', ')}`,
      );
      // An extra key is a string that was renamed in English and left behind
      // here, which is dead weight rather than a visible fault — but it is
      // the same mistake and worth the same failure.
      assert.deepEqual(
        extra,
        [],
        `${lang} has stale keys: ${extra.join(', ')}`,
      );
    });
  }

  it('leaves no empty string anywhere', () => {
    for (const lang of LANGUAGES) {
      const flat = JSON.stringify(locale(lang));
      assert.ok(!/:\s*""/.test(flat), `${lang} has an empty value`);
    }
  });

  it('keeps every placeholder a translation was given', () => {
    // `{{ssn}}` written as `{ssn}` in one language silently prints the braces.
    const placeholders = (text: unknown): string[] =>
      typeof text === 'string'
        ? [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? '').sort()
        : [];

    const read = (doc: Record<string, unknown>, dotted: string): unknown =>
      dotted.split('.').reduce<unknown>(
        (node, key) =>
          node !== null && typeof node === 'object'
            ? (node as Record<string, unknown>)[key]
            : undefined,
        doc,
      );

    const source = locale('en');
    for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
      const target = locale(lang);
      for (const key of english) {
        assert.deepEqual(
          placeholders(read(target, key)),
          placeholders(read(source, key)),
          `${lang} ${key} does not carry the same placeholders`,
        );
      }
    }
  });

  for (const lang of VARIANTS) {
    it(`${lang} overrides real keys, and only where it differs`, () => {
      const source = locale('en');
      const target = locale(lang);
      const theirs = keyPaths(target);
      assert.ok(theirs.length > 0, `${lang} overrides nothing at all`);

      const read = (doc: Record<string, unknown>, dotted: string): unknown =>
        dotted.split('.').reduce<unknown>(
          (node, key) =>
            node !== null && typeof node === 'object'
              ? (node as Record<string, unknown>)[key]
              : undefined,
          doc,
        );

      for (const key of theirs) {
        const held = read(source, key);
        // A key English does not have overrides nothing, so it would
        // never be read — the string is simply gone from that language.
        assert.equal(
          typeof held,
          'string',
          `${lang} overrides ${key}, which English does not have`,
        );
        // Identical to English is a line that does nothing, and one more
        // place to edit the next time the English changes.
        assert.notEqual(
          read(target, key),
          held,
          `${lang} ${key} is the same as English and should be dropped`,
        );
        assert.deepEqual(
          [...String(read(target, key)).matchAll(/\{\{(\w+)\}\}/g)]
            .map((m) => m[1] ?? '').sort(),
          [...String(held).matchAll(/\{\{(\w+)\}\}/g)]
            .map((m) => m[1] ?? '').sort(),
          `${lang} ${key} does not carry the same placeholders`,
        );
      }
    });
  }
});
