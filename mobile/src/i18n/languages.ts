import { getLocales } from 'expo-localization';

/**
 * Which languages the app has, and what each one needs from the layout.
 *
 * Apart from `./index.ts`, which turns them into i18next resources. This
 * module reaches only for the device's own locale, so anything that has
 * to know a language fact — the theme picking a font, a hook picking a
 * direction — can ask without loading five locale files and a set of
 * Intl polyfills that replace globals. `theme.ts` is imported by every
 * component and runs work at module scope, so what it depends on is
 * worth keeping small.
 */

/**
 * `en` is American English and is the one every other English falls back
 * to. `en-GB` and `en-CA` hold only the strings they spell differently —
 * i18next resolves the rest against `en` — so a string added to the app
 * needs no entry in either unless its spelling moves (user, 2026-08-11).
 *
 * Canada is not Britain with a different flag: it writes -our and -re
 * like Britain and -ize like the United States, so the two variants are
 * not the same file.
 *
 * An English the app does not carry — `en-AU`, `en-IE` — falls to `en`,
 * which is American. Adding one is a locale file of its differences and
 * a line here.
 */
export const SUPPORTED = [
  'en',
  'en-GB',
  'en-CA',
  'es',
  'de',
  'ja',
  'ar',
] as const;
export type SupportedLanguage = (typeof SUPPORTED)[number];

export const RTL_LANGUAGES: SupportedLanguage[] = ['ar'];

/**
 * Languages the bundled font can draw.
 *
 * IBM Plex Sans has letters for Latin, Greek and Cyrillic and for
 * nothing else. Named for any other language it draws nothing, and
 * Android quietly substitutes a font that can — so a Japanese sentence
 * came out in the device's font while the digits inside it stayed in
 * Plex, and on a device stripped of the fonts for that script it came
 * out as empty boxes. Those languages use the device's own font
 * instead (user, 2026-08-11).
 *
 * A list of what the font covers, not a list of exceptions. A language
 * added without anyone checking then gets the device's font, which is
 * certain to have letters for it. The other way round, forgetting to
 * add a line here would ship empty boxes.
 */
export const BUNDLED_FONT_LANGUAGES: SupportedLanguage[] = [
  'en',
  'en-GB',
  'en-CA',
  'es',
  'de',
];

/**
 * Endonyms — a language picker should name each language in that
 * language. The three Englishes are told apart by country, because
 * "English" three times in a list says nothing about which to pick.
 */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  'en': 'English (US)',
  'en-GB': 'English (UK)',
  'en-CA': 'English (Canada)',
  'es': 'Español',
  'de': 'Deutsch',
  'ja': '日本語',
  'ar': 'العربية',
};

/** BCP 47 tags for Intl. Kept separate: i18next keys and Intl locales differ. */
export const INTL_LOCALES: Record<SupportedLanguage, string> = {
  'en': 'en-US',
  'en-GB': 'en-GB',
  'en-CA': 'en-CA',
  'es': 'es-ES',
  'de': 'de-DE',
  'ja': 'ja-JP',
  'ar': 'ar-EG',
};

/**
 * The language to start in.
 *
 * The full tag is tried before the bare language, so a tablet set to
 * Canadian English gets Canadian English rather than American. A tag the
 * app does not carry falls back to its language — `en-AU` to `en` — and
 * anything else to English.
 *
 * Matched without case, because a tag is not case sensitive and a device
 * reporting `en-gb` means the same thing as one reporting `en-GB`.
 */
export function deviceLanguage(): SupportedLanguage {
  const locale = getLocales()[0];
  const known = new Map(
    SUPPORTED.map((lang) => [lang.toLowerCase(), lang] as const),
  );
  const tag = locale?.languageTag?.toLowerCase();
  const code = locale?.languageCode?.toLowerCase();
  return (tag ? known.get(tag) : undefined)
    ?? (code ? known.get(code) : undefined)
    ?? 'en';
}
