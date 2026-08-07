/**
 * What arrived is what was expected, checked rather than asserted.
 *
 * `getJson` used to end `return (await response.json()) as T`. A cast is a
 * claim about a value nobody looked at: the web build reads its server
 * over a network, and a response whose shape has moved — an older server,
 * a proxy answering with its own error page as 200, a field renamed on one
 * side — reached the screen as `undefined` fields rather than as a
 * failure. The forecast then draws with holes in it, which is worse than
 * the error screen, because the error screen says what happened and offers
 * to try again.
 *
 * Hand written rather than a schema library. What has to be checked is the
 * handful of fields the screen actually reads, the checks are a few lines
 * each, and a dependency here would be shipped to every device to do that.
 *
 * Only the shape is checked, never the values. Whether a reliability makes
 * sense is the engine's business and the correction's; whether it is a
 * number at all is this file's.
 */
import { ApiError } from './error.ts';

/** Thrown as an `ApiError` with status 0: nothing reached the caller. */
const bad = (where: string, saw: unknown): never => {
  const got = saw === null
    ? 'null'
    : Array.isArray(saw)
    ? 'an array'
    : typeof saw;
  throw new ApiError(`the answer is not a forecast: ${where} is ${got}`, 0);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const object = (value: unknown, where: string): Record<string, unknown> =>
  isObject(value) ? value : bad(where, value);

const array = (value: unknown, where: string): unknown[] =>
  Array.isArray(value) ? value : bad(where, value);

const number = (value: unknown, where: string): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : bad(where, value);

const text = (value: unknown, where: string): string =>
  typeof value === 'string' ? value : bad(where, value);

/**
 * A field that may be absent.
 *
 * Null and undefined are both "not here". The server writes null and an
 * older one may write neither, and the app reads both as absent already.
 */
const maybe = <T>(
  value: unknown,
  where: string,
  check: (value: unknown, where: string) => T,
): T | null =>
  value === null || value === undefined ? null : check(value, where);

/** An endpoint: the place a forecast is about. */
function endpoint(value: unknown, where: string): void {
  const it = object(value, where);
  text(it.grid, `${where}.grid`);
  text(it.label, `${where}.label`);
  number(it.lat, `${where}.lat`);
  number(it.lon, `${where}.lon`);
}

/**
 * The forecast the whole screen is drawn from.
 *
 * `cells` is the field that matters most: empty or absent, every band
 * reads as closed, which is a real answer for a very long path and would
 * be indistinguishable from a broken response.
 */
function prediction(value: unknown, where: string): void {
  const it = object(value, where);
  endpoint(it.from, `${where}.from`);
  // Null for a survey, which has no far end. The three path fields are
  // null together — see `PathPrediction`.
  if (it.to !== null && it.to !== undefined) endpoint(it.to, `${where}.to`);
  number(it.ssn, `${where}.ssn`);
  number(it.requiredSnrDb, `${where}.requiredSnrDb`);
  text(it.basis, `${where}.basis`);
  array(it.mufByHour, `${where}.mufByHour`);

  const cells = array(it.cells, `${where}.cells`);
  if (cells.length === 0) {
    throw new ApiError('the forecast came back with no bands in it', 0);
  }
  // The first only. Every cell comes from one loop on the far side, so a
  // shape fault is in all of them or in none, and checking 216 of them on
  // every answer would cost more than it could ever find.
  const first = object(cells[0], `${where}.cells[0]`);
  text(first.band, `${where}.cells[0].band`);
  number(first.hour, `${where}.cells[0].hour`);
  number(first.reliability, `${where}.cells[0].reliability`);
}

function spaceWeather(value: unknown, where: string): void {
  const it = object(value, where);
  number(it.f107, `${where}.f107`);
  number(it.kp, `${where}.kp`);
  number(it.kpMax24h, `${where}.kpMax24h`);
  number(it.effectiveSsn, `${where}.effectiveSsn`);
  text(it.observedAt, `${where}.observedAt`);
}

/** `/api/prediction` and `/api/survey`. */
export function checkPredictionResponse<T>(value: unknown): T {
  const it = object(value, 'the response');
  prediction(it.prediction, 'the forecast');
  maybe(it.spaceWeather, 'the readings', (v, w) => {
    spaceWeather(v, w);
    return v;
  });
  return value as T;
}

/** `/api/spaceweather`, which has no forecast around it. */
export function checkSpaceWeather<T>(value: unknown): T {
  spaceWeather(value, 'the readings');
  return value as T;
}

/**
 * A coverage grid, coarse or fine.
 *
 * The steps are what place every cell on the map, so a missing one draws
 * a correct answer in the wrong place — which looks like the model being
 * wrong about the world rather than like a fault.
 */
export function checkCoverage<T>(value: unknown): T {
  const it = object(value, 'the map');
  text(it.band, 'the map band');
  number(it.hour, 'the map hour');
  number(it.latStep, 'the map latitude step');
  number(it.lonStep, 'the map longitude step');
  const points = array(it.points, 'the map points');
  if (points.length === 0) {
    throw new ApiError('the map came back with no points in it', 0);
  }
  const first = object(points[0], 'the first map point');
  number(first.lat, 'the first map point latitude');
  number(first.lon, 'the first map point longitude');
  number(first.reliability, 'the first map point reliability');
  return value as T;
}

/**
 * A patch, or null.
 *
 * Null is an ordinary answer — a station near the antimeridian has no
 * rectangle to run — so it passes rather than failing.
 */
export function checkCoveragePatch<T>(value: unknown): T {
  if (value === null || value === undefined) return null as T;
  return checkCoverage<T>(value);
}
