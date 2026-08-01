# Task: draw the coverage cells on a canvas, then run the fine grid over the whole world

You are building two things, in order, as separate deliverables:

1. **A canvas cell renderer.** Replace the per-cell SVG views in the
   coverage map with one Skia canvas. This removes the view-count wall:
   today every cell is one native view, so cell count is capped near a
   thousand; a canvas draws any count in a handful of draw calls.
2. **The whole-world fine grid.** With the wall removed, run the whole
   globe at the 1.25 × 1.5 degree step (34,560 points) and draw it as
   the map's cell field, with the coarse grid painting first while it
   runs.

**The fallback posture is part of the design.** If deliverable 2 is too
slow on a phone (the gate in Milestone 3 defines "too slow"), the
product backs off to a fine grid over the visible frame only — and
keeps deliverable 1, which is worth having alone. Structure the work so
deliverable 1 never depends on deliverable 2.

Read `docs/roadmap.md` and `docs/roadmap-progress.md` before starting.
The ledger records several things this plan relies on; check it before
assuming anything is open.

## What exists, and the numbers that motivate this

All measured 2026-07-31 on this desktop (16 cores, ~8 GB), engine
0.59.3. A phone is 1.7 to 3.4 times slower per the calibration in the
app ledger.

| grid                      |   points | engine, 1 process | engine, server (8 strips) |
| ------------------------- | -------: | ----------------: | ------------------------: |
| coarse world, 15 × 22.5   |      192 |             20 ms |                left whole |
| patch, ±10° at 1.25 × 1.5 | ~240–640 |          13–25 ms |                left whole |
| fine world, 1.25 × 1.5    |   34,560 |          1,300 ms |                    231 ms |

So: fine world on a phone ≈ 2–4.5 s on one thread. The drawing side is
the harder wall: 34,560 cells as SVG is 34,560 native views and ~8 MB
of path strings, which fails rather than slows.

Existing pieces you must reuse, not rebuild:

- **Engine.** `hfcast-engine` (separate repo, pinned by `ENGINE_COMMIT`
  in `.github/workflows/ci.yml`). Area mode takes `latMin`/`latMax`/
  `lonMin`/`lonMax`, and emits points **south to north, west to east**,
  row by row — proven and relied on by the server's sharding. Splitting
  a grid into latitude strips is **exact**: 34,560 points as strips
  differ from one whole run at zero points. Do not modify the engine
  repo for this task.
- **Server sharding.** `server/src/voacap/shard.ts` — `latShards()`
  cuts a grid into whole-row strips with a quarter-cell inset;
  `runCoverage()` in `server/src/voacap/engine.ts` runs them
  concurrently. Grids under `MIN_SHARD_POINTS = 2000` are left whole.
- **Viewport patch.** `app/src/data/coveragePatch.ts` (mirrored
  byte-identically in `server/src/coveragePatch.ts`, pinned by
  `server/test/shared-with-app.test.ts`): `patchGrid()` snaps a view
  region to the engine lattice; `useCoveragePatch` in
  `app/src/api/queries.ts` follows the map view. This machinery is
  the fallback tier — do not remove it.
- **The map.** `app/src/components/CoverageGlobe.tsx`: SVG layers in
  order — coarse cells, patch backing, patch cells, NVIS dots, night,
  coast, rings, path, markers. View state is `{scale, cxF, cyF}`
  (`MapView` in `src/data/projection.ts`), `MIN_SCALE = 1`,
  `MAX_SCALE = 30`. `projection.ts` owns the projector (closed-form
  `invert`), `regionOf`, `containView`.
- **The native module.** `app/modules/hfcast-engine/` — Kotlin +
  a Rust JNI wrapper around the engine crate. `predict()` runs on **one
  worker thread by design**; the comment in `HfcastEngineModule.kt`
  explains why. Changing that is Milestone 2 work and the comment must
  be rewritten honestly when you do.
- **The legacy build.** One source tree ships as two APKs
  (`tools/build-android.sh`): modern on Expo SDK 57 for Android 7.0+,
  and legacy on Expo SDK 50 / React Native 0.73 / React 18 for
  Android 5.0+ — kept for Fire OS 5 tablets. They share every line of
  `src/`, so anything you write must typecheck and pass tests under
  React 18 as well as 19. The check runs in the copy under
  `build/legacy-app/`: refresh it the way `build_legacy()` does, then
  `pnpm typecheck && pnpm test` there. Run it before any commit that
  touches `src/`.
- **Sentences stay coarse-derived.** `reachOf` (the "N% of the world"
  figure) is computed from the coarse grid only, and the NVIS reach
  sentence from a station-anchored patch query. Neither changes in this
  task. The fine globe changes what is _drawn_, not what is _said_.

## Binding process rules

- Never push and never run `gh`; the user creates remotes.
- Stage with `git add -A -- . ':!AGENTS.md'`. AGENTS.md changes need
  the diff shown and approved first.
- Conventional commits; bump each touched package per semver; Android
  `versionCode` follows `(major*10000 + minor*100 + patch)*10 + tier`,
  tier 1. End commit messages with a `Co-Authored-By:` trailer naming
  your model.
- Before each commit: `pnpm fmt:check`, `pnpm lint` (repo root), `tsc`
  typechecks and tests in both `app/` and `server/`, all green.
  Node and pnpm are at `/home/dev/.nvm/versions/node/v24.18.0/bin`
  (not on PATH). Never pipe pnpm output.
- Each finished milestone gets a ledger entry in
  `docs/roadmap-progress.md` with measured numbers; roadmap.md holds
  only open work.
- Functional-first, immutability-first TypeScript. React Query for
  network state, Zustand for app state. No inline foreign-language
  code.
- Mirrored files stay byte-identical below their marker and pinned by
  `server/test/shared-with-app.test.ts`. If you mirror shard arithmetic
  into the app, pin it the same way.
- i18n for any new user-facing text. WCAG: the canvas has no element
  tree, so the text equivalents (the sentences, the legend, the table)
  remain the accessible answer — do not weaken them, and preserve any
  accessibility props the map container has today.
- When done, offer the **web build** for the user to test before
  building APKs. APK builds need `JAVA_HOME=~/jdk17`,
  `ANDROID_HOME=~/android-sdk` on PATH and `HFCAST_BUILD_CPUS=0-3`.
  This host has ~8 GB RAM and no browser; the user does the looking.

## Milestone 0 — the Skia spike

Nothing else starts until this passes. The stack is Expo ~57 /
React Native 0.86.2 / React 19.2.3, which is newer than any
compatibility table you remember. Verify, do not assume.

1. Install `@shopify/react-native-skia` with `npx expo install` so the
   version is chosen against this SDK. Record the version.
2. Render a test shape (not the map) on: the web build
   (`expo export --platform web` must still pass CI's bundle check —
   note CanvasKit is a WASM asset of roughly 1 MB gzipped and needs
   lazy loading via the library's web loader), and an Android build.
3. Record in the ledger: package version, web bundle delta, APK size
   delta per ABI.

Also answer, without building anything on it: does the library
install and bundle under the **legacy** tree (React Native 0.73)?
The expected answer is no, and the design below assumes no — the
legacy build keeps the SVG renderer. If the answer is somehow yes,
say so in the ledger and still keep the SVG path: the legacy tier's
devices are the ones least able to afford a second rendering stack.

**Exit gate:** a Skia shape renders on web and Android; deltas
recorded. **If the library does not support RN 0.86 yet, stop and
report** — the options (pin an older RN? wait? another canvas?) are the
user's call, not yours.

## Milestone 1 — the cell field on canvas

Replace the four cell layers (coarse cells, patch backing, patch
cells, NVIS dots) with one Skia canvas **under** the existing SVG. The
SVG keeps everything that is cheap and fiddly: night cap (even-odd
subpaths), coast, rings, path line, markers — about 200 elements.

- **One transform, one owner.** Both layers must map lat/lon to screen
  identically. Write a single function in `projection.ts` that takes
  `(view, size)` and returns both the SVG `viewBox` string and the
  Skia matrix (translate + uniform scale). Unit-test that a projected
  point lands on the same screen pixel through both. Misregistration
  between cells and coastlines is the failure mode a reader notices
  first.
- **Bucket by paint, not by cell.** Group cells by quality (four
  ramps), build one Skia path per bucket, plus one for the patch
  backing and one for the NVIS dots. Cell count then costs path
  _build_ time, not draw calls. Build paths in a memo keyed on the
  data, never per frame. If JSI per-op cost makes path building slow,
  `Skia.Path.MakeFromSVGString` parses the strings `pathOf` already
  produces — measure both, keep the faster.
- **Parity is the test.** Same ramp colours, same opacities, the
  opaque `ui.card` backing under the patch (cells are translucent — the
  backing bug is in the ledger, do not reintroduce it), same clipping
  at the disc edge. Compare screenshots on the web build against the
  SVG version.
- **The SVG cell renderer stays, as the legacy renderer.** The legacy
  build (React Native 0.73) will not take Skia, and its devices are
  the reason it exists. Choose the renderer the way the engine module
  is chosen — by availability, `requireOptionalNativeModule`-style,
  not by platform sniffing — so one component tree serves both builds.
  The cost of two renderers is drift; contain it by keeping every
  decision that could drift (cell geometry, bucketing by quality, ramp
  colours, backing) in shared data-layer functions both renderers
  consume, so each renderer is only a draw loop. The parity screenshot
  comparison doubles as the drift check.
- Gestures do not change: the `PanResponder` lives on the wrapper
  `View`.

**Exit gate:** visual parity confirmed by the user on the web build;
pan and zoom at least as smooth as before; all tests green. This
milestone must land as its own commit(s) — it is the part the product
keeps even if Milestone 3 backs off.

## Milestone 2 — the whole-world fine tier

- **Query.** `useFineGlobe(from, band, hour)` — settled hour, **no
  region in the key**: the whole point is that pan and zoom never
  refetch. On device it calls the native module; on web it calls the
  server, whose sharding already answers in ~231 ms.
- **Data model: columnar, not objects.** 34,560 point objects are tens
  of MB of JS heap per hour. The lattice is regular and the row order
  is guaranteed, so store `{latMin, latStep, lonMin, lonStep, nx, ny,
  reliability: Float32Array, takeoffAngleDeg: Float32Array}` — about
  280 KB per hour — and compute lat/lon from the index. Convert in the
  query function so the raw objects are never cached. Pin the
  index-to-lat/lon arithmetic against real engine output in a test
  that runs when the engine binary is present (the pattern is
  `server/test/engine.test.ts`).
- **Device concurrency.** One thread is 2–4.5 s. The module's
  single-worker queue is a deliberate design ("one intention at a
  time"); preserve its spirit with a batch call: `predictMany(requests)` in Kotlin runs one batch on an internal pool (measure 2 and 4
  threads on hardware, not the emulator — the emulator is 5–10× slow
  and its ratios lie). The app cuts the grid with the same latitude-
  strip arithmetic as the server — mirror `shard.ts` into the app and
  pin it byte-identical, like `coveragePatch.ts`. Add a test that a
  sharded device run equals an unsharded one point for point when the
  engine is present. An alternative is to shard inside the Rust JNI
  wrapper; take it only if `predictMany` measures badly, and say why
  in the ledger.
- **Server.** Reuse `runCoverage` with the fine steps (sharding
  engages automatically above 2,000 points). Mind the cache:
  `server/src/coverage.ts` caches up to 400 entries and a fine result
  is ~2.2 MB — give fine results their own cache with a small entry
  cap (~20) so the server cannot grow to a gigabyte.
- **Progressive paint.** The coarse query is unchanged and paints
  immediately; the fine field replaces the coarse _cells_ when it
  arrives (no backing needed — coarse cells are simply not drawn under
  it). The viewport patch stays enabled **only** when its chosen step
  is finer than 1.25° (deep zoom, the 0.625 rung); otherwise its query
  is disabled while a fine globe is present.
- **Memory.** Cap cached hours (React Query `gcTime`) so a 24-hour
  sweep holds a few hours of typed arrays, not 24 × parsed JSON.
  Measure heap before and after a sweep and record it.

**Exit gate:** fine globe drawn on web and on the user's phone;
numbers recorded: time-to-fine (hour change → field drawn), coarse
paint time, JS-thread stalls, heap delta, APK/web unchanged from
Milestone 1.

## Milestone 3 — the decision gate, per device at runtime

One ship-time decision would be wrong somewhere: the range of devices
runs from the user's phone (1.7–3.4× this desktop, where the fine
globe projects to 1–2 s threaded) to quad-A53 Fire tablets (roughly
8–12× this desktop, where it projects to 4–6 s threaded and fails).
So the decision is made **per device, at run time**, from measurement
the app already produces: the coarse coverage run is 192 points —
time it, keep a smoothed per-point cost (persist it; use a median of
recent runs so one thermally-throttled run does not flip the answer),
and enable the fine globe only where the projected whole-globe time
fits the budget. The same number scales the visible-frame patch
budget where the globe is off ("the points affordable in ~250 ms",
clamped, and still gated by zoom so the pinned default-view test
keeps passing untouched). Legacy-build devices never see the globe:
they keep the SVG renderer and today's tiers, with no code asked to
decide anything.

Validate the gate on real hardware at both ends — the user's phone
and the slowest device available — not the emulator. The fine globe
is allowed on a device only if all of:

- time from settled hour-change to fine field drawn ≤ **2.5 s**, with
  the coarse field visible within **300 ms**;
- pan/zoom stays smooth (transform-only redraws, no path rebuilds);
- no single JS-thread stall over ~100 ms from data arrival;
- steady-state heap growth over a 24-hour sweep ≤ ~40 MB.

Where a device misses, the runtime gate keeps it on **the visible
frame**: Milestone 1's canvas stays, `useFineGlobe` stays off there
(web/server keep the fine globe — the server answers in 231 ms), and
the viewport patch widens instead. The widening that makes
sense with the view-count wall gone: raise `MAX_PATCH_POINTS` to
roughly 2,000–5,000 and `PATCH_HALF_LAT_DEG` toward 30, **but** gate
the budget by zoom so the default whole-globe view keeps today's grid
byte-identical — the pinned test
`runs the default view at the step the fixed patch always used`
must keep passing untouched. That rule ("the budget grows only when
the reader zooms in") is the design; the constants are the knob.

## Milestone 4 — records and cleanup

- Ledger entries per milestone with the measured numbers.
- roadmap.md: delete what shipped from the "fine grid over the whole
  world" section; leave only what is genuinely open. Update the canvas
  trigger note — it will have been executed or consciously deferred.
- Remove dead SVG cell code and any spike scaffolding.
- Versions: bump `hfcast` (minor — new capability) and `server` if
  touched; move nothing in `hfcast-engine`.
- Offer the web build first, then APKs on request.

## Risks, with their handling

- **Skia does not support RN 0.86 yet.** Milestone 0 exists to find
  this out for the price of a spike. Stop and report; do not pin
  random forks.
- **CanvasKit load on web.** ~1 MB gzipped, loaded lazily. Decide what
  the map shows before it loads (nothing? the coarse SVG kept only for
  this?) and say so in the ledger. Do not block app startup on it.
- **Layer misregistration.** The shared transform function plus its
  unit test is the defence; verify visually at 1× and 30× against the
  coastline.
- **JSI path-build cost.** Measure before optimising;
  `MakeFromSVGString` is the escape hatch; per-row batching after
  that. A raster approach (an SkSL shader sampling the lattice as a
  texture, one draw for any N) is the endgame if path building loses —
  note it as future work rather than building it first.
- **Emulator numbers lie.** GPU emulation is software; timing ratios
  from the emulator have misled this project before (see the ledger).
  Hardware for every Milestone 3 number.
- **The build host is small.** ~8 GB RAM, 16 cores, no browser.
  `HFCAST_BUILD_CPUS=0-3` for APKs; the user tests anything visual.
- **The low end is a hard floor, not a slow lane.** The 2014
  Fire HD 6 is Android 4.x-class and out of reach of any React Native
  this project can use (the ledger records this); the oldest devices
  that install anything get the legacy APK, which this plan leaves
  exactly as it is today. Quad-A53 tablets on the modern APK get the
  canvas (a win there: fewer native views, less memory, transform-only
  pan) and the runtime gate keeps the fine globe away from them.
  Repeated multi-second all-core engine runs on such hardware are a
  battery and heat cost as well as a wait — the gate exists for that
  too.
