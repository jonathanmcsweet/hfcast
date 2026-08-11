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
import { cpus, homedir } from 'node:os';
import path from 'node:path';
import type { CentrePoint } from '../../../shared/correctMap.ts';
import type {
  WireCell,
  WireCoverage,
  WireCoveragePoint,
  WireMedians,
  WirePrediction,
} from '../../../shared/wire.ts';
import type { AntennaCard } from '../antenna.ts';
import { withEngineSlot } from '../limit.ts';
import {
  BAND_MHZ,
  type BandKey,
  BANDS_BY_FREQ,
  type OperatingWindow,
} from '../types.ts';
import type { ParsedPrediction, RawBandHour } from './parse.ts';
import { type AreaBounds, latShards } from './shard.ts';

export const PREDICT_BIN = process.env.HFCAST_PREDICT
  ?? path.join(homedir(), 'workspace/hfcast-engine/target/release/predict');

/** The coefficient and antenna tree the engine reads. */
export const ITSHFBC_DIR = process.env.HFCAST_ITSHFBC
  ?? path.join(homedir(), 'itshfbc');

/** A run times out well before any sensible HTTP client does. */
const RUN_TIMEOUT_MS = 30_000;

/**
 * How many processes a large area grid is split across.
 *
 * The engine is single-threaded, so a grid runs on one core however many
 * the host has. Measured on a 16-core host over the 34,560-point grid,
 * every count giving identical points:
 *
 * | strips | 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 |
 * | --- | --: | --: | --: | --: | --: | --: | --: | --: |
 * | ms | 1300 | 681 | 471 | 377 | 272 | 227 | 221 | 241 |
 *
 * Eight is where it stops paying: twelve is two percent better and
 * sixteen is worse, because each process re-reads the coefficient tables
 * and they start to contend. Capped at the core count as well, so a
 * small host does not oversubscribe itself.
 *
 * This is how one request is split, and it is not a limit on how many
 * requests split at once. It used to say that no caller sends a grid big
 * enough to split, which stopped being true when `/api/coverage/fine`
 * arrived: that route is public, it sends a 34,560-point grid, and ten
 * callers together forked eighty processes. The count of live processes
 * is bounded in `limit.ts` instead, which is where a host-wide limit
 * belongs.
 *
 * `HFCAST_COVERAGE_SHARDS=1` turns splitting off.
 */
export const COVERAGE_SHARDS = (() => {
  const asked = Number(process.env.HFCAST_COVERAGE_SHARDS);
  if (Number.isInteger(asked) && asked >= 1) return asked;
  return Math.max(1, Math.min(8, cpus().length));
})();

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
  /**
   * The operator's own antenna. Absent is the isotrope the binary
   * defaults to. Only this end is ever described: the far end belongs to
   * a station the server knows nothing about.
   */
  txAntenna?: AntennaCard;
}

/**
 * One run of the binary: JSON in on stdin, JSON out on stdout.
 *
 * A refused request still prints an object with an `error` field, which
 * carries a better message than the exit status, so a non-zero exit with
 * output is not treated as a failure until that field has been read.
 */
async function callPredict<T extends { error?: string; }>(
  payload: string,
): Promise<T> {
  // Behind the host's gate, so the number of live processes is bounded
  // whatever arrives. Every path into the engine comes through here, and
  // a strip of a split grid is one call like any other — see `limit.ts`.
  const stdout = await withEngineSlot(() =>
    new Promise<string>((resolve, reject) => {
      const child = execFile(
        PREDICT_BIN,
        [],
        { timeout: RUN_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
        (error, out, stderr) => {
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
    })
  );

  const parsed = readJson<T>(stdout);
  if (parsed.error !== undefined) {
    throw new Error(`predict refused the request: ${parsed.error}`);
  }
  return parsed;
}

/**
 * The binary's stdout as an object.
 *
 * A separate function so the caller can bind the result with `const`: the
 * failure has to become an error naming what was actually printed, since
 * "unexpected token" says nothing about a binary that crashed and wrote
 * a stack trace.
 */
function readJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `predict returned text that is not JSON: ${text.slice(0, 200)}`,
    );
  }
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

  const parsed = await callPredict<WirePrediction>(payload);

  const cells: RawBandHour[] = (parsed.cells ?? [])
    .map((cell) => ({ cell, band: byFreq.get(cell.freqMhz) }))
    // A frequency the request never asked for is dropped rather than
    // guessed at a band.
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

  // Zero for an hour the engine did not report, which is how the rest of
  // the server already reads a missing MUF.
  const reported = parsed.mufByHour ?? [];
  const mufByHour = Array.from(
    { length: 24 },
    (_, hour) => {
      const muf = reported[hour];
      return muf !== undefined && Number.isFinite(muf) ? muf : 0;
    },
  );

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

/**
 * The rectangle an area run covers, in degrees.
 *
 * Absent, the engine runs the whole world, which is what every caller did
 * before a rectangle could be asked for. Defined beside the splitting,
 * which is the other thing that has to know where the lattice falls, and
 * re-exported here because this is where callers reach for it.
 */
export type { AreaBounds };

export interface CoverageRequest {
  fromLat: number;
  fromLon: number;
  /** 1-12. */
  month: number;
  year: number;
  ssn: number;
  watts: number;
  requiredSnrDb: number;
  noiseDbw: number;
  /** UTC hour, 0-23. An area run covers one hour, not a day. */
  hour: number;
  band: BandKey;
  /** Cell size in degrees. */
  latStep: number;
  lonStep: number;
  /**
   * The operator's own antenna. A beam makes the map directional, which
   * is the point: it shows where the station can be heard, not where an
   * ideal one could.
   */
  txAntenna?: AntennaCard;
  /**
   * The region to cover. Absent means the whole world, which is what the
   * map behind everything else is drawn from.
   */
  bounds?: AreaBounds;
}

export interface Coverage extends Partial<AreaBounds> {
  band: BandKey;
  hour: number;
  latStep: number;
  lonStep: number;
  points: readonly WireCoveragePoint[];
}

/**
 * Where this band reaches, this hour, in every direction.
 *
 * One band per call. Asking the engine for several frequencies at once
 * makes it report the best of them at each point, which saturates the
 * whole map and answers a question nobody asked — the map exists to show
 * how the band the user selected differs from the others.
 */
export async function runCoverage(
  request: CoverageRequest,
  shards: number = COVERAGE_SHARDS,
): Promise<Coverage> {
  const { band, bounds, ...rest } = request;
  const ask = (over: AreaBounds | undefined) =>
    callPredict<WireCoverage>(JSON.stringify({
      ...rest,
      mode: 'area',
      freqMhz: BAND_MHZ[band],
      itshfbc: ITSHFBC_DIR,
      // All four edges together or none: the engine refuses a partial
      // rectangle rather than filling the rest in from the world.
      ...(over ?? {}),
    }));

  const strips = latShards(
    bounds,
    request.latStep,
    request.lonStep,
    shards,
  );
  // Concatenated south to north, which is the order one whole run emits
  // its rows in, so a split grid is the same sequence and not just the
  // same set.
  const parts = strips === null
    ? [await ask(bounds)]
    : await Promise.all(strips.map(ask));

  const first = parts[0] as WireCoverage;
  const last = parts[parts.length - 1] as WireCoverage;

  return {
    band,
    hour: request.hour,
    latStep: first.latStep ?? request.latStep,
    lonStep: first.lonStep ?? request.lonStep,
    // The engine snaps a rectangle to its own lattice, so what comes back
    // is the grid that ran rather than the one asked for. A whole-world
    // request reports no rectangle whether it was split or not: the
    // strips are this function's business, not its caller's.
    ...(bounds
      ? {
        latMin: first.latMin ?? bounds.latMin,
        latMax: last.latMax ?? bounds.latMax,
        lonMin: first.lonMin ?? bounds.lonMin,
        lonMax: first.lonMax ?? bounds.lonMax,
      }
      : {}),
    points: parts.flatMap((part) =>
      (part.points ?? []).map((p) => ({
        lat: p.lat,
        lon: p.lon,
        reliability: Math.min(1, Math.max(0, p.reliability)),
        takeoffAngleDeg: p.takeoffAngleDeg ?? null,
        // What the correction reads. Passed through as the engine gave
        // them; `shared/correctMap.ts` decides what an absent one means.
        snr: p.snr,
        snrLowDecile: p.snrLowDecile ?? null,
        snrUpDecile: p.snrUpDecile ?? null,
      }))
    ),
  };
}

/**
 * The middle of the day at every point of a lattice.
 *
 * The one thing the swing correction needs from the other 23 hours. The
 * engine walks all 24 in a single pass over the grid — see `dailyMedian`
 * in `hfcast-engine/src/service.rs` — which costs about 15 times one
 * hour rather than 24, because roughly two fifths of an area run does
 * not depend on the hour.
 *
 * One band per call, as `runCoverage` is, and split into the same
 * latitude strips so the processes are used the same way.
 */
export async function runDailyMedians(
  request: Omit<CoverageRequest, 'hour'>,
  shards: number = COVERAGE_SHARDS,
): Promise<DailyMedians> {
  const { band, bounds, ...rest } = request;
  const ask = (over: AreaBounds | undefined) =>
    callPredict<WireMedians>(JSON.stringify({
      ...rest,
      mode: 'area',
      dailyMedian: true,
      freqMhz: BAND_MHZ[band],
      itshfbc: ITSHFBC_DIR,
      ...(over ?? {}),
    }));

  const strips = latShards(bounds, request.latStep, request.lonStep, shards);
  const parts = strips === null
    ? [await ask(bounds)]
    : await Promise.all(strips.map(ask));

  const first = parts[0] as WireMedians;
  return {
    latStep: first.latStep ?? request.latStep,
    lonStep: first.lonStep ?? request.lonStep,
    points: parts.flatMap((part) =>
      (part.points ?? []).map((p) => ({
        lat: p.lat,
        lon: p.lon,
        // One band was asked for, so the engine answers with a number.
        medianSnr: typeof p.medianSnr === 'number' ? p.medianSnr : 0,
      }))
    ),
  };
}

/** A lattice of daily middles, as the correction reads it. */
export interface DailyMedians {
  latStep: number;
  lonStep: number;
  points: readonly CentrePoint[];
}
