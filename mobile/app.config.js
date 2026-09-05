/**
 * A second application, for testing, from the same source.
 *
 * `app.json` stays the whole configuration and `tools/bump-version.sh` keeps
 * writing to it. This only reads what is there and changes three fields, and
 * only when asked:
 *
 *     HFCAST_DEV=1 tools/build-android.sh modern
 *
 * The package name is what Android identifies an app by, so a build with a
 * different one installs beside the release rather than over it. That means
 * a test build no longer costs an uninstall and reinstall from Obtainium,
 * and the two keep separate settings, which is the other half of the point:
 * testing a migration no longer disturbs the real one.
 *
 * The label changes too, or the launcher shows two identical icons.
 */
module.exports = ({ config }) => {
  if (process.env.HFCAST_DEV !== '1') return config;

  return {
    ...config,
    name: 'HFcast dev',
    android: {
      ...config.android,
      package: 'io.github.jonathanmcsweet.hfcastdev',
    },
  };
};
