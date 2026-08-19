# Agents.md — guidance for AI agents working in this repo

## Your behavior

- Never modify this document without consulting the user first
- Explain things in concise, plain english free of technical jargon.
- Use technical terms accurate to the domain terms in the codebase
- When making technical decisions, do not give weight to development cost or development hours. Instead prefer readability, quality, simplicity, robustness, scalability, testability, and long term maintainability
- when writting code comments or commit messages, be extremely concise. Favor concision over proper grammar.

## Who the users are

HFcast is for amateur radio operators who use both new and old, cheap, low-power
Android devices as assistants. Many operate in the field: field days, hikes,
portable stations, etc. An old Fire HD 7 is a real target device, not an
edge case. De-googled devices are also a normal target.

What this means for every change:

- Never assume a fast device. Performance work must hold on weak
  hardware, and where a number depends on the device, measure it on the
  device rather than fixing it from a fast one.
- Battery and heat are features. A field device may have no charger nearby,
  so processor time spent for nothing is a cost the user feels.
- The app must work with no network. A hilltop may have none.

## Open work and progress

`docs/roadmap.md` is the SINGLE SOURCE of open work — deferred features and known gaps, each with the constraint that motivated deferral. It must survive a compacted or cleared session, so keep it current instead of holding state in your head:

- At the start of a task, read the roadmap to see current status; at the end,update it so the next agent (or the next session) picks up an accurate picture.
- When you finish a roadmap item, record it in **`docs/roadmap-progress.md`**
  (the completions ledger: date, section title, version, branch, short
  as-built note) and DELETE the finished section from roadmap.md
- NO completion notes, RESOLVED markers, or progress pointers
  in roadmap.md, ever
- it holds only open work. A partially finished item keeps a section describing only what is still open, with the
  shipped half recorded in the ledger.
- When you defer new work, add a roadmap section describing it and why. **Check the ledger before assuming an item is open**
- Do not create new progress-tracker docs for multi-stage builds without the user asking

## Core coding principles

- Always use a function-first immutability-first coding style unless the developer approves of you not doing so
- Use pure functional programming style unless the developer approves of you not doing so. A function is pure when:
  1. the function return values are identical for identical arguments (no variation with local static variables, non-local variables, mutable reference arguments or input streams, i.e., referential transparency), and
  2. the function has no side effects (no mutation of non-local variables, mutable reference arguments or input/output streams).
- Effects that cannot be avoided belong at the edges of the code
- Use the DRY principle (reducing redundancy by ensuring that every piece of knowledge has a single, authoritative representation in a system) unless the excess abstraction complicates the code by creating unnecessary layers that make it harder to understand, modify, test.

## Build and verify

Node 24 and pnpm. Three packages: `mobile/`, `server/`, and the tooling
at the top.

```bash
pnpm install --frozen-lockfile
pnpm fmt:check                 # dprint
pnpm lint                      # biome
pnpm --dir mobile typecheck    # tsc --noEmit
pnpm --dir mobile test         # both suites: node:test, then jest
pnpm --dir mobile test:render  # jest alone; it mounts components
pnpm --dir server typecheck
pnpm --dir server test
pnpm test:e2e                  # web export + Playwright, ~5 minutes
pnpm test:e2e:only             # Playwright against the existing export
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

Three files hold the application version and have to agree
(`mobile/package.json`, `mobile/legacy/package.json` and
`mobile/app.json`). Move them with the script, never by hand. The server
and the tooling project at the top hold their own versions, which the
script does not touch:

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

`mobile/pnpm-workspace.yaml` carries an `overrides:` block that pins a
number of Expo's transitive dependencies past versions Dependabot
flagged (fast-xml-parser, uuid, brace-expansion, js-yaml, postcss,
fast-uri, semver, send, @xmldom/xmldom, tar). `pnpm audit` runs in the
pre-commit and pre-push hooks, so a newly vulnerable transitive
dependency will fail a commit or push before it reaches CI. When working
in `mobile/`, check whether the package that pulls in each pinned
dependency (`@expo/metro-runtime`, `expo`, `expo-asset`, and so on) has
since bumped its own requirement past the override. If it has, drop the
override rather than leaving it in place — `pnpm --dir mobile why
<package>` shows who still asks for the old version.

`.github/dependabot.yml` opens version-update PRs for `/`, `/mobile`
and `/server` — the three directories with their own standalone pnpm
project. `mobile/legacy/` is left out on purpose: it has a
`package.json` and a `pnpm-lock.yaml` but no `pnpm-workspace.yaml` of
its own, so it is not a project pnpm (or Dependabot) can install in
place. Its lockfile is only ever regenerated by
`tools/build-android.sh legacy`, which copies `mobile/pnpm-workspace.yaml`
into a scratch tree alongside `legacy/package.json` and
`legacy/pnpm-lock.yaml`, runs `pnpm install --no-frozen-lockfile`
there, and copies the result back — so overrides added above cover
`mobile/legacy/` too the next time that runs, but nothing scans it on
its own between runs. Audit it by hand with the same steps whenever
checking on dependency vulnerabilities in `mobile/`.

## Looking at the app in a browser

`.mcp.json` declares a Playwright MCP server. It lets an AI agent open
the web build, read the page and press things, instead of only reading
the test output. The agent asks to start it the first time.

Once per machine, download the browser the server needs:

```bash
node tools/setup-mcp.mjs
```

Do not use `npx playwright install chromium` for this. Run in this
repository, that resolves the e2e suite's Playwright and downloads that
suite's browser build, which is a different build than the server asks
for. The server then starts and every page fails to open. The script
installs through the server's own pinned package, so the two always
agree.

That is the whole setup when the folder your editor has open is this
repository: `.mcp.json` here names `tools/mcp-playwright.sh`, which
finds node itself, so the server starts whether or not the editor was
given a PATH with node on it.

Two other situations need one more step.

The editor has a parent folder open — a workspace that holds this
repository next to others, as the development container does. The
editor then looks for `.mcp.json` at that root and never sees the one
committed here. Declare the server there:

```bash
node tools/setup-mcp.mjs <folder the editor has open>
```

This writes `.mcp.json` in that folder, pointing at the launcher by its
full path. The file may hold servers for other projects, so only the
`playwright` entry is written and everything else is kept.

The agent is not Claude Code. Any MCP client that can start a stdio
server can use `tools/mcp-playwright.sh` as the command, with no
arguments and no environment. Put that in whatever file your client
reads; the server side needs nothing more.

To find out whether a clone is ready, and what is wrong when it is not:

```bash
node tools/check-mcp.mjs                        # server and browser
node tools/check-mcp.mjs http://127.0.0.1:8099  # and a running build
```

The editor says only that the server did not connect, which is the same
message for every cause. This says which one it is: the command was not
found, the browser is missing, or the page did not open.

Use it against the web build, the same one the e2e tests read:

```bash
cd mobile && pnpm web:export && npx expo serve dist --port 8099
```

The version is pinned, in `tools/mcp-playwright.sh`. Dependabot does not
read that file, so nothing will report a new one — check for a newer
version by hand from time to time with `npm view @playwright/mcp
version`. A new version can ask for a browser build that is not on the
machine yet, so after moving the pin run `node tools/setup-mcp.mjs`
again, and then `node tools/check-mcp.mjs`.

Three options in that script are set on purpose. `--browser chromium`
uses the browser the install command downloads; without it the server
looks for Google Chrome in the system and fails where there is none.
`--headless` draws nothing; remove it to watch the browser work.
`--isolated` keeps the browser profile in memory, so no profile
directory is left behind. Page snapshots are written to
`.playwright-mcp/`, which git ignores.

Ask for a screenshot without giving it a name. The two cases are filed
differently on purpose. A screenshot with no name is the server's own
working material, so it goes to the output directory. A screenshot with
a name is a file you asked for, so it goes to the top of the workspace
the editor reports — the top of this repository — and `--output-dir`
does not move it. Images at the top are ignored as well, so a named one
does no harm, but an unnamed one is filed with the rest.

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

## UX

- Use the Material UI/UX framework
- WCAG compliance is required
  - If a feature can't be WCAG compliant, propose an alternative for users that need it. I.e. a table for those who can't see a graph
- i18n compatability is a must
- **Everything must work on both mobile and tablet. And for the web version in all sizes**
