/**
 * Writes the `app.json` for the legacy build.
 *
 * The two builds share one source tree and one configuration. Only three things
 * differ, and all three are here rather than in a second copy of `app.json`:
 * the Android SDK levels, the version code's tier digit, and nothing else. A
 * second full `app.json` would drift — someone would change a permission or a
 * colour in one and not the other, and the difference would ship.
 *
 * Run by `tools/build-android.sh`. Reads the real `app.json` and writes the
 * legacy one to the path given as the argument.
 *
 *     node --experimental-strip-types tools/legacy-config.ts out/app.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { versionCodeFor } from '../src/data/version.ts';

const HERE = import.meta.dirname;

/**
 * What Expo SDK 50 and React Native 0.73 build against.
 *
 * API 21 is the floor React Native 0.73 declares, and it is the whole reason
 * this build exists: it is the oldest Android any React Native this project
 * could use will run on. Compiling and targeting 34 rather than 36 is not a
 * choice either — SDK 50 predates 36 and cannot compile against it.
 */
const LEGACY_ANDROID = {
  compileSdkVersion: 34,
  targetSdkVersion: 34,
  buildToolsVersion: '34.0.0',
  minSdkVersion: 21,
} as const;

interface BuildProperties {
  android?: Record<string, unknown>;
}

type Plugin = string | [string, BuildProperties];

/** Swaps the SDK levels inside the `expo-build-properties` entry, leaving every
 * other plugin and every other property of that one untouched. */
const withLegacySdk = (plugin: Plugin): Plugin => {
  if (!Array.isArray(plugin) || plugin[0] !== 'expo-build-properties') {
    return plugin;
  }
  const [name, options] = plugin;
  return [name, {
    ...options,
    android: { ...options.android, ...LEGACY_ANDROID },
  }];
};

const source = path.join(HERE, '..', 'app.json');
const destination = process.argv[2];

if (destination === undefined) {
  throw new Error('legacy-config: give the path to write the app.json to');
}

const config = JSON.parse(readFileSync(source, 'utf8')) as {
  expo: {
    version: string;
    android: { versionCode: number; };
    plugins: Plugin[];
  };
};

const legacy = {
  ...config,
  expo: {
    ...config.expo,
    android: {
      ...config.expo.android,
      versionCode: versionCodeFor(config.expo.version, 'legacy'),
    },
    plugins: config.expo.plugins.map(withLegacySdk),
  },
};

writeFileSync(destination, `${JSON.stringify(legacy, null, 2)}\n`);

console.log(
  `legacy app.json written to ${destination}: `
    + `version ${legacy.expo.version}, code ${legacy.expo.android.versionCode}, `
    + `minSdk ${LEGACY_ANDROID.minSdkVersion}`,
);
