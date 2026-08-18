import type { AndroidConfig, ConfigPlugin } from '@expo/config-plugins';
import * as configPlugins from '@expo/config-plugins';

/** The manifest, as Expo's mod gives it. */
export type Manifest = AndroidConfig.Manifest.AndroidManifest;

/**
 * See `withReleaseSigning.ts` for why the import is taken this way: the two
 * builds load these files differently and neither plain form works for both.
 */
const { withAndroidManifest } =
  (configPlugins as { default?: typeof configPlugins; }).default
    ?? configPlugins;

/**
 * Offers to keep the station and its settings when the app is uninstalled.
 *
 * Everything this app remembers lives in its own data directory, which
 * Android deletes with the app. That loses the station, the antenna, the
 * presets and the stored maps, and a person who sideloads a new build to
 * try it has to set the whole thing up again.
 *
 * `hasFragileUserData` puts a "keep app data" choice in the system's own
 * uninstall dialog. Keep it and the directory survives the uninstall and is
 * reattached when the app is installed again. It is the system doing this,
 * on the device, so it needs no network, no account and no Google services:
 * it works on a de-googled device, which is a normal target here.
 *
 * Three things it does not do, all of them the platform's rules:
 *
 * - Android 10 and later only. The modern build runs from Android 7, and
 *   below 10 the flag is ignored and the data goes as before.
 * - It is an offer, not a promise. Somebody who leaves the box unticked
 *   loses the data, which is the right way round for a choice about their
 *   own device.
 * - The new install has to be signed with the same key. A release build
 *   cannot pick up data left by a debug build, so a sideloaded test APK and
 *   a store install do not share this.
 *
 * A settings file the person exports themselves is the answer to all three,
 * and is tracked in the roadmap. This is the cheap half, and it is the half
 * that costs them nothing to use.
 *
 * `expo prebuild` rewrites `android/` from scratch, so this puts the change
 * back on every run, the same reason `withAbiSplits.ts` exists.
 */
const ATTRIBUTE = 'android:hasFragileUserData';

/**
 * One manifest in, the same manifest asking to keep the data, out.
 *
 * Separate from the plugin so a test can run it, as `withBuildMemory.ts`
 * does. Running the plugin itself needs a prebuild, an Android SDK and
 * several minutes.
 */
export function keepDataOnUninstall(manifest: Manifest): Manifest {
  const application = manifest.manifest.application;
  // Nothing to change rather than a guess at where the tag should go. A
  // manifest with no application tag is not one this plugin wrote for.
  if (application === undefined) return manifest;

  return {
    ...manifest,
    manifest: {
      ...manifest.manifest,
      application: application.map((tag) => ({
        ...tag,
        $: { ...tag.$, [ATTRIBUTE]: 'true' },
      })),
    },
  };
}

export const withKeepDataOnUninstall: ConfigPlugin = (config) =>
  withAndroidManifest(config, (manifestConfig) => ({
    ...manifestConfig,
    modResults: keepDataOnUninstall(manifestConfig.modResults),
  }));

export default withKeepDataOnUninstall;
