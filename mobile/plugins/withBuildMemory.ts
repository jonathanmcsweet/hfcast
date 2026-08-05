import type { AndroidConfig, ConfigPlugin } from '@expo/config-plugins';
import * as configPlugins from '@expo/config-plugins';

/** One line of `gradle.properties`, as Expo's mod gives them. */
export type PropertiesItem = AndroidConfig.Properties.PropertiesItem;

/**
 * See `withReleaseSigning.ts` for why the import is taken this way: the two
 * builds load these files differently and neither plain form works for both.
 */
const { withGradleProperties } =
  (configPlugins as { default?: typeof configPlugins; }).default
    ?? configPlugins;

/**
 * Gives the Gradle daemon enough metaspace to finish a release build.
 *
 * The Expo template writes `-Xmx2048m -XX:MaxMetaspaceSize=512m`. Metaspace
 * holds loaded classes, not objects, and this build loads a lot of them: the
 * Android plugin, the React Native plugin, Kotlin, and one module for each of
 * the twenty packages the app depends on. 512 MB is not enough. The daemon
 * runs out and dies part way through, and the message the build prints is
 * "Gradle build daemon disappeared unexpectedly", which says nothing about
 * memory. The daemon's own log holds the true reason.
 *
 * The heap is left where the template put it. It was never the part that ran
 * out.
 *
 * A machine with little memory needs `HFCAST_BUILD_CPUS` as well; see
 * `tools/build-android.sh`. That limits the C++ compilers, which is a
 * different limit and does not help here.
 *
 * `expo prebuild` rewrites `android/` from scratch, so this puts the change
 * back on every run — the same reason `withAbiSplits.ts` exists.
 */

/** What the daemon gets. Metaspace is the part that is different. */
export const JVM_ARGS = '-Xmx2048m -XX:MaxMetaspaceSize=1024m';

const KEY = 'org.gradle.jvmargs';

/**
 * One property list in, the same list with the memory settings, out.
 *
 * It is separate from the plugin so that a test can run it. Running the
 * plugin itself needs a prebuild, an Android SDK and several minutes, which
 * is why nothing checked the other two plugins for a long time.
 * `test/gradlePlugins.test.ts` calls this.
 */
export function setBuildMemory(
  properties: readonly PropertiesItem[],
): PropertiesItem[] {
  const replaced = properties.map((entry) =>
    entry.type === 'property' && entry.key === KEY
      ? { ...entry, value: JVM_ARGS }
      : entry
  );

  const present = replaced.some(
    (entry) => entry.type === 'property' && entry.key === KEY,
  );

  // The template has always written the key, so an absent one means the
  // template changed. Adding it is still correct, and is quieter than a
  // build that dies an hour later with a message about a daemon.
  return present
    ? replaced
    : [...replaced, { type: 'property', key: KEY, value: JVM_ARGS }];
}

export const withBuildMemory: ConfigPlugin = (config) =>
  withGradleProperties(config, (propertiesConfig) => ({
    ...propertiesConfig,
    modResults: setBuildMemory(propertiesConfig.modResults),
  }));

export default withBuildMemory;
