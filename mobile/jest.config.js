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
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/render/**/*.test.tsx'],
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
