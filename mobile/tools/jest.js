#!/usr/bin/env node
/**
 * Runs the render tests.
 *
 * Jest's own `bin/jest.js` is a wrapper around `import-local`, which
 * exists to hand a globally installed jest over to a locally installed
 * one. There is no global jest here — the runner is a devDependency and
 * the script that calls this file is in the same package — so the wrapper
 * has nothing to decide.
 *
 * It is skipped because it is the fragile part. `import-local` reaches
 * `pkg-dir`, which reaches `find-up`, and this project links its
 * dependencies flat (`nodeLinker: hoisted`, see `pnpm-workspace.yaml`).
 * A flat tree holds one version of a name at the top and nests the rest,
 * and an install that ends with `find-up` nested somewhere else fails
 * before jest starts:
 *
 *     Error: Cannot find module 'find-up'
 *     Require stack:
 *     - node_modules/pkg-dir/index.js
 *     - node_modules/import-local/index.js
 *     - node_modules/jest/bin/jest.js
 *
 * The package the tests actually need is `jest-cli`, and it is reached
 * here by name, which is one resolution rather than three.
 */

// What the bin does before it hands over. Jest reads it, and a component
// under test may read it too.
process.env.NODE_ENV ??= 'test';

require('jest-cli').run();
