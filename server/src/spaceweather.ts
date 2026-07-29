/**
 * Space weather from NOAA SWPC, and the sunspot numbers that drive a run.
 *
 * VOACAP is fitted against the twelve-month *smoothed* sunspot number, so it
 * cannot be handed today's raw sunspot count. Two numbers therefore matter:
 *
 *   - a smoothed SSN for the month being predicted, which is climatology
 *   - an *effective* SSN inferred from current conditions, which turns the
 *     model into a now-cast for the current hour
 *
 * The effective SSN here is an approximation, and callers must label it as one.
 */
import type { PredictionBasis, SpaceWeather } from './types.ts';

const SWPC = 'https://services.swpc.noaa.gov';
const FETCH_TIMEOUT_MS = 8000;

interface F107Record {
  time_tag: string;
  flux: number;
}

interface KpRecord {
  time_tag: string;
  Kp: number;
}

interface ObservedRecord {
  'time-tag': string;
  ssn: number;
  smoothed_ssn: number;
}

interface PredictedRecord {
  'time-tag': string;
  predicted_ssn: number;
}

/** SWPC uses -1 rather than null for "not computed yet". */
const MISSING = -1;
const isPresent = (v: number | undefined): v is number =>
  typeof v === 'number' && v > MISSING;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${SWPC}/${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`SWPC ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
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
  const effectiveSsn = Math.round(kpDerate(ssnFromF107(f107), kp));

  // The feed is one record per 3-hour block, oldest first: the current block
  // plus the eight before it cover the last 24 hours, matching the window
  // the storm-spread measurement used.
  const kpMax24h = kpList
    .slice(-9)
    .reduce((max, record) => Math.max(max, record.Kp), 0);

  return {
    f107,
    observedSsn: null,
    kp,
    kpMax24h,
    effectiveSsn,
    observedAt: latestFlux.time_tag,
  };
}

/**
 * The smoothed sunspot number to assume for a given month. Observed smoothed
 * values lag by about six months, so recent and future months fall back to
 * SWPC's predicted cycle.
 */
export async function ssnForMonth(
  year: number,
  month: number,
): Promise<{ ssn: number; predicted: boolean; }> {
  const tag = `${year}-${String(month).padStart(2, '0')}`;

  const [observed, predicted] = await Promise.all([
    getJson<ObservedRecord[]>(
      'json/solar-cycle/observed-solar-cycle-indices.json',
    ),
    getJson<PredictedRecord[]>('json/solar-cycle/predicted-solar-cycle.json'),
  ]);

  const seen = observed.find((r) => r['time-tag'] === tag);
  if (seen && isPresent(seen.smoothed_ssn)) {
    return { ssn: seen.smoothed_ssn, predicted: false };
  }

  const forecast = predicted.find((r) => r['time-tag'] === tag);
  if (forecast && isPresent(forecast.predicted_ssn)) {
    return { ssn: forecast.predicted_ssn, predicted: true };
  }

  // Beyond the published prediction window, hold the last known value rather
  // than inventing one.
  const lastPredicted = predicted[predicted.length - 1];
  if (lastPredicted && isPresent(lastPredicted.predicted_ssn)) {
    return { ssn: lastPredicted.predicted_ssn, predicted: true };
  }
  throw new Error(`no sunspot number available for ${tag}`);
}

/**
 * The sunspot number a run should use, and the label for where it came
 * from.
 *
 * An override means live readings: the caller already has an effective
 * SSN and says what to call it. Without one the month's own figure is
 * used, which is climatology when the month is past and a forecast when
 * it is not.
 *
 * Shared by the path prediction and the coverage map so the two cannot
 * label the same number differently.
 */
export async function resolveSsn(
  year: number,
  month: number,
  override: number | undefined,
  overrideBasis: PredictionBasis | undefined,
): Promise<{ ssn: number; basis: PredictionBasis; }> {
  if (override !== undefined) {
    return { ssn: override, basis: overrideBasis ?? 'nowcast' };
  }
  const resolved = await ssnForMonth(year, month);
  return {
    ssn: resolved.ssn,
    basis: resolved.predicted ? 'forecast' : 'climatology',
  };
}
