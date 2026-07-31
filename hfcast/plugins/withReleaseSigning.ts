import type { ConfigPlugin } from '@expo/config-plugins';
import * as configPlugins from '@expo/config-plugins';

/**
 * The two builds load this file two different ways, and neither plain form of
 * the import works for both.
 *
 * Expo SDK 50 hands it to Node, which strips the types and runs it as an ES
 * module. `@expo/config-plugins` is CommonJS, and Node cannot see a CommonJS
 * module's named exports, so they arrive under `default` and a named import
 * throws. Expo SDK 57 transpiles this file to CommonJS first, where the
 * namespace *is* the module's exports and there is no `default` at all.
 *
 * Taking whichever of the two holds the function covers both. Testing for it
 * rather than testing which SDK is running keeps this correct when the next one
 * changes its mind again.
 */
const { withAppBuildGradle } =
  (configPlugins as { default?: typeof configPlugins; }).default
    ?? configPlugins;

/**
 * Signs release builds with a keystore that lives outside this repository.
 *
 * `expo prebuild` rewrites `android/` from scratch, so anything added to the
 * generated Gradle files by hand is lost on the next run. This puts the change
 * back every time.
 *
 * Nothing secret is stored here. The keystore path and its passwords are read
 * from Gradle properties, which belong in `~/.gradle/gradle.properties` — a file
 * outside the repository, on the machine that holds the key:
 *
 *     HFCAST_STORE_FILE=/home/you/keys/hfcast-release.jks
 *     HFCAST_STORE_PASSWORD=...
 *     HFCAST_KEY_ALIAS=hfcast
 *     HFCAST_KEY_PASSWORD=...
 *
 * **A build with no key still works.** Without those properties the release
 * build falls back to the debug key, exactly as before. That matters for more
 * than convenience: F-Droid builds from source and signs with its own key, and a
 * contributor cloning this repository has to be able to build without being
 * handed a signing secret.
 *
 * The two are not interchangeable in the other direction. A debug-signed install
 * cannot be upgraded by a properly signed one — Android refuses, and the user
 * has to uninstall first, losing their settings.
 */

const SIGNING_CONFIG = `
    signingConfigs {
        // Present only when the machine building has the key. See
        // plugins/withReleaseSigning.ts.
        if (project.hasProperty('HFCAST_STORE_FILE')) {
            release {
                storeFile file(HFCAST_STORE_FILE)
                storePassword HFCAST_STORE_PASSWORD
                keyAlias HFCAST_KEY_ALIAS
                keyPassword HFCAST_KEY_PASSWORD
            }
        }
    }
`;

/**
 * The generated file assigns the debug key to release builds, which is React
 * Native's template default so that a release build works with no setup. This
 * swaps in the real one when there is one.
 *
 * The line appears twice, once in each build type, and the debug one has to be
 * left alone. They are told apart by position: the template writes `debug`
 * before `release`, so the second is the one to change. Position is a weaker
 * anchor than the surrounding text, but the surrounding text is what changes
 * between React Native versions — SDK 57 put a `def` line where SDK 51 had
 * `shrinkResources` — while the order of the two build types has not.
 */
const DEBUG_KEY = 'signingConfig signingConfigs.debug';

const CHOSEN_KEY =
  "signingConfig project.hasProperty('HFCAST_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";

export const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (gradleConfig) => {
    const contents = gradleConfig.modResults.contents;

    if (contents.includes('HFCAST_STORE_FILE')) return gradleConfig;

    const parts = contents.split(DEBUG_KEY);
    const found = parts.length - 1;

    if (found !== 2) {
      // Louder than a silently unsigned build: the template changed shape and
      // this plugin no longer knows which assignment to change.
      throw new Error(
        `withReleaseSigning: app/build.gradle holds ${found} "${DEBUG_KEY}" lines, expected two. The template changed; update this plugin.`,
      );
    }

    const [beforeDebug, betweenBuildTypes, afterRelease] = parts;

    // The signing configs block goes just inside `android {`.
    const withRelease =
      `${beforeDebug}${DEBUG_KEY}${betweenBuildTypes}${CHOSEN_KEY}${afterRelease}`
        .replace(/android\s*\{/, (match) => `${match}\n${SIGNING_CONFIG}`);

    return {
      ...gradleConfig,
      modResults: { ...gradleConfig.modResults, contents: withRelease },
    };
  });

export default withReleaseSigning;
