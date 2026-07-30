import app from '../../app.json' with { type: 'json' };

/**
 * The version this build reports, read from the one place that sets it.
 *
 * `app.json` is what `expo prebuild` writes into the Android manifest, so taking
 * it from there means the About screen and the installed package can never
 * disagree — which they would if this were a constant somebody had to remember
 * to bump twice.
 */
const config = app as unknown as {
  expo: { version?: string; android?: { versionCode?: number; }; };
};

export const APP_VERSION = config.expo.version ?? 'unknown';

/**
 * The integer Android compares to decide what is an upgrade.
 *
 * `versionName` is only ever shown to people; this is the one that decides
 * whether a new build installs over an old one. Two releases sharing a code
 * means the second will not install, which is a release nobody can take.
 *
 * Derived from the version rather than tracked by hand, so it cannot be
 * forgotten: each minor is worth 100 and each patch 1, which stays monotonic as
 * long as neither passes 99.
 */
export function versionCodeFor(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return major * 10_000 + minor * 100 + patch;
}

export const APP_VERSION_CODE = config.expo.android?.versionCode ?? 0;
