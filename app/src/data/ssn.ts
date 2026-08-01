import table from './ssn.json' with { type: 'json' };

/**
 * The sunspot number a prediction is driven by, without a network.
 *
 * VOACAP is fitted against the *smoothed* sunspot number, so a live solar
 * flux figure cannot be passed through — the server converts one when it has
 * it. With no server at all there is nothing to convert and nothing to fetch,
 * and a prediction cannot be made at all: the SSN is not a refinement, it is
 * an input.
 *
 * So the monthly figures ship with the app. 3.5 KB covering 2020 to 2030,
 * from NOAA SWPC: observed twelve-month smoothed values where the smoothing
 * can be computed, and SWPC's own predictions after that. The same two
 * sources the server reads live, frozen at the date in the file.
 *
 * This is climatology about climatology, and it ages. What it cannot do is
 * follow a solar cycle that turns out stronger or weaker than predicted, so
 * the basis is reported and the app says which it used.
 */

interface Table {
  source: string;
  fetched: string;
  note: string;
  /** `[ssn, 'c' | 'f']` — see `note` in the file. */
  months: Record<string, readonly (number | string)[]>;
}

// Through `unknown` because TypeScript reads the JSON's arrays as
// `(string | number)[]` and cannot see that each has exactly two entries.
const data = table as unknown as Table;

const ssnOf = (entry: readonly (number | string)[]): number =>
  typeof entry[0] === 'number' ? entry[0] : 0;

const kindOf = (entry: readonly (number | string)[]): string =>
  typeof entry[1] === 'string' ? entry[1] : 'f';

/** The date the figures were taken from NOAA, for the disclaimer to name. */
export const SSN_TABLE_DATE = data.fetched;

const tags = Object.keys(data.months).sort();
const FIRST = tags[0] ?? '';
const LAST = tags[tags.length - 1] ?? '';

/**
 * How a figure was arrived at. The same three words the server uses, so a
 * card does not have to know which produced the forecast it is describing.
 *
 * `climatology` — an observed smoothed number for that month.
 * `forecast` — SWPC's prediction for a month not yet smoothed.
 */
export type SsnBasis = 'climatology' | 'forecast';

export interface MonthlySsn {
  ssn: number;
  basis: SsnBasis;
  /**
   * True when the month falls outside the table and the nearest end was used
   * instead. A solar minimum figure applied to a year the table never covered
   * is a guess, and saying so is the difference between a stale forecast and
   * a wrong one presented as current.
   */
  extrapolated: boolean;
}

const tagFor = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

export function ssnForMonth(year: number, month: number): MonthlySsn {
  const wanted = tagFor(year, month);
  const exact = data.months[wanted];
  if (exact !== undefined) {
    return {
      ssn: ssnOf(exact),
      basis: kindOf(exact) === 'c' ? 'climatology' : 'forecast',
      extrapolated: false,
    };
  }
  // Outside the table: the nearer end, marked. Clamping rather than
  // refusing, because a forecast from a slightly wrong sunspot number is
  // far more useful than no forecast, and the label carries the caveat.
  const nearest = wanted < FIRST ? FIRST : LAST;
  const entry = data.months[nearest];
  return {
    ssn: entry === undefined ? 0 : ssnOf(entry),
    basis: 'forecast',
    extrapolated: true,
  };
}

/** The range the table covers, for a message that says what is known. */
export const SSN_TABLE_RANGE = { first: FIRST, last: LAST } as const;
