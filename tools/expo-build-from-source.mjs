/**
 * Turns off Expo's precompiled Android modules, so Gradle builds them from
 * source instead of linking a prebuilt library.
 *
 * Expo SDK 57 ships eight of its modules as `.aar` files inside
 * `node_modules/*'/'local-maven-repo/`. Skipping that compilation is the whole
 * point of them, and it is also why F-Droid cannot build this app: F-Droid
 * builds from source, so its scanner deletes prebuilt binaries out of the
 * source tree, and Gradle then fails to resolve the modules that are no longer
 * there.
 *
 * Expo reads `buildFromSource` from `package.json` alone. There is no flag and
 * no environment variable, so the only way to ask for it is to write it in.
 * This runs in F-Droid's `prebuild` and nowhere else, which is what keeps an
 * ordinary APK build on the faster path.
 *
 *     node tools/expo-build-from-source.mjs mobile/package.json
 *
 * Running it twice changes nothing the second time.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [file] = process.argv.slice(2);

if (file === undefined) {
  console.error('usage: node tools/expo-build-from-source.mjs <package.json>');
  process.exit(1);
}

const held = JSON.parse(readFileSync(file, 'utf8'));

// Merged rather than assigned. `package.json` already carries an
// `autolinking.android.exclude` that keeps Skia out of the APK, and a build
// that silently dropped it here would be hard to see.
const updated = {
  ...held,
  expo: {
    ...held.expo,
    autolinking: {
      ...held.expo?.autolinking,
      android: {
        ...held.expo?.autolinking?.android,
        // Every module, as a regular expression.
        buildFromSource: ['.*'],
      },
    },
  },
};

writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`${file}: expo modules will be built from source`);
