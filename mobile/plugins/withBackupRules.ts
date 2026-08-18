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
 * Says what a backup should carry, and what it should leave.
 *
 * Android backs an app up through whatever backup transport the device
 * has. On a de-googled device that is usually Seedvault, which GrapheneOS
 * ships: it uses the same platform APIs Google's transport does, so an app
 * that describes its data correctly is backed up and restored by it with
 * nothing app-side to add. `allowBackup` was already true, but with no
 * rules the platform takes its own view of what to carry, and that view is
 * wrong here in both directions.
 *
 * What has to be carried is the settings and the station. Those live in
 * `RKStorage`, the SQLite database `@react-native-async-storage` keeps, so
 * the rules name it rather than trusting a default.
 *
 * What must not be carried is `hfcast-maps`. Stored maps are up to the
 * whole budget somebody set, which reaches 512 MB, and a backup that size
 * is refused by the transport or fills a person's card for nothing. They
 * are also the one thing here that can be made again from the engine in
 * the app, so losing them costs computing time and no information.
 *
 * Naming the includes is what leaves them out, and there is deliberately
 * no `exclude` for them. Once a rules file names anything to include, the
 * platform carries that and nothing else, so the maps are already out by
 * living in the `file` domain that no line here names. Excluding them as
 * well fails `lintVitalRelease` with "hfcast-maps is not in an included
 * path", which is lint saying the same thing: an exclude only means
 * something inside an include.
 *
 * Two files rather than one because the platform changed the format.
 * Android 12 and later read `dataExtractionRules`, and everything before
 * reads `fullBackupContent`. Both are written, and the manifest names
 * both, so one build covers every version the app runs on.
 */

/** Android 12 and later. `device-transfer` is a direct move to a new phone. */
export const EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <include domain="database" path="RKStorage" />
    <include domain="sharedpref" path="." />
  </cloud-backup>
  <device-transfer>
    <include domain="database" path="RKStorage" />
    <include domain="sharedpref" path="." />
  </device-transfer>
</data-extraction-rules>
`;

/** Android 11 and earlier. */
export const FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <include domain="database" path="RKStorage" />
  <include domain="sharedpref" path="." />
</full-backup-content>
`;

/** What the two files are called, without the extension. */
export const EXTRACTION_NAME = 'data_extraction_rules';
export const FULL_BACKUP_NAME = 'backup_rules';

/** The manifest, as Expo's mod gives it. */
type Manifest = Parameters<Parameters<typeof withAndroidManifest>[1]>[0][
  'modResults'
];

/**
 * One manifest in, the same manifest naming both rule files, out.
 *
 * Separate from the plugin so a test can run it, as `withBuildMemory.ts`
 * does.
 */
export function nameBackupRules<T extends Manifest>(manifest: T): T {
  const application = manifest.manifest.application;
  // Nothing to change rather than a guess at where the tag should go.
  if (application === undefined) return manifest;

  return {
    ...manifest,
    manifest: {
      ...manifest.manifest,
      application: application.map((tag) => ({
        ...tag,
        $: {
          ...tag.$,
          'android:allowBackup': 'true',
          'android:dataExtractionRules': `@xml/${EXTRACTION_NAME}`,
          'android:fullBackupContent': `@xml/${FULL_BACKUP_NAME}`,
        },
      })),
    },
  };
}

export const withBackupRules: ConfigPlugin = (config) => {
  const named = withAndroidManifest(config, (manifestConfig) => ({
    ...manifestConfig,
    modResults: nameBackupRules(manifestConfig.modResults),
  }));

  return withDangerousMod(named, [
    'android',
    async (dangerous) => {
      const xml = path.join(
        dangerous.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.mkdir(xml, { recursive: true });
      await fs.writeFile(
        path.join(xml, `${EXTRACTION_NAME}.xml`),
        EXTRACTION_RULES,
      );
      await fs.writeFile(
        path.join(xml, `${FULL_BACKUP_NAME}.xml`),
        FULL_BACKUP_CONTENT,
      );
      return dangerous;
    },
  ]);
};

export default withBackupRules;
