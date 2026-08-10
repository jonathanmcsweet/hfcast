/**
 * Prints the Android `versionCode` for a version.
 *
 * The number comes from the app's own `versionCodeFor`, so this script
 * cannot hold a second copy of the formula that drifts from it. The
 * modern tier is the one `app.json` carries; the legacy build takes its
 * own from the same function at build time.
 *
 * Needs `--experimental-strip-types`, because the function it calls is
 * TypeScript:
 *
 *     node --experimental-strip-types tools/version-code.mjs 0.58.1
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const version = process.argv[2];
if (version === undefined) {
  console.error('usage: version-code.mjs <version>');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const { versionCodeFor } = await import(
  pathToFileURL(path.join(here, '../mobile/src/data/version.ts')).href
);

process.stdout.write(String(versionCodeFor(version, 'modern')));
