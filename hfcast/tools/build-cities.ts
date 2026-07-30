/**
 * Turns VOACAP's own `geocity` files into a place list the app can search
 * with no network.
 *
 * Run by hand when the source tree changes:
 *
 *     HFCAST_ITSHFBC=~/itshfbc node --experimental-strip-types \
 *       tools/build-cities.ts
 *
 * VOACAP has shipped a worldwide city list since long before this app existed,
 * because a prediction needs coordinates and its users had a place name. It is
 * exactly what an offline search wants, and it is the same provenance as the
 * coefficient files compiled into the engine: NTIA/ITS, a US Government work not
 * subject to copyright protection in the US. That is the category
 * `hfcast-engine/docs/licence.md` records as raising no question, unlike the
 * CCIR coefficients.
 *
 * The parse is anchored on the coordinates rather than on column numbers. Each
 * file rules its columns slightly differently — some carry a state, one a city
 * size — but every data row ends with `DD MM N  DDD MM E`, and every header row
 * fails to. So the regex decides what is data, and no file needs its own case.
 *
 * Coordinates are whole minutes in the source, about 1.8 km, so two decimal
 * places of degrees loses nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const ROOT = process.env.HFCAST_ITSHFBC ?? path.join(homedir(), 'itshfbc');
const OUT = 'src/assets/cities.json';

/**
 * Which files to read, and why these.
 *
 * Left out deliberately: `ciraf.geo` is 911 ITU test points named `#1 / 1.1`
 * rather than places; `military.geo` is US bases; `dxcc1.geo` is DXCC entities
 * keyed by prefix, whose coordinate is a country reference point and not a city;
 * `hflist*.geo` is broadcast transmitter sites; `ncdxf.geo` is the beacon
 * network. All are useful to somebody, and none is what a reader typing a place
 * name is looking for. `other.geo` says in its own header that it is a sample
 * showing how to write one of these files, and its first row is "Greg's House".
 *
 * `wrldwide.geo` comes last because it names no country — every row's nation
 * field is `WW` — so where it repeats a city the regional file's entry is the one
 * worth keeping. The order is load-bearing for that reason.
 */
const FILES: readonly string[] = [
  'africa.geo',
  'caribean.geo',
  'europe.geo',
  'fareast.geo',
  'namerica.geo',
  'oceanic.geo',
  'palau.geo',
  'samerica.geo',
  'westasia.geo',
  'wrldwide.geo',
];

/** `wrldwide.geo`'s placeholder for "no country given". */
const NO_NATION = 'WW';

/**
 * Cities the source still calls by an older name.
 *
 * These files date from around 2001, so a reader typing the name their own maps
 * use finds nothing. Each is displayed under the current name and stays
 * searchable under the old one, because an operator who has worked the place for
 * thirty years may well type that.
 *
 * Deliberately short and only where the rename is unambiguous. The list is not
 * complete and cannot be: this is a propagation program's city index, not a
 * gazetteer, and its country names are dated the same way.
 */
const RENAMED: ReadonlyMap<string, string> = new Map([
  ['Bombay', 'Mumbai'],
  ['Calcutta', 'Kolkata'],
  ['Madras', 'Chennai'],
  ['Bangalore', 'Bengaluru'],
  ['Poona', 'Pune'],
  ['Baroda', 'Vadodara'],
  ['Cawnpore', 'Kanpur'],
  ['Trivandrum', 'Thiruvananthapuram'],
  ['Dacca', 'Dhaka'],
  ['Rangoon', 'Yangon'],
  ['Leningrad', 'Saint Petersburg'],
  ['Kiev', 'Kyiv'],
  ['Salisbury', 'Harare'],
  // These two the source itself brackets with the current name, so renaming
  // them also lets the duplicate in `wrldwide.geo` be recognised as the same
  // city and dropped.
  ['Peking', 'Beijing'],
  ['Saigon', 'Ho Chi Minh City'],
]);

/**
 * How far apart two places of the same name have to be to be two places.
 *
 * Aberdeen in Scotland and Aberdeen in South Dakota are both wanted. Tokyo in
 * `fareast.geo` and Tokyo in `wrldwide.geo` are one city recorded twice, and the
 * two files round its coordinates differently, so an exact match will not catch
 * it. A degree and a half is wider than any such disagreement and far narrower
 * than the distance between two cities that merely share a name.
 */
const SAME_PLACE_DEG = 1.5;

/** `45 28 N   98 30 W` at the end of a row, with the name block before it. */
const COORDS =
  /\s(\d{1,3})\s+(\d{1,2})\s*([NS])\s+(\d{1,3})\s+(\d{1,2})\s*([EW])(?:\s|$)/;

interface Place {
  readonly name: string;
  readonly region: string;
  readonly lat: number;
  readonly lon: number;
  /** An older or bracketed name. Searchable, never displayed. Empty if none. */
  readonly alt: string;
}

const degrees = (deg: string, min: string, hemisphere: string): number => {
  const value = Number(deg) + Number(min) / 60;
  const signed = hemisphere === 'S' || hemisphere === 'W' ? -value : value;
  return Number(signed.toFixed(2));
};

/**
 * Source names are all capitals, which is shouting on a phone.
 *
 * Words that are not plain letters are left alone, and a short list of
 * abbreviations stays upper case. "MC" and "O'" prefixes are not special-cased:
 * getting "McAllen" right would need a dictionary, and "Mcallen" is legible.
 */
const KEEP_UPPER: ReadonlySet<string> = new Set([
  'DC',
  'USA',
  'UK',
  'UAE',
  'FYROM',
  'II',
  'III',
  'IV',
  'NW',
  'NE',
  'SW',
  'SE',
  'ST',
]);

const titleWord = (word: string): string => {
  if (KEEP_UPPER.has(word)) return word;
  // Brackets travel with the word, as in "(BEIJING)", so they are set aside and
  // put back rather than making the word unrecognisable as letters.
  const match = /^([("']*)([A-Za-z]*)([)"'.,]*)$/.exec(word);
  const open = match?.[1] ?? '';
  const letters = match?.[2] ?? '';
  const close = match?.[3] ?? '';
  if (letters === '') return word;
  if (KEEP_UPPER.has(letters)) return `${open}${letters}${close}`;
  if (!/^[A-Z]+$/.test(letters)) return word;
  return `${open}${letters[0]}${letters.slice(1).toLowerCase()}${close}`;
};

// Splits on spaces but also inside hyphenated and apostrophed names, so
// "PORT-AU-PRINCE" and "N'DJAMENA" both read correctly.
const titleCase = (text: string, word = titleWord): string =>
  text
    .split(' ')
    .map((part) =>
      part
        .split('-')
        .map((piece) => piece.split("'").map(word).join("'"))
        .join('-')
    )
    .join(' ');

/**
 * A region reads differently from a city: it is full of codes.
 *
 * "WA", "SD" and "USA" are how those are written, and "(SC)" marks a state
 * capital. So any short all-capitals word is left alone and only real words are
 * title-cased — per word, because a field like "(SC) IL" holds both.
 */
const regionCase = (text: string): string =>
  titleCase(
    text,
    (word) =>
      /^[A-Z]+$/.test(word) && word.length <= 3 ? word : titleWord(word),
  );

/** One source row, or null when the line is a header or unusable. */
function parseLine(line: string): Place | null {
  const match = COORDS.exec(line);
  if (match === null) return null;
  const [
    ,
    latDeg = '',
    latMin = '',
    ns = '',
    lonDeg = '',
    lonMin = '',
    ew = '',
  ] = match;
  const lat = degrees(latDeg, latMin, ns);
  const lon = degrees(lonDeg, lonMin, ew);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  // Everything before the coordinates is the name and its region. The city ends
  // at the first run of two or more spaces; what follows is the state, the
  // nation, or both, which the source separates the same way.
  const parts = line
    .slice(0, match.index)
    .trimEnd()
    .split(/\s{2,}/)
    .filter((part) => part !== '');
  const head = parts[0]?.trim();
  if (head === undefined || head === '') return null;

  // "SAIGON (HO CHI MINH)" is one place under two names. Both are worth
  // searching, so the bracketed one becomes an alternate.
  const labelled = titleCase(head);
  const bracketed = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(labelled);
  const listed = bracketed?.[1]?.trim() ?? labelled;
  const bracketAlt = bracketed?.[2]?.trim() ?? '';
  if (listed === '') return null;

  // A city the source still calls by its older name is shown under the current
  // one, and the older one stays searchable.
  const current = RENAMED.get(listed);
  const name = current ?? listed;
  const alt = current === undefined ? bracketAlt : listed;

  // Braces mark a country within a country, as in `{SCOTLAND}`.
  const region = parts
    .slice(1)
    .map((part) => part.replace(/[{}]/g, '').trim())
    .filter((part) => part !== '' && part !== NO_NATION)
    .map(regionCase)
    .join(', ');

  return { name, region, lat, lon, alt };
}

const readFile = (file: string): readonly Place[] =>
  readFileSync(path.join(ROOT, 'geocity', file), 'latin1')
    .split('\n')
    .map((raw) => parseLine(raw.replace(/\r$/, '')))
    .filter((place): place is Place => place !== null);

/**
 * One city recorded in two files is one city.
 *
 * Grouped by name first, so the distance test only compares places that could be
 * confused and each comparison runs over a handful of entries rather than four
 * thousand. Within a group the earlier row wins, which by `FILES` order is the
 * regional file's.
 *
 * A place is dropped when anything earlier in its group is near it. Comparing
 * against every earlier row rather than only against the kept ones could differ,
 * where three places of one name form a chain — it does not here, checked by
 * running both over the whole source and diffing the result. A filter says it
 * more plainly than a fold, and a fold would need either an accumulating spread
 * or a mutable accumulator.
 */
const near = (a: Place, b: Place): boolean =>
  Math.abs(a.lat - b.lat) < SAME_PLACE_DEG
  && Math.abs(a.lon - b.lon) < SAME_PLACE_DEG;

const dedupe = (places: readonly Place[]): readonly Place[] =>
  [...Map.groupBy(places, (place) => place.name.toLowerCase()).values()]
    .flatMap((group) =>
      group.filter((place, index) =>
        !group.slice(0, index).some((earlier) => near(earlier, place))
      )
    );

const parsed = FILES.map((file) => ({ file, places: readFile(file) }));
const places = dedupe(parsed.flatMap(({ places: rows }) => rows));

// Alphabetical, so a prefix search can stop early and the results of a short
// query are stable rather than in file order.
const sorted = [...places].sort((a, b) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0
);

// Regions are interned: 399 names across four thousand places, so an index
// costs a number where the string would cost twenty bytes.
const regions = [...new Set(sorted.map((place) => place.region))];
const regionIndex = new Map(regions.map((region, index) => [region, index]));

const out = {
  source: 'VOACAP itshfbc/geocity (NTIA/ITS, US Government work)',
  note:
    'cities: [name, index into regions, latitude, longitude, alternate name if any]',
  regions,
  cities: sorted.map((place) => {
    const head = [
      place.name,
      regionIndex.get(place.region) ?? 0,
      place.lat,
      place.lon,
    ];
    // The alternate is left off entirely when there is none, so the common row
    // stays four entries long.
    return place.alt === '' ? head : [...head, place.alt];
  }),
};

const json = JSON.stringify(out);
writeFileSync(OUT, json);

for (const { file, places: rows } of parsed) {
  console.log(`${file}: ${rows.length}`);
}
console.log(
  `${OUT}: ${out.cities.length} places, ${regions.length} regions, ${
    (json.length / 1024).toFixed(0)
  } KB`,
);
