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
 * forgotten. Each field has its own block of digits: patch is worth 1, minor
 * 100, major 100,000. The last digit is the build tier, which leaves room for
 * ten of them and keeps every code of one release adjacent.
 *
 * The blocks are what keep it monotonic, so each has a limit: patch below 100,
 * minor below 1000. Past either, the next version up borrows the block above it
 * and two different versions get one code.
 *
 * Major was worth 10,000 until 0.54.3, which gave minor only its own hundred
 * slots — and minor was already at 54. `0.100.0` and `1.0.0` both came to
 * 100001, so whichever shipped second would not install over the first. The
 * weight is 100,000 now. No 0.x code changes, because major is zero in all of
 * them.
 *
 * `plugins/withAbiSplits.ts` adds one more digit below this one, for the
 * architecture. The two together reach Android's ceiling of 2,100,000,000 at
 * version 210.0.0.
 */
export function versionCodeFor(version: string, tier: BuildTier): number {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return (major * 100_000 + minor * 100 + patch) * 10 + BUILD_TIERS[tier];
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
