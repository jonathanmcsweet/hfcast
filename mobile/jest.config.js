/**
 * The render tests, and only those.
 *
 * The rest of the suite is `node --experimental-strip-types --test` over
 * `test/*.test.ts`, which is enough for a pure module and cannot mount a
 * component: Node strips types but does not compile JSX, and a React
 * Native module is not loadable in plain Node. So a component test needs
 * babel and a preset that knows the platform, which is what this is.
 *
 * Kept apart by file name rather than by folder alone — `*.test.tsx` here,
 * `*.test.ts` there — so neither runner can pick up the other's tests.
 */
const expoPreset = require('jest-expo/jest-preset');

// jest-expo names the packages under `node_modules` that babel may
// compile. Everything else is read as written, and the `@formatjs`
// polyfills the app loads for Hermes now ship as ES modules, which this
// runner cannot read. Adding them to the list compiles them like the
// application code, so a render test loads what the app loads.
const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map((
  pattern,
) => pattern.replace('(?!', '(?!@formatjs|'));

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/render/**/*.test.tsx'],
  transformIgnorePatterns,
  // `legacy/` is a second app that shares this name, and `build/` holds a
  // copy of this one. Both make the module map ambiguous, and neither is
  // ever imported from a test.
  modulePathIgnorePatterns: ['<rootDir>/legacy/', '<rootDir>/build/'],
  // Files in `shared/` live above this package, so the ordinary walk up
  // from a file to its dependencies passes this package's `node_modules`
  // and finds nothing. Babel's own helpers are the ones that go missing,
  // which stops any test mounting a component that reaches shared code.
  // Naming this directory outright resolves them from where they are.
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  setupFilesAfterEnv: ['<rootDir>/test/render/setup.ts'],
};
