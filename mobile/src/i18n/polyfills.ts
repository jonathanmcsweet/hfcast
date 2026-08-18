/**
 * Hermes ships a partial ICU. On Android in particular, `Intl.NumberFormat`
 * and `Intl.DateTimeFormat` may fall back to English formatting for
 * non-English locales, which quietly defeats the point of localising.
 *
 * These polyfills install a complete implementation and load locale data for
 * the languages we ship. Import this module once, before i18n initialises.
 *
 * Every path below ends in `.js`. The `@formatjs` packages declare their
 * entry points in an `exports` map, and the map lists the file names
 * themselves, so a path without the extension resolves to nothing.
 */
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-numberformat/polyfill.js';
import '@formatjs/intl-datetimeformat/polyfill.js';

import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/es.js';
import '@formatjs/intl-pluralrules/locale-data/de.js';
import '@formatjs/intl-pluralrules/locale-data/ja.js';
import '@formatjs/intl-pluralrules/locale-data/ar.js';

import '@formatjs/intl-numberformat/locale-data/en.js';
import '@formatjs/intl-numberformat/locale-data/en-GB.js';
import '@formatjs/intl-numberformat/locale-data/en-CA.js';
import '@formatjs/intl-numberformat/locale-data/es.js';
import '@formatjs/intl-numberformat/locale-data/de.js';
import '@formatjs/intl-numberformat/locale-data/ja.js';
import '@formatjs/intl-numberformat/locale-data/ar.js';

import '@formatjs/intl-datetimeformat/locale-data/en.js';
// Britain and Canada write a date differently from the United States,
// and this is what makes the difference reach the screen. Plural rules
// are the same for every English, so `intl-pluralrules` ships one `en`
// and needs no entry for either.
import '@formatjs/intl-datetimeformat/locale-data/en-GB.js';
import '@formatjs/intl-datetimeformat/locale-data/en-CA.js';
import '@formatjs/intl-datetimeformat/locale-data/es.js';
import '@formatjs/intl-datetimeformat/locale-data/de.js';
import '@formatjs/intl-datetimeformat/locale-data/ja.js';
import '@formatjs/intl-datetimeformat/locale-data/ar.js';

import '@formatjs/intl-datetimeformat/add-golden-tz.js';
