const os = require('os');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Metro sizes its transform pool from the CPU count alone. Each worker is a
 * separate Node process holding its own Babel state, so on a machine with many
 * cores but little RAM — a 2 GB container on a 16-core host, say — the default
 * pool exhausts memory and the kernel kills the bundler partway through. That
 * surfaces as a blank page and `exit code 137`, with no error from Metro.
 *
 * Budget roughly one worker per 800 MB of system memory instead, still capped
 * by core count so large machines are unaffected.
 */
const byMemory = Math.max(2, Math.floor(os.totalmem() / (800 * 1024 * 1024)));
config.maxWorkers = Math.max(1, Math.min(os.cpus().length - 1, byMemory));

module.exports = config;
