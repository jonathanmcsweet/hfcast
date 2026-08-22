import type { ConfigPlugin } from '@expo/config-plugins';
import * as configPlugins from '@expo/config-plugins';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * See `withReleaseSigning.ts` for why the imports are taken this way: the
 * two builds load these files differently and neither plain form works for
 * both.
 */
const { withAndroidManifest, withDangerousMod } =
  (configPlugins as { default?: typeof configPlugins; }).default
    ?? configPlugins;

/**
 * Lets a tablet turn, and holds a telephone upright.
 *
 * `orientation: "portrait"` in app.json came from the Expo template and
 * was never a decision, so a tablet could not be used landscape at all
 * (user, 2026-08-22). The layout has wanted to for a while: dialogs
 * become cards past 600 points and the map has a cap for the wide
 * arrangement.
 *
 * Android picks between the two by screen size, from a resource rather
 * than from code. `values/` holds portrait and `values-sw600dp/` holds
 * unspecified, and the platform reads whichever matches the device's
 * smallest width, which is a property of the hardware and never changes.
 *
 * A resource rather than `expo-screen-orientation` for two reasons. It
 * adds no dependency, so the APK, the legacy build on SDK 50 and the
 * F-Droid recipe all stay as they are. And the choice is made before the
 * activity starts: locking at run time would let a telephone launched on
 * its side draw one frame landscape and then snap upright.
 *
 * The numbers are `ActivityInfo`'s: 1 is `SCREEN_ORIENTATION_PORTRAIT` and
 * -1 is `SCREEN_ORIENTATION_UNSPECIFIED`, which follows the device's own
 * auto-rotate setting.
 */

/** What the resource is called, and what each bucket holds. */
export const ORIENTATION_RES = 'screen_orientation';
export const PORTRAIT = 1;
export const UNSPECIFIED = -1;

const integers = (value: number) =>
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <integer name="${ORIENTATION_RES}">${value}</integer>
</resources>
`;

/** Written to `values/` and `values-sw600dp/` respectively. */
export const PHONE_INTEGERS = integers(PORTRAIT);
export const TABLET_INTEGERS = integers(UNSPECIFIED);

/** The manifest, as Expo's mod gives it. */
type Manifest = Parameters<Parameters<typeof withAndroidManifest>[1]>[0][
  'modResults'
];

/**
 * One manifest in, the same manifest asking the resource, out.
 *
 * Separate from the plugin so a test can run it, as `withBackupRules.ts`
 * does. Every activity is rewritten rather than `MainActivity` alone,
 * since the app declares one and a second would want the same rule.
 */
export function askResourceForOrientation<T extends Manifest>(manifest: T): T {
  const application = manifest.manifest.application;
  // Nothing to change rather than a guess at where the tag should go.
  if (application === undefined) return manifest;

  return {
    ...manifest,
    manifest: {
      ...manifest.manifest,
      application: application.map((tag) => ({
        ...tag,
        ...(tag.activity === undefined ? {} : {
          activity: tag.activity.map((one) => ({
            ...one,
            $: {
              ...one.$,
              'android:screenOrientation': `@integer/${ORIENTATION_RES}`,
            },
          })),
        }),
      })),
    },
  };
}

export const withTabletRotation: ConfigPlugin = (config) => {
  const asked = withAndroidManifest(config, (manifestConfig) => ({
    ...manifestConfig,
    modResults: askResourceForOrientation(manifestConfig.modResults),
  }));

  return withDangerousMod(asked, [
    'android',
    async (dangerous) => {
      const res = path.join(
        dangerous.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
      );
      const buckets = [
        ['values', PHONE_INTEGERS],
        ['values-sw600dp', TABLET_INTEGERS],
      ] as const;
      for (const [dir, xml] of buckets) {
        const into = path.join(res, dir);
        await fs.mkdir(into, { recursive: true });
        await fs.writeFile(path.join(into, 'integers.xml'), xml);
      }
      return dangerous;
    },
  ]);
};

export default withTabletRotation;
