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

const LANGUAGES = ['en', 'de', 'es', 'ja', 'ar'] as const;

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
});
