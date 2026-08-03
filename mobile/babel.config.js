/**
 * Reanimated's plugin is here because Skia needs it, not because
 * anything in this app animates.
 *
 * `@shopify/react-native-skia` lists `react-native-reanimated` as an
 * optional peer, and its Canvas does check whether one is present before
 * using it. But the package's main entry ends with
 * `export * from "./external"`, and that re-export enumerates a Proxy
 * whose only purpose is to throw "react-native-reanimated is not
 * installed!". The enumeration happens while the module loads, so the
 * check never runs: on a device the whole JavaScript bundle failed and
 * the app showed a blank screen with no error on it.
 *
 * Reanimated 4 does its work through `react-native-worklets`, and this
 * plugin is what turns a worklet into something the second runtime can
 * run. It has to be last in the list.
 *
 * Looked up rather than named outright, because this file is shared with
 * the legacy build. That build has no Skia, so it has no reanimated and
 * no worklets either, and naming a plugin that is not installed fails
 * the build before it starts. This is a Node configuration file rather
 * than app code, so asking whether the package is there is a question
 * that can actually be answered here — unlike inside the bundle, where
 * imports are followed before any check can run.
 */
const worklets = (() => {
  try {
    require.resolve('react-native-worklets/plugin');
    return ['react-native-worklets/plugin'];
  } catch {
    return [];
  }
})();

module.exports = (api) => {
  api.cache(true);
  return { presets: ['babel-preset-expo'], plugins: worklets };
};
