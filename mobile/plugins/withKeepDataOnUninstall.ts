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
 * Everything the app remembers lives in its data directory, which Android
 * deletes with the app — station, antenna, presets and stored maps — so
 * sideloading a new build means setting it all up again.
 *
 * `hasFragileUserData` puts a "keep app data" choice in the system's
 * uninstall dialog, and the directory is reattached on reinstall. The
 * system does it on the device: no network, no account, no Google
 * services, so it works on a de-googled device.
 *
 * Three platform limits:
 *
 * - Android 10 and later only. The modern build runs from Android 7, and
 *   below 10 the flag is ignored.
 * - An offer, not a promise: an unticked box loses the data.
 * - Same signing key. A release build cannot pick up data a debug build
 *   left, so a test APK and a store install do not share it.
 *
 * An exported settings file answers all three, and is in the roadmap.
 *
 * `expo prebuild` rewrites `android/`, so this reapplies on every run,
 * the same reason `withAbiSplits.ts` exists.
 */
const ATTRIBUTE = 'android:hasFragileUserData';

/**
 * One manifest in, the same manifest asking to keep the data, out.
 *
 * Separate from the plugin so a test can run it, as `withBuildMemory.ts`
 * does: running the plugin needs a prebuild, an SDK and several minutes.
 */
export function keepDataOnUninstall(manifest: Manifest): Manifest {
  const application = manifest.manifest.application;
  // Nothing to change rather than a guess at where the tag should go: a
  // manifest with no application tag is not one this plugin is for.
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
