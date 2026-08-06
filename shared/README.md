# shared

The physics both projects have to agree on.

The app computes forecasts on the device with the engine compiled in, and
the server computes them for the web build, which has no engine. Both
therefore need the same fitted correction factors, the same mode
thresholds, the same coverage lattice and the same Maidenhead maths. Two
copies of any of those give one station two different forecasts depending
on which path answered, and nothing on screen says which it was.

They used to be copies. `server/test/shared-with-app.test.ts` held them
together by reading the app's TypeScript as **text**, pulling constants
out with regular expressions, and comparing the tail of two files
character for character. It caught changed numbers in the five files it
named. It did not catch `ANTENNA_ORDER`, which it did not name and which
had drifted, or the power ceiling, which the app documented as the
server's and was not.

## What may live here

Modules with **no dependencies at all** — not on React, not on
`node:` builtins, not on either project's types. Pure values and pure
functions. Anything that needs a platform belongs to whichever project
has one.

## How it is reached

By relative path with an explicit `.ts` extension:

```ts
import { PATCH_LAT_STEP } from '../../../shared/coveragePatch.ts';
```

Three things make that work, and all three were already true:

- Node's type stripping runs the server's sources directly, so an import
  has to name the file it loads. Both projects already set
  `allowImportingTsExtensions`.
- Metro resolves the extension too. `mobile/src/theme.ts` has imported
  `./palette.ts` this way for as long as the theme has existed.
- Metro will not look outside the project directory unless it is told to,
  so `mobile/metro.config.js` names this directory in `watchFolders`.

The `package.json` here says one thing, `"type": "module"`, and exists for
one reason. TypeScript decides a file's module format from the nearest
`package.json` above it, and without this it read these files as CommonJS
while the server is ESM and refused every export. That is the "TypeScript
reads it as CommonJS" half of the reason the copies existed; it is seven
lines.

This is still not a workspace member. `pnpm-workspace.yaml` has no
`packages:` key, so `pnpm install` does not see this directory, and
neither project depends on it by name. Making them workspace members
would change how installs behave in both, which is a larger change than
the problem needs.

The legacy Android build works in a copy of `mobile/` under `build/`, so
`tools/build-android.sh` links this directory in beside that copy — the
same thing it already does for the engine checkout.
