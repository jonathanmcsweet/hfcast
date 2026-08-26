import type { ConfigPlugin } from '@expo/config-plugins';
import * as configPlugins from '@expo/config-plugins';

/**
 * See `withReleaseSigning.ts` for why the import is taken this way: the two
 * builds load these files differently and neither plain form works for both.
 */
const { withAppBuildGradle } =
  (configPlugins as { default?: typeof configPlugins; }).default
    ?? configPlugins;

/**
 * Builds one APK per architecture instead of one holding all four.
 *
 * A single APK carries the native code for every architecture, so a phone
 * downloads about four times what it can run: 146 MB, of which roughly 110 MB
 * is machine code for other processors. The engine is the reason — its Rust
 * library is built once per architecture, and Skia adds more of the same.
 *
 * Splitting costs four files in a release instead of one. Obtainium and
 * F-Droid both pick the right file for the device; a person downloading
 * straight from a release page has to be told which is which, which is what
 * the download section of the README is for.
 *
 * `expo prebuild` rewrites `android/` from scratch, so this puts the change
 * back on every run — the same reason `withReleaseSigning.ts` exists.
 *
 * The list of architectures is also what decides how many times the native
 * code is compiled, so it is read from `reactNativeArchitectures` rather than
 * fixed here. A release passes nothing and gets all four. A machine with
 * little memory passes one and does a quarter of the work — four compilers on
 * the Skia sources is what ends a build on a small machine, and the message
 * names no cause.
 */

const SPLITS = `
    // See plugins/withAbiSplits.ts.
    splits {
        abi {
            enable true
            reset()
            // This list decides how many times the native code is compiled,
            // not only how many files come out. It follows React Native's own
            // reactNativeArchitectures property, which android/gradle.properties
            // sets to all four, so a release is unchanged. A machine short of
            // memory asks for one and compiles once instead of four times:
            //
            //     ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
            //
            // Commas and no spaces, as gradle.properties writes it. A space
            // ends the build in project :expo before this list is read.
            def requested = project.findProperty("reactNativeArchitectures")
                ?: "armeabi-v7a,arm64-v8a,x86,x86_64"
            requested.toString().split(",").each { include it }
            // No fifth file holding all four. Nothing in the release needs
            // one, and it is the largest thing the build can produce.
            universalApk false
        }
    }
`;

/**
 * Android refuses to install an update whose `versionCode` is not higher, and
 * compares it across the whole application rather than per architecture. Four
 * APKs from one build therefore cannot share one code.
 *
 * The offsets multiply rather than add so the ordering inside a release never
 * reaches the next release's block: for a release at 0.54.4, `app.json` holds
 * 54041 and the four become 540411 to 540414.
 *
 * That leading number comes from `versionCodeFor` in `src/data/version.ts`,
 * which gives major 100,000, minor 100, patch 1 and the build tier the last
 * digit. This digit is below all of them. The largest a release can produce is
 * therefore 209.999.99 as 2,099,999,914, so version 210.0.0 is the first that
 * does not fit Android's ceiling of 2,100,000,000. `credits.test.ts` checks
 * both ends of that.
 *
 * All four are built and all four are published. `x86` covers Intel Android
 * devices, which stopped being made when Intel left the mobile business in
 * 2016 and are kept anyway, since a device that old can still be in use and
 * a fourth APK costs a reader nothing (user, 2026-08-22). `armeabi-v7a` is
 * not legacy either: Amazon shipped Fire tablets with a wholly 32-bit Fire OS
 * on 64-bit capable silicon into 2020.
 *
 * The order is fixed and must not be reordered — a device that installed
 * `arm64-v8a` as 3 has to keep seeing 3, or an update looks like a downgrade.
 */
export const ABI_CODES = `
    ext.abiCodes = ["armeabi-v7a": 1, "x86": 2, "arm64-v8a": 3, "x86_64": 4]
    android.applicationVariants.all { variant ->
        variant.outputs.each { output ->
            def abi = output.getFilter(com.android.build.OutputFile.ABI)
            if (abi != null) {
                output.versionCodeOverride =
                    variant.versionCode * 10 + project.ext.abiCodes.get(abi)
            }
        }
    }
`;

/**
 * The whole change, as one function on the text of `app/build.gradle`.
 *
 * It is separate from the plugin so that a test can run it. Running the plugin
 * itself needs a prebuild, an Android SDK and several minutes, which is why
 * nothing checked this for a long time. `test/gradlePlugins.test.ts` calls
 * this.
 */
export function addAbiSplits(contents: string): string {
  // Running twice must add nothing twice. `expo prebuild` can call the
  // plugins again over a tree that already has the change.
  if (contents.includes('abiCodes')) return contents;

  if (!/android\s*\{/.test(contents)) {
    // Louder than a silently unsplit build, which looks like a working
    // release until somebody measures the download.
    throw new Error(
      'withAbiSplits: no `android {` block in app/build.gradle. The template changed; update this plugin.',
    );
  }

  // The splits block goes inside `android {`; the version codes have to sit
  // outside it, because `applicationVariants` is a property of the plugin
  // rather than of the extension.
  const split = contents.replace(
    /android\s*\{/,
    (match) => `${match}\n${SPLITS}`,
  );

  return `${split}\n${ABI_CODES}`;
}

export const withAbiSplits: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (gradleConfig) => ({
    ...gradleConfig,
    modResults: {
      ...gradleConfig.modResults,
      contents: addAbiSplits(gradleConfig.modResults.contents),
    },
  }));

export default withAbiSplits;
