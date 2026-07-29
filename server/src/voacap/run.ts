/**
 * Runs the voacapl binary.
 *
 * Concurrent runs need a whole itshfbc tree each. voacapl builds its antenna
 * scratch filenames from the antenna index alone (`decred.for`:
 * `write(gainfile,'(4hgain,i2.2,4h.dat)') iantr`), so every run writes
 * `<root>/run/gain01.dat` and `gain02.dat` under those fixed names. Two runs
 * sharing a tree overwrite each other's scratch files, and a run that reads one
 * mid-write dies with a Fortran end-of-file fault. Unique deck filenames do not
 * help, because these names come from the engine rather than from the caller.
 *
 * Copying the tree costs about 120 ms, which is longer than a run takes, so
 * copying per request would dominate the response. Instead a small pool of
 * trees is made once and reused, with each run holding one for its duration.
 */
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const ITSHFBC_DIR = process.env.HFCAST_ITSHFBC
  ?? path.join(homedir(), 'itshfbc');

export const VOACAPL_BIN = process.env.HFCAST_VOACAPL
  ?? path.join(homedir(), '.local/bin/voacapl');

/**
 * How many runs may proceed at once. Each holds one tree, so this is also the
 * number of copies kept on disk, at about 1.4 MB each.
 */
const POOL_SIZE = Math.max(1, Number(process.env.HFCAST_VOACAP_POOL ?? 4));

/** A single run times out well before any sensible HTTP client does. */
const RUN_TIMEOUT_MS = 30_000;

/**
 * A pool of private trees.
 *
 * The one place here that is deliberately not written in the functional
 * style the rest follows. Lending a tree is a mutation by definition —
 * whoever takes one must be the only holder until they give it back, and
 * a waiter must be handed the exact tree a releaser let go of. Rebuilding
 * the queues as new values would let two callers act on the same stale
 * snapshot and run in the same directory, which is the collision the pool
 * exists to prevent.
 *
 * So the state is kept inside this closure rather than at module scope,
 * and nothing outside can reach it.
 */
function createTreePool(size: number) {
  const idle: string[] = [];
  const waiting: ((dir: string) => void)[] = [];
  let ready: Promise<void> | null = null;

  const build = async (): Promise<void> => {
    const base = await mkdtemp(path.join(tmpdir(), 'hfcast-voacap-'));

    // Removing the copies on exit keeps a long-lived process from leaving one
    // tree per restart behind in the temp directory.
    const cleanup = () => {
      rm(base, { recursive: true, force: true }).catch(() => {});
    };
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    const dirs = Array.from(
      { length: size },
      (_, i) => path.join(base, String(i)),
    );
    await Promise.all(dirs.map((dir) =>
      // The tree is largely symbolic links into the installed share directory.
      // Copying them as links rather than following them is what keeps a
      // private tree small; the targets are read-only, so sharing them is safe.
      cp(ITSHFBC_DIR, dir, {
        recursive: true,
        dereference: false,
        verbatimSymlinks: true,
      })
    ));
    idle.push(...dirs);
  };

  return {
    async acquire(): Promise<string> {
      ready ??= build();
      await ready;

      const free = idle.pop();
      if (free !== undefined) return free;

      return await new Promise<string>((resolve) => {
        waiting.push(resolve);
      });
    },

    release(dir: string): void {
      const next = waiting.shift();
      if (next !== undefined) next(dir);
      else idle.push(dir);
    },
  };
}

const pool = createTreePool(POOL_SIZE);

export async function runVoacap(deck: string): Promise<string> {
  const root = await pool.acquire();
  try {
    const runDir = path.join(root, 'run');
    const inputName = 'hfcast.dat';
    const outputName = 'hfcast.out';
    const inputPath = path.join(runDir, inputName);
    const outputPath = path.join(runDir, outputName);

    await writeFile(inputPath, deck, 'utf8');
    try {
      await execFileAsync(VOACAPL_BIN, [root, inputName, outputName], {
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
      return await readFile(outputPath, 'utf8');
    } finally {
      await Promise.all([
        rm(inputPath, { force: true }),
        rm(outputPath, { force: true }),
      ]);
    }
  } finally {
    pool.release(root);
  }
}
