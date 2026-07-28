/**
 * Runs the Rust engine.
 *
 * `hfcast-engine`'s `predict` binary is a port of VOACAP proven byte-identical to
 * the Fortran reference. It reads one request as JSON on stdin and writes the
 * prediction as JSON on stdout, so this needs no bindings and no build step
 * beyond having the binary on disk.
 *
 * What this replaces: writing a fixed-width card deck, running `voacapl`,
 * parsing its printed listing, and giving every concurrent run its own copy of
 * the `itshfbc` tree because the Fortran names its scratch files from a global
 * counter. None of that applies here — the engine holds no global state, so
 * runs are independent and the tree is read-only.
 *
 * The values are the same numbers the listing carried: the binary renders the
 * listing and reads it back, so reliability still arrives at two decimals and
 * SNR to the nearest dB. `hfcast-engine/src/bin/predict.rs` says why, and
 * `paritycheck` proves it over the request shapes this server sends.
 */
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  BAND_MHZ,
  type BandKey,
  BANDS_BY_FREQ,
  type OperatingWindow,
} from '../types.ts';
import type { ParsedPrediction, RawBandHour } from './parse.ts';

export const PREDICT_BIN = process.env.HFCAST_PREDICT
  ?? path.join(homedir(), 'workspace/hfcast-engine/target/release/predict');

/** The coefficient and antenna tree the engine reads. */
export const ITSHFBC_DIR = process.env.HFCAST_ITSHFBC
  ?? path.join(homedir(), 'itshfbc');

/** A run times out well before any sensible HTTP client does. */
const RUN_TIMEOUT_MS = 30_000;

export interface EngineRequest {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  fromLabel: string;
  toLabel: string;
  /** 1-12. */
  month: number;
  year: number;
  ssn: number;
  /** Transmit power in watts. */
  watts: number;
  requiredSnrDb: number;
  /** Man-made noise at 3 MHz, as a positive number of dBW below zero. */
  noiseDbw: number;
  bands?: readonly BandKey[];
}

/** One cell as the binary emits it, before it is labelled with its band. */
interface WireCell {
  hour: number;
  freqMhz: number;
  reliability: number;
  snr: number;
  snrLowDecile: number | null;
  snrUpDecile: number | null;
  takeoffAngleDeg: number | null;
}

interface WirePrediction {
  mufByHour?: number[];
  fotByHour?: (number | null)[];
  hpfByHour?: (number | null)[];
  lufByHour?: (number | null)[];
  cells?: WireCell[];
  error?: string;
}

/**
 * Runs one prediction.
 *
 * The bands are sent as frequencies and come back the same way, so the
 * mapping from a returned cell to a band is by frequency rather than by
 * position — a cell the engine dropped does not shift the ones after it.
 *
 * Looking a float up in a Map is exact equality, which is safe here only
 * because the number makes a round trip and no arithmetic: the same
 * double is sent as JSON, printed back by Rust with the shortest text
 * that reads as that double, and parsed here into the same double again.
 * Rounding on either side — the binary printing a fixed number of
 * decimals, or the server deriving a frequency rather than echoing the
 * one it sent — would break the lookup, and every cell would be dropped
 * rather than misplaced.
 */
export async function runEngine(
  request: EngineRequest,
): Promise<ParsedPrediction> {
  const bands = request.bands ?? BANDS_BY_FREQ;
  const byFreq = new Map<number, BandKey>(
    bands.map((band) => [BAND_MHZ[band], band]),
  );

  const payload = JSON.stringify({
    ...request,
    bands: bands.map((band) => BAND_MHZ[band]),
    itshfbc: ITSHFBC_DIR,
  });

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      PREDICT_BIN,
      [],
      { timeout: RUN_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, out, stderr) => {
        // A refused request still prints JSON with an error field, which
        // carries a better message than the exit status does.
        if (error && !out) {
          reject(
            new Error(`predict failed: ${stderr.trim() || error.message}`),
          );
          return;
        }
        resolve(out);
      },
    );
    child.stdin?.end(payload);
  });

  let parsed: WirePrediction;
  try {
    parsed = JSON.parse(stdout) as WirePrediction;
  } catch {
    throw new Error(
      `predict returned text that is not JSON: ${stdout.slice(0, 200)}`,
    );
  }
  if (parsed.error !== undefined) {
    throw new Error(`predict refused the request: ${parsed.error}`);
  }

  const cells: RawBandHour[] = [];
  for (const cell of parsed.cells ?? []) {
    const band = byFreq.get(cell.freqMhz);
    if (band === undefined) continue;
    cells.push({
      hour: cell.hour,
      band,
      reliability: Math.min(1, Math.max(0, cell.reliability)),
      snr: cell.snr,
      snrLowDecile: cell.snrLowDecile,
      snrUpDecile: cell.snrUpDecile,
      takeoffAngleDeg: cell.takeoffAngleDeg,
    });
  }

  const mufByHour = Array<number>(24).fill(0);
  (parsed.mufByHour ?? []).forEach((muf, hour) => {
    if (hour < 24 && Number.isFinite(muf)) mufByHour[hour] = muf;
  });

  return { mufByHour, cells, window: windowOf(parsed) };
}

/**
 * The operating window, or null if the binary did not send one.
 *
 * Absent rather than empty when the fields are missing, so an older
 * `predict` build reads as "this engine has no window" instead of as 24
 * hours during which nothing worked. The two look identical once the
 * arrays exist, and only one of them is true.
 */
function windowOf(parsed: WirePrediction): OperatingWindow | null {
  const { fotByHour, hpfByHour, lufByHour } = parsed;
  if (
    fotByHour === undefined && hpfByHour === undefined
    && lufByHour === undefined
  ) {
    return null;
  }
  return {
    fotByHour: hours(fotByHour),
    hpfByHour: hours(hpfByHour),
    lufByHour: hours(lufByHour),
  };
}

/** Exactly 24 entries, with anything unusable read as absent. */
function hours(values: readonly (number | null)[] | undefined) {
  const out = Array<number | null>(24).fill(null);
  (values ?? []).forEach((value, hour) => {
    if (hour < 24 && value !== null && Number.isFinite(value)) {
      out[hour] = value;
    }
  });
  return out;
}
