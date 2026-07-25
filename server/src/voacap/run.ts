/**
 * Runs the voacapl binary.
 *
 * voacapl reads and writes files inside `<itshfbc>/run/`, so concurrent
 * requests must not share filenames. It accepts explicit input and output
 * names, which is enough to keep runs apart without copying the (large)
 * coefficient tree per request.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const ITSHFBC_DIR =
  process.env['HFCAST_ITSHFBC'] ?? path.join(homedir(), 'itshfbc');

export const VOACAPL_BIN =
  process.env['HFCAST_VOACAPL'] ?? path.join(homedir(), '.local/bin/voacapl');

/** A single run times out well before any sensible HTTP client does. */
const RUN_TIMEOUT_MS = 30_000;

export async function runVoacap(deck: string): Promise<string> {
  const id = randomUUID().slice(0, 8);
  const inputName = `hfcast-${id}.dat`;
  const outputName = `hfcast-${id}.out`;
  const runDir = path.join(ITSHFBC_DIR, 'run');
  const inputPath = path.join(runDir, inputName);
  const outputPath = path.join(runDir, outputName);

  await writeFile(inputPath, deck, 'utf8');
  try {
    await execFileAsync(VOACAPL_BIN, [ITSHFBC_DIR, inputName, outputName], {
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
}
