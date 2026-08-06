const os = require('node:os');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * The physics both projects agree on lives outside this directory.
 *
 * Metro refuses to resolve anything above the project root unless it is
 * told about it, which is the reason the app and the server carried
 * copies of the correction factors, the mode table and the grid maths.
 * One entry here is the whole of what that needed. See `shared/README.md`.
 *
 * The legacy build works in a copy of this directory under `build/`, and
 * `tools/build-android.sh` links `shared/` in beside that copy, so this
 * relative path is right from either tree.
 */
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, '../shared'),
];

/**
 * Metro sizes its transform pool from the CPU count alone. Each worker is a
 * separate Node process holding its own Babel state, so on a machine with many
 * cores but little RAM — a 2 GB container on a 16-core host, say — the default
 * pool exhausts memory and the kernel kills the bundler partway through. That
 * surfaces as a blank page and `exit code 137`, with no error from Metro.
 *
 * Measured on this project: a web bundle costs about 600 MB across two
 * workers, so roughly 300 MB each once the bundler's own growth is counted.
 * The budgets below are deliberately more cautious than that, because running
 * out is silent — the kernel kills the bundler and the page just never loads.
 *
 * Two budgets, and the smaller wins:
 *
 *   - total memory, at about 1.5 GB per worker. A worker has to coexist with
 *     the bundler process itself, which is the larger of the two.
 *   - memory actually free right now, at about 600 MB per worker. Total is the
 *     wrong measure when an editor and its language servers already hold most
 *     of the machine.
 *
 * At `maxWorkers` of 1 Metro transforms in band and spawns nothing. That is
 * not only a fallback: on a machine tight enough to reach it, skipping the
 * process overhead and the serialising of every module across it also measured
 * faster than using two workers.
 */
const GIB = 1024 ** 3;
const byTotalMemory = Math.floor(os.totalmem() / (1.5 * GIB));
const byFreeMemory = Math.floor(os.freemem() / (0.6 * GIB));

config.maxWorkers = Math.max(
  1,
  Math.min(os.cpus().length - 1, byTotalMemory, byFreeMemory),
);

module.exports = config;
