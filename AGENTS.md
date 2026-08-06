# Agents.md — guidance for AI agents working in this repo

## Your behavior

- Speak to me in ASD-STE100 Simplified Technical English
- Write documentation in ASD-STE100 Simplified Technical English
- Be concise, articulate with your language in interactions and avoid idioms that may confuse people who don't know what they mean. Use simple language

## Open work and progress

Open work is tracked by the maintainer outside this repository. Do not
create tracker or progress documents. If you defer work or find a gap,
describe it in the pull request and the maintainer will record it.

## Build and verify

Node 24 and pnpm. Three packages: `mobile/`, `server/`, and the tooling
at the top.

```bash
pnpm install --frozen-lockfile
pnpm fmt:check                 # dprint
pnpm lint                      # biome
pnpm --dir mobile typecheck    # tsc --noEmit
pnpm --dir mobile test
pnpm --dir server typecheck
pnpm --dir server test
pnpm e2e                       # web export + Playwright, ~5 minutes
pnpm e2e:only                  # Playwright against the existing export
```

CI runs all of these, and four more tests that start the engine as a
subprocess and check the JSON contract between it and the server. Those
need `gfortran` and the engine version in
`mobile/modules/engine-bridge/rust/Cargo.lock`, so they skip in a plain
checkout.

Builds, from `mobile/`:

```bash
pnpm web                        # faster to test than an APK
tools/build-android.sh modern   # Android 7.0 and later
tools/build-android.sh legacy   # Android 5.0 and later, not published
```

An APK takes about ten minutes. Offer the web build first.

Four files hold the application version and have to agree. Move them
with the script, never by hand:

```bash
tools/bump-version.sh patch
tools/bump-version.sh --check   # say what the files hold, change nothing
```

Hooks run the checks for you: formatting and lint before a commit, the
typechecks and tests before a push. Turn them on once per clone:

```bash
git config core.hooksPath .githooks
```

The propagation engine is a separate repository with its own tests. This
one pins it by published version, in
`mobile/modules/engine-bridge/rust/Cargo.lock`. It names no engine
commit. Move the pin with
`cargo update -p hfcast --precise <version>` in
`mobile/modules/engine-bridge/rust/`.

## Chores

- Always bump the version number for any part of the product (ex: core and dashboard) based on semantic versioning when commiting your final work to a branch.
- Core and Dashboard do not need to have vesion parity.
- SemVer reference: https://semver.org

## Documentation

- Keep text descriptions short without excessive details unless necessary to prevent confusion
- Refrain from using idiomatic language such as "clobber," "belt and suspenders," etc. which may be read differently by different people

## Branches and Commit messages — use Conventional Commits

- follow the instructions in the ##Documentation section for writing commit messages

- Follow the spec: <https://www.conventionalcommits.org/en/v1.0.0/#specification>

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

- **Allowed types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- **description:** imperative mood, lowercase, no trailing period.
- **Breaking changes:** add `!` after the type/scope (e.g. `feat(create)!:`) and/or
  a `BREAKING CHANGE:` footer.
- **Examples:**
  - `feat(security): add container fingerprint hardening`
  - `fix(create): bind sshd to loopback only`
  - `chore: adopt test/ and lib/ layout`
- End messages with the `Co-Authored-By:` trailer naming the AI model used.

## Before committing

- Run all unit tests
- Run all linting
- Never commit items in `.gitignore`.

## No inline foreign-language code — extract to its own file

- NEVER embed another language (Python, etc.) inline in any other file

## All Typescript, front end and back end

- Always use a functional-first immutability-first coding style (user,
  2026-07-29: this applies to the server too, not only the app)
  - Prefer `map`, `filter` and `reduce` over `for` loops; build new values
    instead of mutating them; `const` over `let`
  - This is about building values. For iteration that only causes side
    effects, biome's `noForEach` requires `for...of` over `.forEach` —
    obey the linter there, or express the check as data instead
  - Where a loop is kept, say in a comment what it does that the
    functional form cannot. Sequencing that must not become concurrent is
    the usual reason

## UI code: Typescript

- All network state management needs to be in React Query
- All non-network app state management needs to be managed by Zustand

## Backend code

- Follow the Typescript rules above

## UX

- Use the Material UI/UX framework
- WCAG compliance is required
  - If a feature can't be WCAG compliant, propose an alternative for users that need it. I.e. a table for those who can't see a graph
- i18n compatability is a must
- **Everything must work on both mobile and tablet.**
