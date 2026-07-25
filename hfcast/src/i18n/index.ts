import './polyfills';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import es from './locales/es.json';
import de from './locales/de.json';
import ja from './locales/ja.json';
import ar from './locales/ar.json';

export const SUPPORTED = ['en', 'es', 'de', 'ja', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED)[number];

export const RTL_LANGUAGES: SupportedLanguage[] = ['ar'];

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

function deviceLanguage(): SupportedLanguage {
  const tag = getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED as readonly string[]).includes(tag)
    ? (tag as SupportedLanguage)
    : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    de: { translation: de },
    ja: { translation: ja },
    ar: { translation: ar },
  },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
