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

export const SUPPORTED = ['en', 'es', 'de', 'ja', 'ar'] as const;
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
export const BUNDLED_FONT_LANGUAGES: SupportedLanguage[] = ['en', 'es', 'de'];

/** Endonyms — a language picker should name each language in that language. */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  ja: '日本語',
  ar: 'العربية',
};

/** BCP 47 tags for Intl. Kept separate: i18next keys and Intl locales differ. */
export const INTL_LOCALES: Record<SupportedLanguage, string> = {
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  ja: 'ja-JP',
  ar: 'ar-EG',
};

export function deviceLanguage(): SupportedLanguage {
  const tag = getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED as readonly string[]).includes(tag)
    ? (tag as SupportedLanguage)
    : 'en';
}
