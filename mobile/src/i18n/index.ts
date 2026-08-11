import './polyfills';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { deviceLanguage } from './languages';
import ar from './locales/ar.json';
import de from './locales/de.json';
import enCA from './locales/en-CA.json';
import enGB from './locales/en-GB.json';
import en from './locales/en.json';
import es from './locales/es.json';
import ja from './locales/ja.json';

/**
 * The language facts live in `./languages.ts` and are re-exported here,
 * so every existing import of them keeps working and anything that needs
 * one without needing i18next can reach for the smaller module.
 */
export {
  BUNDLED_FONT_LANGUAGES,
  INTL_LOCALES,
  LANGUAGE_NAMES,
  RTL_LANGUAGES,
  SUPPORTED,
} from './languages';
export type { SupportedLanguage } from './languages';

/**
 * The two other Englishes carry only the strings they spell differently.
 * i18next looks a key up in `en-GB` first and then in `en`, so the rest
 * of the app is shared rather than copied three times — which is what
 * keeps a new string from having to be written out once per English.
 */
i18n.use(initReactI18next).init({
  resources: {
    'en': { translation: en },
    'en-GB': { translation: enGB },
    'en-CA': { translation: enCA },
    'es': { translation: es },
    'de': { translation: de },
    'ja': { translation: ja },
    'ar': { translation: ar },
  },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
