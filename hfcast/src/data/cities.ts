import table from '../assets/cities.json' with { type: 'json' };
// Extensions given because Node's own resolver reads these in the tests, where
// Metro's extensionless resolution is not in play. Metro accepts them.
import { latLonToGrid } from './grid.ts';
import type { Place } from './types.ts';

/**
 * Place search with no network.
 *
 * The list is VOACAP's own `geocity` files, built by `tools/build-cities.mjs`:
 * 4,064 places worldwide in 122 KB. VOACAP has carried it since long before this
 * app, for the same reason this app needs it — a prediction needs coordinates
 * and the operator has a place name.
 *
 * It is a list of cities, not a geocoder. A village is not in it, and neither is
 * a street. So this answers first and the network geocoder still answers for
 * anything it does not hold, which means the search works offline for the cases
 * that matter and keeps its reach when there is a network.
 */

interface Table {
  source: string;
  regions: readonly string[];
  /**
   * `[name, region index, latitude, longitude, alternate name if any]`.
   *
   * The alternate is what the source called the place before it was renamed —
   * Bombay for Mumbai, Leningrad for Saint Petersburg — or a second name it
   * carried in brackets. Searchable, but never displayed: the label is the
   * current name.
   */
  cities: readonly (readonly (string | number)[])[];
}

const data = table as unknown as Table;

/** Where the list came from, for the note under the search box. */
export const CITIES_SOURCE = data.source;
export const CITY_COUNT = data.cities.length;

const str = (value: string | number | undefined): string =>
  typeof value === 'string' ? value : '';
const num = (value: string | number | undefined): number =>
  typeof value === 'number' ? value : 0;

/**
 * How many results to return.
 *
 * The list is alphabetical, so a two-letter query matches hundreds. Cutting the
 * list keeps the search instant and the screen readable; a reader who does not
 * see what they wanted types another letter, which is the faster move anyway.
 */
const LIMIT = 40;

/**
 * Folds accents, so "Zurich" finds "Zürich" and "Bogota" finds "Bogotá".
 *
 * The source list is plain ASCII, but a reader with a French or Spanish keyboard
 * will type the accent, and refusing them would be a worse failure than not
 * folding at all.
 */
/** The combining marks NFD separates out: U+0300 to U+036F, the Latin block. */
const COMBINING_FIRST = 0x300;
const COMBINING_LAST = 0x36f;

// Dropped by code point rather than by regex. A character class of combining
// marks is genuinely ambiguous \u2014 the linter rejects one and asks for an
// alternation, which a range cannot be written as \u2014 and this also does not
// depend on how much of Unicode the engine's regex support covers.
const fold = (text: string): string =>
  [...text.normalize('NFD')]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < COMBINING_FIRST || code > COMBINING_LAST;
    })
    .join('')
    .toLowerCase();

const folded: readonly string[] = data.cities.map((city) => fold(str(city[0])));
/** The older or bracketed name, folded. Empty for most places. */
const foldedAlt: readonly string[] = data.cities.map((city) =>
  fold(str(city[4]))
);

const placeAt = (index: number): Place => {
  const city = data.cities[index] ?? [];
  const lat = num(city[2]);
  const lon = num(city[3]);
  const region = data.regions[num(city[1])] ?? '';
  // The region is one string here and `Place` has two fields for it. The
  // country is the last part, which is how the source writes it.
  const parts = region.split(', ');
  return {
    name: str(city[0]),
    country: parts.length > 1 ? (parts[parts.length - 1] ?? '') : region,
    admin1: parts.length > 1 ? parts.slice(0, -1).join(', ') : '',
    lat,
    lon,
    grid: latLonToGrid(lat, lon),
  };
};

/**
 * Places whose name begins with the query, then those that merely contain it.
 *
 * Prefix first because that is what a reader typing a name means: "york" should
 * offer York before New York, and both should appear.
 */
export function searchCities(query: string): Place[] {
  const needle = fold(query.trim());
  if (needle === '') return [];

  const prefix: number[] = [];
  const contains: number[] = [];
  // A single pass with an early exit. Kept as a loop rather than two filters
  // because it walks four thousand entries on every keystroke and stops as soon
  // as it has enough. The older name matches too, so "Bombay" finds Mumbai.
  for (let i = 0; i < folded.length; i += 1) {
    const name = folded[i] ?? '';
    const alt = foldedAlt[i] ?? '';
    if (name.startsWith(needle) || (alt !== '' && alt.startsWith(needle))) {
      prefix.push(i);
    } else if (name.includes(needle) || (alt !== '' && alt.includes(needle))) {
      contains.push(i);
    }
    if (prefix.length >= LIMIT) break;
  }

  return [...prefix, ...contains].slice(0, LIMIT).map(placeAt);
}
