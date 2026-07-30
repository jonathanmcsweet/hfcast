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
 * The two builds each release produces.
 *
 * One APK carries one minimum Android version, so covering both old and new
 * devices takes two of them: `legacy` installs on Android 5.0 and up, `modern`
 * on 7.0 and up. Same source, same package name, different dependency sets.
 *
 * The numbers are the last digit of the version code, and their order is not
 * arbitrary. Where a store offers both APKs under one listing it picks by
 * minimum version, and requires the one with the *higher* minimum to carry the
 * higher code. So `modern` has to be the larger number.
 */
export const BUILD_TIERS = { legacy: 0, modern: 1 } as const;

export type BuildTier = keyof typeof BUILD_TIERS;

/**
 * The integer Android compares to decide what is an upgrade.
 *
 * `versionName` is only ever shown to people; this is the one that decides
 * whether a new build installs over an old one. Two releases sharing a code
 * means the second will not install, which is a release nobody can take.
 *
 * Derived from the version rather than tracked by hand, so it cannot be
 * forgotten: each minor is worth 100 and each patch 1, which stays monotonic as
 * long as neither passes 99. The last digit is the build tier, which leaves
 * room for ten of them and keeps every code of one release adjacent.
 */
export function versionCodeFor(version: string, tier: BuildTier): number {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return (major * 10_000 + minor * 100 + patch) * 10 + BUILD_TIERS[tier];
}

export const APP_VERSION_CODE = config.expo.android?.versionCode ?? 0;

/**
 * Which of the two builds this one is, read back out of its own version code.
 *
 * Nothing in the app behaves differently because of it. It exists so that a
 * person reporting a problem can say which APK they have, since the two carry
 * the same version name and differ only in how old a device they run on.
 */
export const BUILD_TIER: BuildTier =
  APP_VERSION_CODE % 10 === BUILD_TIERS.legacy ? 'legacy' : 'modern';
