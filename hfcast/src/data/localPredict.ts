import * as Engine from '../../modules/hfcast-engine';
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
} from './types';

/**
 * A forecast computed on the device, with no server and no network.
 *
 * This mirrors `server/src/predict.ts`: build the engine's request, take its
 * cells, apply the same empirical corrections, and assemble the same
 * `PathPrediction` the app already reads. The engine underneath is the same
 * code — the server reaches it through a binary over a pipe, this reaches the
 * library compiled into the APK — so the numbers agree by construction rather
 * than by two implementations being kept in step.
 *
 * What is not the same is the sunspot number. The server asks NOAA; here it
 * comes from the table in `ssn.ts`, which is what makes an offline forecast
 * possible at all and also its main limitation.
 */

/** Man-made noise at a residential site, dBW in 1 Hz. VOACAP's own default. */
const NOISE_DBW = -145;

/**
 * The engine takes an antenna as a file, and the app describes one by height,
 * gain and bearing. So the definition is written to the directory the native
 * module offers and the engine is pointed at it — the same `.voa` text the
 * server generates, by the same rules.
 *
 * Kept in this file rather than shared with the server because the server
 * writes into an `itshfbc` tree it owns, and this writes one file into a cache
 * the operating system may empty at any time.
 */
export interface EngineAntenna {
  file: string;
  beamDeg: number;
}

interface WireCell {
  freqMhz: number;
  hour: number;
  reliability: number;
  snr: number;
  snrLowDecile: number;
  snrUpDecile: number;
  takeoffAngleDeg: number;
}

interface WirePrediction {
  cells?: readonly WireCell[];
  mufByHour?: readonly number[];
  fotByHour?: readonly (number | null)[];
  hpfByHour?: readonly (number | null)[];
  lufByHour?: readonly (number | null)[];
}

/** Exactly 24 entries, with anything unusable read as absent. */
const hours = (values: readonly (number | null)[] | undefined) =>
  Array.from({ length: 24 }, (_, hour) => {
    const value = values?.[hour];
    return value !== null && value !== undefined && Number.isFinite(value)
      ? value
      : null;
  });

const distanceKm = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number => {
  const rad = Math.PI / 180;
  const dLat = (toLat - fromLat) * rad;
  const dLon = (toLon - fromLon) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(fromLat * rad) * Math.cos(toLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const bearingDeg = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number => {
  const rad = Math.PI / 180;
  const y = Math.sin((toLon - fromLon) * rad) * Math.cos(toLat * rad);
  const x = Math.cos(fromLat * rad) * Math.sin(toLat * rad)
    - Math.sin(fromLat * rad) * Math.cos(toLat * rad)
      * Math.cos((toLon - fromLon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
};

export const canPredictLocally = (): boolean => Engine.isAvailable();

export interface LocalRequest {
  from: Endpoint;
  to: Endpoint;
  date: Date;
  station: Station;
}

/**
 * Writes the station's antenna where the engine can read it.
 *
 * Null for an isotropic station, which names no file — the engine's own
 * default. Written on every prediction rather than cached: the file is a few
 * hundred bytes, the cache directory can be emptied by the system at any
 * moment, and a missing antenna file would fail the run rather than fall back
 * to something reasonable.
 */
async function antennaFor(station: Station): Promise<
  { antenna: EngineAntenna; scratchDir: string; } | null
> {
  const onDisk = antennaOnDisk(station.antenna);
  if (onDisk === null) return null;
  await Engine.writeFile(onDisk.path, onDisk.text);
  return {
    antenna: {
      file: onDisk.file,
      // Only the families whose pattern depends on azimuth carry a bearing,
      // as on the server: a vertical measured 0 dB over the whole compass.
      beamDeg: usesBeam(station.antenna.type) ? station.antenna.beamDeg : 0,
    },
    scratchDir: Engine.scratchDirectory(),
  };
}

export async function predictLocally(
  request: LocalRequest,
): Promise<PathPrediction> {
  const month = request.date.getUTCMonth() + 1;
  const year = request.date.getUTCFullYear();
  const { ssn, basis } = ssnForMonth(year, month);
  const withAntenna = await antennaFor(request.station);
  const requiredSnrDb = requiredSnrFor(request.station.mode);

  const bands: readonly BandKey[] = BAND_ORDER;
  const byFreq = new Map<number, BandKey>(
    bands.map((band) => [BAND_MHZ[band], band]),
  );

  const answer = await Engine.predict<WirePrediction>({
    // With no antenna file to read, the coefficients are all the engine
    // needs, and they are inside the library.
    itshfbc: withAntenna === null
      ? Engine.EMBEDDED
      : Engine.overlayRoot(withAntenna.scratchDir),
    fromLat: request.from.lat,
    fromLon: request.from.lon,
    toLat: request.to.lat,
    toLon: request.to.lon,
    fromLabel: request.from.label,
    toLabel: request.to.label,
    month,
    year,
    ssn,
    watts: request.station.watts,
    requiredSnrDb,
    noiseDbw: NOISE_DBW,
    bands: bands.map((band) => BAND_MHZ[band]),
    ...(withAntenna ? { txAntenna: withAntenna.antenna } : {}),
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

  // The same correction the server applies, from the same module. Kp is
  // unknown offline, so no storm widening is added rather than a guessed
  // amount: the factors were fitted on quiet conditions and that is the
  // honest default.
  const cells = correctCells(raw, requiredSnrDb, factorsFor(null));

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
