/**
 * Hermes ships a partial ICU. On Android in particular, `Intl.NumberFormat`
 * and `Intl.DateTimeFormat` may fall back to English formatting for
 * non-English locales, which quietly defeats the point of localising.
 *
 * These polyfills install a complete implementation and load locale data for
 * the languages we ship. Import this module once, before i18n initialises.
 */
import '@formatjs/intl-getcanonicallocales/polyfill';
import '@formatjs/intl-locale/polyfill';
import '@formatjs/intl-pluralrules/polyfill';
import '@formatjs/intl-numberformat/polyfill';
import '@formatjs/intl-datetimeformat/polyfill';

import '@formatjs/intl-pluralrules/locale-data/en';
import '@formatjs/intl-pluralrules/locale-data/es';
import '@formatjs/intl-pluralrules/locale-data/de';
import '@formatjs/intl-pluralrules/locale-data/ja';
import '@formatjs/intl-pluralrules/locale-data/ar';

import '@formatjs/intl-numberformat/locale-data/en';
import '@formatjs/intl-numberformat/locale-data/en-GB';
import '@formatjs/intl-numberformat/locale-data/en-CA';
import '@formatjs/intl-numberformat/locale-data/es';
import '@formatjs/intl-numberformat/locale-data/de';
import '@formatjs/intl-numberformat/locale-data/ja';
import '@formatjs/intl-numberformat/locale-data/ar';

import '@formatjs/intl-datetimeformat/locale-data/en';
// Britain and Canada write a date differently from the United States,
// and this is what makes the difference reach the screen. Plural rules
// are the same for every English, so `intl-pluralrules` ships one `en`
// and needs no entry for either.
import '@formatjs/intl-datetimeformat/locale-data/en-GB';
import '@formatjs/intl-datetimeformat/locale-data/en-CA';
import '@formatjs/intl-datetimeformat/locale-data/es';
import '@formatjs/intl-datetimeformat/locale-data/de';
import '@formatjs/intl-datetimeformat/locale-data/ja';
import '@formatjs/intl-datetimeformat/locale-data/ar';

import '@formatjs/intl-datetimeformat/add-golden-tz';
