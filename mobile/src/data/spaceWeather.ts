import type { SpaceWeather } from './types';

/**
 * Current solar and geomagnetic conditions, fetched by the device itself.
 *
 * This mirrors `server/src/spaceweather.ts` the way `localPredict.ts` mirrors
 * the server's prediction: the same two SWPC feeds, the same two formulas, the
 * same rounding. The server still has its own copy because the web build has
 * no engine and reaches everything through it; a device with the engine
 * compiled in has no server to ask.
 *
 * NOAA publishes these without a key and without registration, which is what
 * makes fetching them from the app reasonable at all.
 *
 * What this is *for* is the now-cast. VOACAP is fitted against the twelve-month
 * smoothed sunspot number, so today's conditions cannot be handed to it
 * directly — they are converted into an effective SSN, which is the one number
 * the engine takes. Without it the device predicts from the bundled monthly
 * table, which is climatology and cannot see a solar storm.
 */

const SWPC = 'https://services.swpc.noaa.gov';

/**
 * How old a reading may be and still describe now.
 *
 * Twenty-four hours, because the number it carries is the highest K
 * index of the last twenty-four: past that it describes a window which
 * has entirely gone. The readings are kept on disk for a week so a
 * forecast survives losing the network, so without this a device with no
 * signal would drive today's map from last Tuesday's storm and present
 * it as current.
 *
 * Here rather than beside the query that applies it, so the help screen
 * can state the number without importing the whole query layer.
 */
export const NOWCAST_GOOD_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * Shorter than the ten seconds the prediction client allows. A forecast the
 * device can compute on its own is waiting on this, so a slow answer costs
 * more here than a missing one: the climatology forecast is drawn either way,
 * and the now-cast replaces it when it arrives.
 */
const FETCH_TIMEOUT_MS = 8000;

interface F107Record {
  time_tag: string;
  flux: number;
}

interface KpRecord {
  time_tag: string;
  Kp: number;
}

async function getJson<T>(path: string): Promise<T> {
  // AbortController rather than `AbortSignal.timeout`, which Hermes does not
  // have on the older of the two React Native versions this builds against.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${SWPC}/${path}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`SWPC ${path} returned ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invert the standard F10.7 to sunspot number relation
 *   F = 63.7 + 0.728 R + 0.00089 R^2
 * which is the fit VOACAP's own documentation uses in the other direction.
 */
export function ssnFromF107(f107: number): number {
  const a = 0.00089;
  const b = 0.728;
  const c = 63.7 - f107;
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return 0;
  return Math.max(0, (-b + Math.sqrt(discriminant)) / (2 * a));
}

/**
 * Geomagnetic activity depresses F2 layer critical frequencies, which VOACAP
 * has no direct input for. Reducing the effective SSN approximates the effect.
 * The model is quiet-geomagnetic, so nothing is applied below Kp 4.
 *
 * This is a heuristic, not a published relation. It must be presented as one.
 */
export function kpDerate(ssn: number, kp: number): number {
  if (kp <= 4) return ssn;
  const reduction = Math.min(0.5, (kp - 4) * 0.08);
  return Math.max(0, ssn * (1 - reduction));
}

export async function fetchSpaceWeather(): Promise<SpaceWeather> {
  const [f107List, kpList] = await Promise.all([
    getJson<F107Record[]>('json/f107_cm_flux.json'),
    getJson<KpRecord[]>('products/noaa-planetary-k-index.json'),
  ]);

  // The flux feed is newest first; the K index feed is oldest first.
  const latestFlux = f107List[0];
  const latestKp = kpList[kpList.length - 1];
  if (!latestFlux || !latestKp) {
    throw new Error('SWPC returned no current observations');
  }

  const f107 = latestFlux.flux;
  const kp = latestKp.Kp;

  // One record per 3-hour block, oldest first: the current block plus the
  // eight before it cover the last 24 hours, which is the window the storm
  // widening in `correct.ts` was fitted against.
  const kpMax24h = kpList
    .slice(-9)
    .reduce((max, record) => Math.max(max, record.Kp), 0);

  return {
    f107,
    // SWPC publishes an observed daily sunspot number in a third feed. The
    // card does not show it and nothing computes from it, so it is not
    // fetched — one less request on a phone's connection.
    observedSsn: null,
    kp,
    kpMax24h,
    effectiveSsn: Math.round(kpDerate(ssnFromF107(f107), kp)),
    observedAt: latestFlux.time_tag,
  };
}
