import type { ConfigPlugin } from '@expo/config-plugins';
// Imported as a namespace and destructured, not as a named import.
// `@expo/config-plugins` is CommonJS, and Expo loads this file as an ES module,
// where Node cannot statically see a CJS module's named exports.
import configPlugins from '@expo/config-plugins';

const { withAppBuildGradle } = configPlugins;

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
 */
const RELEASE_SIGNING_LINE =
  /signingConfig signingConfigs\.debug\s*\n(\s*)(shrinkResources|minifyEnabled)/;

export const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (gradleConfig) => {
    const contents = gradleConfig.modResults.contents;

    if (contents.includes('HFCAST_STORE_FILE')) return gradleConfig;

    // The signing configs block goes just inside `android {`.
    const withConfigs = contents.replace(
      /android\s*\{/,
      (match) => `${match}\n${SIGNING_CONFIG}`,
    );

    const withRelease = withConfigs.replace(
      RELEASE_SIGNING_LINE,
      (_match, indent: string, next: string) =>
        `signingConfig project.hasProperty('HFCAST_STORE_FILE') ? signingConfigs.release : signingConfigs.debug\n${indent}${next}`,
    );

    if (withRelease === withConfigs) {
      // Louder than a silently unsigned build: the template changed shape and
      // this plugin no longer knows where to put the assignment.
      throw new Error(
        'withReleaseSigning: could not find the release signingConfig line in '
          + 'app/build.gradle. The template has changed; update the pattern.',
      );
    }

    return {
      ...gradleConfig,
      modResults: { ...gradleConfig.modResults, contents: withRelease },
    };
  });

export default withReleaseSigning;
