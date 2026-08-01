# Development guide

Read the [quick start](quick-start.md) first. It installs the tools and
makes one build. This document explains how the parts fit together and
how to make a change safely.

## The three parts

| Directory        | What it is             | Language                       |
| ---------------- | ---------------------- | ------------------------------ |
| `app/`           | The application        | TypeScript, React Native, Expo |
| `server/`        | The prediction API     | TypeScript, Node               |
| `hfcast-engine/` | The propagation engine | Rust                           |

The engine is a different git repository. It is not a submodule. The
application finds it at `hfcast-engine/` beside the application
directory, and `.gitignore` excludes that path.

This has two results that you must remember:

- To build the application you must clone both.
- A change to the engine is a different commit in a different
  repository. Continuous integration reads the engine at a fixed commit,
  which is `ENGINE_COMMIT` in `.github/workflows/release.yml` and in
  `ci.yml`. If your change needs a newer engine, move the pin in the
  same pull request.

## How the engine gets into the application

The application does not call the server on Android. It has the engine
in it.

```
app/modules/hfcast-engine/
├── rust/           A small Rust crate. It calls the engine and gives a
│                   Java interface (JNI).
├── build-rust.sh   Builds that crate one time for each processor type.
├── android/        The Kotlin module that loads the libraries.
└── src/            The TypeScript that the application calls.
```

`build-rust.sh` writes four `.so` files into
`android/src/main/jniLibs/`. They are not in git. Run the script again
after a change to the engine or to the JNI crate.

The web build and iOS have no engine. They read from the server.

## Two builds, one source

`app/package.json` targets Expo SDK 57 and Android 7.0.
`app/legacy/package.json` targets Expo SDK 50 and Android 5.0,
because it is the last version of React Native that supports Android
5.0.

Every line of `src/`, `test/`, `modules/` and `app.json` is the same for
both. Only the dependencies are different. So a change to `src/` must
operate with React 18 and React 19.

```bash
tools/build-android.sh          # both
tools/build-android.sh modern   # Android 7.0 and later
tools/build-android.sh legacy   # Android 5.0 and later
```

Only the modern build is published now. See the roadmap.

## Before you commit

Run these in `app/`:

```bash
pnpm test        # 344 tests, Node's own test runner
pnpm typecheck   # tsc --noEmit
```

And these at the top of the repository:

```bash
pnpm fmt:check   # dprint
pnpm lint        # biome
```

In `hfcast-engine/`:

```bash
cargo test
tools/analyze.sh          # the static analysis suite
tools/analyze.sh --gate   # the same, but it fails on a broken gate
```

Continuous integration runs all of these.

## The engine has more tests than the application

The engine is a translation of 22,800 lines of Fortran. The proof that
the translation is correct is a set of harnesses that compare it against
the original, cell by cell. They need `voacapl` built on the machine.

| Harness       | What it proves                                     |
| ------------- | -------------------------------------------------- |
| `portcheck`   | 463,104 printed cells over 96 test paths           |
| `fuzz`        | complete listing files from generated inputs       |
| `areacheck`   | the area coverage rows the map is drawn from       |
| `archcheck`   | the engine against itself on a different processor |
| `paritycheck` | the fields the application reads                   |

`hfcast-engine/docs/port.md` explains each one, and has a list of every
way a result has been wrong before.

**If you change the engine, run `portcheck` and `archcheck`.** A change
that moves one number can move the map.

## The static analysis suite

`hfcast-engine/tools/analyze.sh` runs clippy, a complexity measurement,
a duplication check, coverage, and a search for public items that
nothing uses.

Two of the steps are gates. The gates fail on **change**, not on state,
because most of `src/voacap/` is one Rust function for each Fortran
subroutine and that code cannot satisfy a threshold written for new
code.

`hfcast-engine/docs/analysis.md` explains which lints must never be
applied. Some of them would break the agreement with the Fortran.

## Rules for a change

**Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Use the
imperative mood, lower case, and no full stop at the end.

```
feat(app): add a low light theme
fix(engine): correct the LUF scan
docs: record the publishing decisions
```

**Increase the version number** for each part you change, with
[semantic versioning](https://semver.org). The application and the
engine have different version numbers. The application has its version
in three files: `app/package.json`, `app/legacy/package.json` and
`app/app.json`. A test fails if they disagree.

`app.json` also has `versionCode`, which Android compares. The pattern
is `minor * 1000 + patch * 10 + 1`.

**Write the open work in `docs/roadmap.md`.** That file holds only work
that is not finished. When you finish something, write it in
`docs/roadmap-progress.md` with the date and the version, and delete the
section from the roadmap. The engine repository has the same two files
for its own work.

## Style

The application is TypeScript, and it is functional first:

- Use `map`, `filter` and `reduce` instead of a `for` loop when you
  build a value.
- Use `const`, not `let`.
- Build a new value. Do not change an existing one.

Where a loop stays, write a comment that says what it does that the
functional form cannot.

Network state goes in React Query. All other state goes in Zustand.

The interface must satisfy WCAG, must translate, and must operate on a
telephone and on a tablet. `app/test/contrast.test.ts` measures the
contrast of each colour pair that the design puts on the screen.

## Documents

Write in ASD-STE100 Simplified Technical English. Use short sentences
and simple words. Do not use idioms: a reader who learned English
recently, or a translator, cannot always understand them.
