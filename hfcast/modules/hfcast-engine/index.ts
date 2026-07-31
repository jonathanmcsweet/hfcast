import { requireOptionalNativeModule } from 'expo-modules-core';

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
  /** Writes one file under that directory and returns its full path. */
  writeFile(name: string, contents: string): Promise<string>;
  /** One request object as JSON, one answer object as JSON. */
  predict(request: string): Promise<string>;
  /**
   * A batch of requests as JSON, run across `threads`, answered in the
   * order they were given. Absent from older builds of the module.
   */
  predictMany?(requests: string[], threads: number): Promise<string[]>;
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

export function cores(): number {
  const count = native?.cores?.();
  return typeof count === 'number' && Number.isFinite(count) && count >= 1
    ? Math.floor(count)
    : DEFAULT_CORES;
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
): Promise<T[]> {
  if (native === null) throw new Error('The engine is not in this build');
  const batch = native.predictMany;
  if (batch === undefined) {
    throw new Error('This build of the engine cannot run a batch');
  }
  const texts = await batch.call(
    native,
    requests.map((request) => JSON.stringify(request)),
    threads,
  );
  return texts.map((text) => {
    const answer = JSON.parse(text) as T & { error?: string; };
    if (typeof answer.error === 'string') throw new Error(answer.error);
    return answer;
  });
}
