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
import { feature } from 'topojson-client';
import countriesTopology from 'world-atlas/countries-50m.json' with {
  type: 'json',
};

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
// Not "ST": the source writes Saint that way, so keeping it upper gave "ST
// Helena" and "ST Moritz" across 47 names. It title-cases to "St", which is how
// those are written.
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
]);

const titleWord = (word: string): string => {
  if (KEEP_UPPER.has(word)) return word;
  // Brackets travel with the word, as in "(BEIJING)", so they are set aside and
  // put back rather than making the word unrecognisable as letters. Matched by
  // Unicode letter rather than A-Z, because the source holds "BORLÄNGE" and
  // "JYVÄSKYLÄ" and an ASCII test leaves those shouting.
  const match = /^([^\p{L}]*)(\p{L}*)([^\p{L}]*)$/u.exec(word);
  const open = match?.[1] ?? '';
  const letters = match?.[2] ?? '';
  const close = match?.[3] ?? '';
  if (letters === '') return word;
  if (KEEP_UPPER.has(letters)) return `${open}${letters}${close}`;
  // Only reshape a word that is entirely upper case. A word with no case at all,
  // such as one in a non-cased script, is left exactly as written.
  const upper = letters.toUpperCase();
  if (letters !== upper || upper === letters.toLowerCase()) return word;
  return `${open}${letters[0]}${letters.slice(1).toLowerCase()}${close}`;
};

/**
 * Every separator a name in these files uses between words.
 *
 * "PORT-AU-PRINCE", "N'DJAMENA", "N.IRELAND", "FRANKFURT/MAIN" and
 * "MARTINIQUE,LESSER ANTILLES" all have to break into words, and every
 * separator has to come back where it was. Captured by the split so the
 * separators stay in the array rather than being reassembled by guesswork.
 */
const SEPARATORS = /([ \-.,/'])/;

/**
 * Title-cases each word, leaving separators alone.
 *
 * A one-letter word straight after an apostrophe is a possessive, so "GEORGE'S"
 * reads as "George's". "O'BRIEN" keeps its capital because there the one-letter
 * piece is before the apostrophe, not after it.
 */
const titleCase = (text: string, word = titleWord): string =>
  text
    .split(SEPARATORS)
    .map((token, index, tokens) => {
      if (SEPARATORS.test(token) && token.length === 1) return token;
      const cased = word(token);
      return tokens[index - 1] === "'" && cased.length === 1
        ? cased.toLowerCase()
        : cased;
    })
    .join('');

/**
 * A sub-national region reads differently from a city: it is full of codes.
 *
 * "WA", "SD" and "GTO" are how those are written, and "(SC)" marks a state
 * capital, so a short all-capitals word is left alone — per word, because a
 * field like "(SC) IL" holds both a marker and a code.
 *
 * This is applied only to the parts before the country. Applying it to a country
 * as well is what produced "SRI Lanka", "NEW Zealand" and "SAN Marino": those are
 * words, not codes, and they happen to be three letters. Countries now come from
 * `countryAt` instead, which sidesteps the question.
 */
const regionCase = (text: string): string =>
  titleCase(
    text,
    (word) =>
      /^[A-Z]+$/.test(word) && word.length <= 3 ? word : titleWord(word),
  );

/**
 * The country a coordinate falls in, from Natural Earth.
 *
 * The source's own country field is thirty years out of date in places — Zaire,
 * Burma, Yugoslavia, South Yemen — carries misspellings that have been in the
 * files for decades (Columbia, Equador, Beligum, Keyna), and is simply absent
 * for the 223 cities that come from `wrldwide.geo`. A position does not go out
 * of date, so the country is derived from it instead.
 *
 * Natural Earth is public domain and already a dependency here, since the globe
 * draws its land outline. The lookup runs at build time only; the app ships the
 * answer.
 */
interface Ring {
  readonly points: readonly (readonly number[])[];
  readonly minLon: number;
  readonly maxLon: number;
  readonly minLat: number;
  readonly maxLat: number;
}

const boundsOf = (points: readonly (readonly number[])[]): Ring => ({
  points,
  minLon: Math.min(...points.map((p) => p[0] ?? 0)),
  maxLon: Math.max(...points.map((p) => p[0] ?? 0)),
  minLat: Math.min(...points.map((p) => p[1] ?? 0)),
  maxLat: Math.max(...points.map((p) => p[1] ?? 0)),
});

const countries: readonly { name: string; rings: readonly Ring[]; }[] =
  (feature(
    countriesTopology,
    countriesTopology.objects.countries,
  ) as unknown as {
    features: readonly {
      properties: { name: string; };
      geometry: { type: string; coordinates: readonly unknown[]; };
    }[];
  }).features.map((f) => ({
    name: f.properties.name,
    rings: (f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates as (readonly number[])[][]]
      : f.geometry.coordinates as (readonly number[])[][][])
      .flat()
      // Only the outer ring of each polygon. Holes are enclaves, and putting a
      // city in the enclosing country rather than in nothing is the better
      // failure at this resolution.
      .map((polygon) => boundsOf(polygon)),
  }));

/** Ray casting, the standard even-odd test. */
const inRing = (ring: Ring, lon: number, lat: number): boolean => {
  if (
    lon < ring.minLon || lon > ring.maxLon || lat < ring.minLat
    || lat > ring.maxLat
  ) {
    return false;
  }
  // A fold would have to thread the crossing parity through every edge, which
  // is exactly what this loop does and reads worse as a reduce.
  return ring.points.reduce((inside, point, index) => {
    const previous = ring.points[
      (index + ring.points.length - 1) % ring.points.length
    ] ?? point;
    const [x1 = 0, y1 = 0] = point;
    const [x2 = 0, y2 = 0] = previous;
    const crosses = y1 > lat !== y2 > lat
      && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1;
    return crosses ? !inside : inside;
  }, false);
};

/**
 * How far outside every border a place may sit and still be placed.
 *
 * A coastline at this resolution cuts corners, so a port can land just off its
 * own country. Two degrees is about 200 km, wide enough to cover that and narrow
 * enough that a mid-ocean point stays unplaced rather than being awarded to
 * whichever continent is least far away.
 */
const NEAR_BORDER_DEG = 2;

/** Squared distance to the nearest vertex of a ring, in degrees. */
const distanceToRing = (ring: Ring, lon: number, lat: number): number =>
  Math.min(
    ...ring.points.map((point) =>
      ((point[0] ?? 0) - lon) ** 2 + ((point[1] ?? 0) - lat) ** 2
    ),
  );

const countryAt = (lat: number, lon: number): string | null => {
  const containing = countries.find((country) =>
    country.rings.some((ring) => inRing(ring, lon, lat))
  );
  if (containing !== undefined) return containing.name;

  // Outside every border: take the nearest, if it is near enough.
  const nearest = countries
    .map((country) => ({
      name: country.name,
      distance: Math.min(
        ...country.rings.map((ring) => distanceToRing(ring, lon, lat)),
      ),
    }))
    .reduce(
      (best, candidate) =>
        candidate.distance < best.distance ? candidate : best,
      { name: '', distance: Number.POSITIVE_INFINITY },
    );
  return nearest.distance <= NEAR_BORDER_DEG ** 2 ? nearest.name : null;
};

/**
 * Where each file rules its columns.
 *
 * Every file carries a ruler line — `|======CITY========|=====NATION| ...` — and
 * the fields are fixed-width against it. Splitting on runs of two spaces instead
 * looks equivalent and is not: the source writes `ST  CROIX` and `ST  LUCIA`
 * with two spaces inside the name, which that shortcut tore into a city called
 * "ST" and a region called "Croix".
 *
 * The first column starts at the line's own start; every later one starts after
 * its bar.
 */
const columnsOf = (lines: readonly string[]): readonly number[] => {
  const ruler = lines.find((line) => line.startsWith('|'));
  if (ruler === undefined) return [];
  return [...ruler].flatMap((character, index) =>
    character === '|' ? [index] : []
  );
};

/**
 * The fields before the coordinates, cut on the ruler.
 *
 * Bounded by where the coordinates were found, because the columns after them
 * vary by file and none is a place name: `namerica.geo` ends with a city size
 * and `military.geo` with a branch of service.
 */
const fieldsOf = (
  line: string,
  bars: readonly number[],
  end: number,
): readonly string[] =>
  bars
    .slice(0, -1)
    .filter((bar) => bar < end)
    .map((bar, index) =>
      line.slice(index === 0 ? 0 : bar + 1, bars[index + 1]).trim()
    )
    // The coordinate match starts at the space before its digits, so the
    // latitude's own column can sit just inside `end`. Its shape excludes it.
    .filter((field) =>
      field !== '' && !/^\d{1,3}\s+\d{1,2}\s*[NSEW]$/.test(field)
    );

/**
 * Whether a row actually respects the ruler.
 *
 * The files are not internally consistent. `ST  CROIX` needs the ruler, because
 * two spaces inside the name defeat a whitespace split. `ABERDEEN {SCOTLAND}
 * UNITED KINGDOM` needs the whitespace split, because the brace runs straight
 * through the column boundary. A row obeys its ruler only if every boundary
 * lands on a space, so each row is cut the way it is written.
 */
const respectsRuler = (
  line: string,
  bars: readonly number[],
  end: number,
): boolean =>
  bars
    .filter((bar) => bar > 0 && bar < end)
    .every((bar) => bar >= line.length || line[bar] === ' ');

/** One source row, or null when the line is a header or unusable. */
function parseLine(line: string, bars: readonly number[]): Place | null {
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

  // Everything before the coordinates is the name and its region: the city in
  // the first column, then the state, the nation, or both. Cut on the ruler when
  // the file has one, and on runs of two spaces when it does not.
  const before = line.slice(0, match.index).trimEnd();
  const parts = bars.length > 1 && respectsRuler(line, bars, match.index)
    ? fieldsOf(line, bars, match.index)
    : before.split(/\s{2,}/).filter((part) => part !== '');
  // The source pads inside some names, as in `ST  CROIX`.
  // The source pads inside some names, and a brace can be left over from a
  // `{SCOTLAND}` that straddled its column.
  const head = parts[0]?.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
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
  const fields = parts
    .slice(1)
    .map((part) => part.replace(/[{}]/g, '').trim())
    .filter((part) => part !== '' && part !== NO_NATION);

  // The last field is the source's country and is replaced; everything before it
  // is the state or constituent country, which the source gets right and Natural
  // Earth does not carry. Where the position falls in no polygon — a small island
  // at this resolution — the source's own field is kept rather than dropping the
  // country entirely.
  const derived = countryAt(lat, lon);
  const subNational = fields.slice(0, -1).map(regionCase);
  const country = derived ?? regionCase(fields[fields.length - 1] ?? '');
  const region = [...subNational, country]
    .filter((part) => part !== '')
    .join(', ');

  return { name, region, lat, lon, alt };
}

const readFile = (file: string): readonly Place[] => {
  const lines = readFileSync(path.join(ROOT, 'geocity', file), 'latin1')
    .split('\n')
    .map((raw) => raw.replace(/\r$/, ''));
  const bars = columnsOf(lines);
  return lines
    .map((line) => parseLine(line, bars))
    .filter((place): place is Place => place !== null);
};

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
