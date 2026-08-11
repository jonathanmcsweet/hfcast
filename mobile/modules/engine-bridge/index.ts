import { requireOptionalNativeModule } from 'expo-modules-core';

import { fromBase64, toBase64 } from './base64.ts';

/**
 * The prediction engine, in the app.
 *
 * VOACAP compiled into the APK with its coefficient files, reached through the
 * same JSON interface the server uses, so a forecast needs no network at all.
 *
 * `requireOptionalNativeModule` because it is absent in three ordinary cases:
 * Expo Go cannot contain this project's native code, the web build has no
 * shared library to load, and iOS has no build of it yet. Callers ask
 * `isAvailable()` and fall back to the server.
 */

interface Native {
  /** A directory the app may write engine input files into. */
  scratchDirectory(): string;
  /** How many cores this device will schedule on. Absent from older builds. */
  cores?(): number;
  /**
   * Turns the timing lines on or off, on both sides of the boundary.
   * Absent from older builds of the module.
   */
  setTracing?(on: boolean): boolean;
  /** Writes one file under that directory and returns its full path. */
  writeFile(name: string, contents: string): Promise<string>;
  /** One request object as JSON, one answer object as JSON. */
  predict(request: string): Promise<string>;
  /**
   * A batch of requests as JSON, run across `threads`, answered in the
   * order they were given. Absent from older builds of the module.
   */
  predictMany?(requests: string[], threads: number): Promise<string[]>;
  /**
   * The stored maps, all four absent from older builds of the module.
   * Bytes cross as base64 — see `base64.ts` for why.
   */
  readMapCache?(name: string): Promise<string | null>;
  writeMapCache?(name: string, contents: string): Promise<number>;
  listMapCache?(): Promise<string>;
  removeMapCache?(names: string[]): Promise<number>;
  /** Whether a memory card is present, and where maps are kept. */
  mapCardAvailable?(): boolean;
  startBackgroundWork?(
    title: string,
    text: string,
    done: number,
    total: number,
    stopLabel: string,
  ): boolean;
  stopBackgroundWork?(): boolean;
  isCharging?(): boolean;
  addListener?(event: string, listener: () => void): { remove(): void; };
  setMapCardUse?(on: boolean): string;
}

const native = requireOptionalNativeModule<Native>('HfcastEngine');

export const isAvailable = (): boolean => native !== null;

/** The root that reads the coefficient files compiled into the library. */
export const EMBEDDED = '<embedded>';

/**
 * A data root that reads `dir` first and the compiled-in files after.
 *
 * The engine takes an antenna as a filename, and the app describes a station
 * by height, gain and bearing rather than by file — so it writes one small
 * file and points the engine at the directory holding it.
 */
export const overlayRoot = (dir: string): string => `${EMBEDDED}+${dir}`;

export function scratchDirectory(): string {
  if (native === null) throw new Error('The engine is not in this build');
  return native.scratchDirectory();
}

/**
 * Writes a file for the engine to read, relative to the scratch directory.
 *
 * The app writes exactly one kind of file: an antenna definition, because the
 * engine names an antenna by path and the app describes one by height, gain
 * and bearing.
 */
export async function writeFile(
  name: string,
  contents: string,
): Promise<string> {
  if (native === null) throw new Error('The engine is not in this build');
  return await native.writeFile(name, contents);
}

/**
 * Runs one prediction.
 *
 * Throws with the engine's own message when it refuses a request — the answer
 * carries an `error` field in that case, which is checked here so callers see
 * one failure mode rather than two.
 */
export async function predict<T>(request: unknown): Promise<T> {
  if (native === null) throw new Error('The engine is not in this build');
  const text = await native.predict(JSON.stringify(request));
  const answer = JSON.parse(text) as T & { error?: string; };
  if (typeof answer.error === 'string') throw new Error(answer.error);
  return answer;
}

/** Whether this build can run a batch across several threads. */
export const canBatch = (): boolean =>
  native !== null && typeof native.predictMany === 'function';

/**
 * How many cores this device will schedule a batch on.
 *
 * Four where the answer is not available — an older build of the module, or
 * no module at all on web. Four rather than one because the callers use this
 * to size a batch, and sizing it at one on a device that has eight would give
 * up the whole reason the batch exists. A device that really has fewer cores
 * than this says loses nothing: the strips still run, sharing what there is.
 */
export const DEFAULT_CORES = 4;

/**
 * Asks the module to report where its time goes.
 *
 * The lines go to the Android log under the `hfcast` tag, from three
 * places: the Rust, which separates computing from crossing the
 * boundary; the Kotlin, which reports how many strips really ran at
 * once; and the app, which reports parsing and packing. Together they
 * account for the whole wait.
 *
 * Returns whether tracing is on, which is false where the module is too
 * old to have the switch or there is no module at all.
 */
export function setTracing(on: boolean): boolean {
  const switchIt = native?.setTracing;
  if (switchIt === undefined) return false;
  return switchIt.call(native, on);
}

export function cores(): number {
  const count = native?.cores?.();
  return typeof count === 'number' && Number.isFinite(count) && count >= 1
    ? Math.floor(count)
    : DEFAULT_CORES;
}

/**
 * Whether this build can keep computed maps on disk.
 *
 * False on web, which has no module, and on an older build of it. A
 * caller that gets false computes every map it needs, which is what the
 * app did before any of this existed.
 */
export const canStoreMaps = (): boolean =>
  native !== null && typeof native.readMapCache === 'function';

/** One stored map, as the listing reports it. */
export interface StoredMap {
  name: string;
  bytes: number;
  /** When it was last read, in milliseconds since the epoch. */
  at: number;
}

/**
 * Reads one stored map, or null where there is none.
 *
 * Null rather than a failure for a map that is not there: that is the
 * ordinary answer for everything not computed yet, and the caller
 * computes it.
 */
export async function readMapCache(name: string): Promise<Uint8Array | null> {
  const read = native?.readMapCache;
  if (read === undefined) return null;
  const text = await read.call(native, name);
  return text === null ? null : fromBase64(text);
}

/** Stores one map, and answers with the room it took. */
export async function writeMapCache(
  name: string,
  bytes: Uint8Array,
): Promise<number> {
  const write = native?.writeMapCache;
  if (write === undefined) {
    throw new Error('This build cannot store a map');
  }
  return await write.call(native, name, toBase64(bytes));
}

/** Every stored map, with its size and when it was last read. */
export async function listMapCache(): Promise<StoredMap[]> {
  const list = native?.listMapCache;
  if (list === undefined) return [];
  const found = JSON.parse(await list.call(native)) as unknown;
  if (!Array.isArray(found)) return [];
  return found.filter((each): each is StoredMap =>
    each !== null
    && typeof each === 'object'
    && typeof (each as StoredMap).name === 'string'
    && typeof (each as StoredMap).bytes === 'number'
    && typeof (each as StoredMap).at === 'number'
  );
}

/** Drops stored maps by name, and answers with how many went. */
export async function removeMapCache(
  names: readonly string[],
): Promise<number> {
  const remove = native?.removeMapCache;
  if (remove === undefined || names.length === 0) return 0;
  return await remove.call(native, [...names]);
}

/**
 * Whether this device has a memory card the app may keep maps on.
 *
 * The old tablets this app is for are often short of internal storage
 * and take a card, and a year of maps is the largest thing the app ever
 * asks to keep.
 */
export const mapCardAvailable = (): boolean =>
  native?.mapCardAvailable?.() === true;

/**
 * Puts stored maps on the memory card, or back in internal storage.
 *
 * Answers with where they are now, which is not always what was asked: a
 * card taken out since the choice was made falls back to internal
 * storage rather than failing.
 */
export const useMapCard = (on: boolean): string =>
  native?.setMapCardUse?.(on) ?? '';

/** A batch's answers, and where its time went. */
export interface Batch<T> {
  answers: T[];
  /**
   * The engine and the crossing into it: strips computed on their own
   * threads, then handed back as strings.
   */
  nativeMs: number;
  /**
   * Turning those strings into objects, which happens on the thread that
   * draws.
   *
   * Reported apart from the rest because the two are charged to
   * different places and only one of them is arithmetic. A whole-world
   * grid is 34,560 points, and every one of them is parsed here — while
   * that runs, no bar animates and no touch is answered. A caller
   * deciding whether the grid is affordable has to know which half it is
   * paying for, because engine work and parsing are shortened by
   * completely different things.
   */
  parseMs: number;
}

/**
 * Runs several requests as one batch, across several threads.
 *
 * For the whole-world fine grid, which is 34,560 points and far too much
 * for the single thread every other call uses. The caller cuts the grid
 * into latitude strips that produce the same numbers as one run.
 *
 * Answers come back in the order the requests were given.
 */
export async function predictMany<T>(
  requests: readonly unknown[],
  threads: number,
): Promise<Batch<T>> {
  if (native === null) throw new Error('The engine is not in this build');
  const batch = native.predictMany;
  if (batch === undefined) {
    throw new Error('This build of the engine cannot run a batch');
  }
  const askedAt = Date.now();
  const texts = await batch.call(
    native,
    requests.map((request) => JSON.stringify(request)),
    threads,
  );
  const answeredAt = Date.now();
  const answers = texts.map((text) => {
    const answer = JSON.parse(text) as T & { error?: string; };
    if (typeof answer.error === 'string') throw new Error(answer.error);
    return answer;
  });
  return {
    answers,
    nativeMs: answeredAt - askedAt,
    parseMs: Date.now() - answeredAt,
  };
}

/**
 * Keeps a long map job running while the screen is off.
 *
 * Called again for every step, which is what moves the progress bar: the
 * service takes the same intent as a start or an update, and Android
 * hands it to the instance already running.
 *
 * The wording comes from here rather than from the module, because this
 * app has five languages and that module has none. `stopLabel` is what
 * the button on the notification says.
 *
 * False means the device would not start it — an old build, a
 * manufacturer that refuses, a permission withheld. The job then behaves
 * as it did before this existed: it runs while the app is open and waits
 * when it is not, which is worth saying out loud rather than failing.
 */
export const startBackgroundWork = (
  title: string,
  text: string,
  done: number,
  total: number,
  stopLabel: string,
): boolean =>
  native?.startBackgroundWork?.(title, text, done, total, stopLabel) === true;

/** Takes the notification down and lets the processor sleep again. */
export const stopBackgroundWork = (): boolean =>
  native?.stopBackgroundWork?.() === true;

/**
 * Whether the device is on power.
 *
 * Asked rather than watched. A job checks between maps, and a job
 * waiting for a charger asks every few seconds — which is cheap, because
 * the answer comes from a broadcast Android already keeps. A listener
 * would be one more thing with a lifetime to get wrong for an answer
 * nothing needs within the second.
 *
 * True where the engine is absent, so a build with no way to ask never
 * refuses to compute for want of an answer it cannot get.
 */
export const isCharging = (): boolean => native?.isCharging?.() !== false;

/**
 * Calls back when Stop is pressed on the notification.
 *
 * Returns a function that stops listening, or one that does nothing
 * where there is no module to listen to.
 */
export function onBackgroundStop(listener: () => void): () => void {
  const subscription = native?.addListener?.('onBackgroundStop', listener);
  return () => subscription?.remove();
}
