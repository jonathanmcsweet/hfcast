import { MIN_CARD_FREQ_MHZ } from '../../../shared/bands.ts';
import { bearingDeg, distanceKm } from '../../../shared/geo.ts';
import type { WireCell, WirePrediction } from '../../../shared/wire.ts';
import * as Engine from '../../modules/engine-bridge';
import type { EngineModel } from '../store/useSettingsStore';
import { type Station, usesBeam } from '../store/useStationStore';
import { antennaOnDisk } from './antennaFile';
import { correctCells, factorsFor, type RawBandHour } from './correct';
import { requiredSnrFor } from './modes';
import { ssnForMonth } from './ssn';
import {
  BAND_MHZ,
  BAND_ORDER,
  type BandKey,
  type Endpoint,
  type PathPrediction,
  type PredictionBasis,
} from './types';

/**
 * A forecast computed on the device, with no server and no network.
 *
 * Mirrors `server/src/predict.ts`: build the engine's request, take its
 * cells, apply the same corrections, assemble the same `PathPrediction`.
 * The engine underneath is the same code — the server reaches it as a
 * binary over a pipe, this as the library compiled into the APK — so the
 * numbers agree by construction, not by two implementations kept in step.
 *
 * The sunspot number comes from one of two places: online, the effective
 * SSN derived from current conditions, which makes it a now-cast; offline,
 * the monthly figure from `ssn.ts`, which is what makes a forecast
 * possible with no network and is also its main limitation.
 */

/** Man-made noise at a residential site, dBW in 1 Hz. VOACAP's own default. */
const NOISE_DBW = -145;

/**
 * The engine takes an antenna as a file and the app describes one by
 * height, gain and bearing, so the definition is written to the directory
 * the native module offers — the same `.voa` text the server generates.
 *
 * Here rather than shared with the server, because the server writes into
 * an `itshfbc` tree it owns and this writes one file into a cache the
 * operating system may empty at any time.
 */
export interface EngineAntenna {
  file: string;
  beamDeg: number;
  /**
   * The lowest frequency this card serves, in whole MHz. Without it the
   * engine's 2 MHz default leaves 160m, at 1.84, with no antenna at all.
   * See `MIN_CARD_FREQ_MHZ`.
   */
  minFreq: number;
}

/** Exactly 24 entries, with anything unusable read as absent. */
const hours = (values: readonly (number | null)[] | undefined) =>
  Array.from({ length: 24 }, (_, hour) => {
    const value = values?.[hour];
    return value !== null && value !== undefined && Number.isFinite(value)
      ? value
      : null;
  });

export const canPredictLocally = (): boolean => Engine.isAvailable();

/**
 * Current conditions, when the device has them.
 *
 * The engine takes one sunspot number and no notion of a storm, so this
 * is how live readings reach it: the effective SSN replaces the month's
 * figure, and the recent Kp widens the spread the corrections apply.
 * Absent is a climatology run, which is what an offline device does.
 */
export interface Nowcast {
  effectiveSsn: number;
  kpMax24h: number;
}

/**
 * The sunspot number a run should use, and the label for where it came from.
 *
 * Mirrors `resolveSsn` on the server, including the rule that a now-cast
 * keeps its label even though the number is no longer a monthly figure.
 */
export function ssnFor(
  year: number,
  month: number,
  nowcast: Nowcast | undefined,
): { ssn: number; basis: PredictionBasis; } {
  if (nowcast) return { ssn: nowcast.effectiveSsn, basis: 'nowcast' };
  return ssnForMonth(year, month);
}

export interface LocalRequest {
  from: Endpoint;
  to: Endpoint;
  date: Date;
  station: Station;
  /** Absent offline, and then the run is climatology. */
  nowcast?: Nowcast | undefined;
  /** Which model answers. Absent runs the classic engine unchanged. */
  engine?: EngineModel | undefined;
}

/**
 * The request fields that pick the model.
 *
 * The classic choice sends the sunspot number as it always has. The new
 * model names itself and the calendar day: a live effective index
 * conditions the run, and without one the engine derives its own from
 * the day-of-year correction — the offline form, measured to beat the
 * classic run with no network (engine repository, `docs/offline.md`).
 * Exclusive, because the engine refuses `ssn` beside `engine:"truecast"`.
 */
export function engineFields(
  engine: EngineModel | undefined,
  date: Date,
  ssn: number,
  nowcast: Nowcast | undefined,
): Record<string, unknown> {
  if (engine !== 'truecast') return { ssn };
  return {
    engine: 'truecast',
    day: date.getUTCDate(),
    ...(nowcast ? { essn: nowcast.effectiveSsn } : {}),
  };
}

/**
 * Where the engine reads its data, and which antenna it transmits from.
 *
 * The path forecast and the coverage map need exactly this pair, and one
 * place means a map and a forecast cannot describe different antennas.
 *
 * The antenna file is written on every run rather than cached: a few
 * hundred bytes, a cache directory the system may empty at any moment,
 * and a missing file fails the run rather than falling back.
 */
export async function engineStation(station: Station): Promise<{
  itshfbc: string;
  txAntenna?: EngineAntenna;
}> {
  const onDisk = antennaOnDisk(station.antenna);
  // An isotropic station names no file, so the coefficients are all the
  // engine needs, and they are inside the library.
  if (onDisk === null) return { itshfbc: Engine.EMBEDDED };
  await Engine.writeFile(onDisk.path, onDisk.text);
  return {
    itshfbc: Engine.overlayRoot(Engine.scratchDirectory()),
    txAntenna: {
      file: onDisk.file,
      // Only families whose pattern depends on azimuth carry a bearing,
      // as on the server: a vertical measures 0 dB round the compass.
      beamDeg: usesBeam(station.antenna.type) ? station.antenna.beamDeg : 0,
      minFreq: MIN_CARD_FREQ_MHZ,
    },
  };
}

export async function predictLocally(
  request: LocalRequest,
): Promise<PathPrediction> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  const { ssn, basis } = ssnFor(year, month, request.nowcast);
  const station = await engineStation(request.station);
  const requiredSnrDb = requiredSnrFor(request.station.mode);

  const bands: readonly BandKey[] = BAND_ORDER;
  const byFreq = new Map<number, BandKey>(
    bands.map((band) => [BAND_MHZ[band], band]),
  );

  const answer = await Engine.predict<WirePrediction>({
    ...station,
    fromLat: request.from.lat,
    fromLon: request.from.lon,
    toLat: request.to.lat,
    toLon: request.to.lon,
    fromLabel: request.from.label,
    toLabel: request.to.label,
    month,
    year,
    ...engineFields(request.engine, request.date, ssn, request.nowcast),
    watts: request.station.watts,
    requiredSnrDb,
    noiseDbw: NOISE_DBW,
    bands: bands.map((band) => BAND_MHZ[band]),
  });

  const raw: RawBandHour[] = (answer.cells ?? [])
    .map((cell) => ({ cell, band: byFreq.get(cell.freqMhz) }))
    // A frequency nothing asked for is dropped rather than guessed at a band.
    .filter((row): row is { cell: WireCell; band: BandKey; } =>
      row.band !== undefined
    )
    .map(({ cell, band }) => ({
      hour: cell.hour,
      band,
      reliability: Math.min(1, Math.max(0, cell.reliability)),
      snr: cell.snr,
      snrLowDecile: cell.snrLowDecile,
      snrUpDecile: cell.snrUpDecile,
      takeoffAngleDeg: cell.takeoffAngleDeg,
    }));

  if (raw.length === 0) throw new Error('the engine produced no usable rows');

  // The same correction the server applies, from the same module. With no
  // now-cast the Kp is unknown, so no storm widening is added rather than a
  // guessed amount: the factors were fitted on quiet conditions and that is
  // the honest default.
  const cells = correctCells(
    raw,
    requiredSnrDb,
    factorsFor(request.nowcast?.kpMax24h ?? null),
  );

  const reported = answer.mufByHour ?? [];
  return {
    from: request.from,
    to: request.to,
    distanceKm: distanceKm(
      request.from.lat,
      request.from.lon,
      request.to.lat,
      request.to.lon,
    ),
    bearingDeg: bearingDeg(
      request.from.lat,
      request.from.lon,
      request.to.lat,
      request.to.lon,
    ),
    ssn,
    requiredSnrDb,
    basis,
    month,
    year,
    date: request.date.toISOString().slice(0, 10),
    mufByHour: Array.from({ length: 24 }, (_, hour) => {
      const muf = reported[hour];
      return muf !== undefined && Number.isFinite(muf) ? muf : 0;
    }),
    window: answer.fotByHour === undefined && answer.hpfByHour === undefined
        && answer.lufByHour === undefined
      ? null
      : {
        fotByHour: hours(answer.fotByHour),
        hpfByHour: hours(answer.hpfByHour),
        lufByHour: hours(answer.lufByHour),
      },
    cells,
  };
}
