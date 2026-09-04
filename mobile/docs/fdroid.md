# Building HFcast for F-Droid

F-Droid builds every app from source on its own machines and signs it with
their key, so the recipe here has to produce an APK from this repository and
the engine's, and nothing else.

Everything the APK carries is made during the build. `jniLibs/` is gitignored
the same way `android/` is, `modules/engine-bridge/build-rust.sh` writes the
four `libhfcast_jni.so` files, and the ionospheric coefficients under
`hfcast-engine/embedded/` are compiled into the library by `include_bytes!`,
so the build runs one step more than a plain React Native app and has no
binary to strip out.

## Building it by hand

Four commands from `mobile/`, in this order, since `prebuild` generates the
Gradle project that packages the libraries and so has to follow them:

```bash
pnpm install --frozen-lockfile
modules/engine-bridge/build-rust.sh      # needs cargo and the Android NDK
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease
```

`build-rust.sh` wants the NDK and four Rust targets:

```bash
sdkmanager 'ndk;27.1.12297006'
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

## Android 7 and later only

A release makes two APKs, `android7` on Expo SDK 57 and `android5` on Expo
SDK 50 for the devices React Native 0.81 dropped, and only the first goes to
F-Droid, because the legacy build has never been run on a device. It still
goes to GitHub releases, and adding it here later is four more `Builds:`
entries carrying 0 as the last version-code digit rather than 1.

## The recipe

The recipe is
[`docs/fdroid/io.github.jonathanmcsweet.hfcast.yml`](fdroid/io.github.jonathanmcsweet.hfcast.yml)
with the srclib beside it at
[`docs/fdroid/hfcast-engine.yml`](fdroid/hfcast-engine.yml). Both belong in
F-Droid's own `fdroiddata` and are kept here so they move with the build they
describe.

**`subdir: mobile`, not `mobile/android`.** F-Droid runs `prebuild` inside
`subdir` and the directory has to be in the checkout, while `android/` only
exists once `expo prebuild` has made it.

**The engine arrives as a srclib.** `rust/Cargo.toml` asks for the published
crate, but the Android build turns on `embedded-coefficients` and the
published crate carries no coefficient files, so F-Droid clones the engine
repository beside the app and `build-rust.sh` takes the crate from there
through `HFCAST_ENGINE`, the same variable the CI workflows use.

**Node comes from nodejs.org with its checksum**, which is the pattern
F-Droid's React Native guide asks for and works around Debian's own Node
being too old for Expo SDK 57.

**The scan is answered by deleting rather than by promising.** Between
`prebuild` and `build` the scanner walks the tree, in paths relative to the
repository root rather than to `subdir`, and rejects every prebuilt binary.
`scanignore` asks a reviewer to take our word that a file is unused, while
deleting it shows the same thing by the build still working, so
`tools/fdroid-prune.sh` runs in `prebuild` and removes around 1.5 GB that
this build never opens:

- the four prebuilt Skia packages, and Expo's eight precompiled modules
- everything for Apple, which is most of the count: Expo's xcframework
  tarballs, React Native's binary string packs for its own iOS strings, and
  the macros plugin's compiled tool
- host tools for other operating systems, meaning `dotslash` and `hermesc`
  built for macOS and Windows, and the Gradle wrappers other packages carry
- TypeScript's native compiler, which types the source and builds nothing

`build-rust.sh` sits in `build` rather than `prebuild` for a related reason,
since running it earlier would land its Rust object files and the engine
library before the scan, and all 38 of them are binaries the scan refuses.

**`scanignore` covers the seven files that have to stay.** Five packages
declare a maven repository at `node_modules/react-native/android`, a path
React Native has not published to since moving to Maven Central, and the
sixth is React Native's own publishing script; the scanner reads the text
rather than the resolved path, so it reports a repository that is not on its
allowlist. Deleting them is not an option, because `scandelete` removes the
whole file for any problem and these are the build files of async-storage,
safe-area-context, svg, vector-icons and expo-modules-core, which fails the
Gradle configuration with nothing said about why.

The seventh is `hermesc` for linux64, the one prebuilt binary this build
really runs, and it compiles the JavaScript bundle to Hermes bytecode on the
build machine without any part of it entering the APK.

**Expo's modules are built from source.** SDK 57 ships eight of them as
`.aar` files under `node_modules/*/local-maven-repo/`, which is faster and is
one thing F-Droid will not take: the scanner deletes prebuilt binaries out of
the source tree, and it strips maven repositories outside its allowlist of
twenty remote ones plus Debian's own local repository, which a `file://`
repository inside `node_modules` is not. Expo reads the setting from
`package.json` alone, with no flag and no environment variable, so
`tools/expo-build-from-source.mjs` writes it in during `prebuild` and nowhere
else, which keeps `build-android.sh` and a local `gradlew assembleRelease` on
the faster precompiled path.

**Skia is not in the APK.** `@shopify/react-native-skia` was 13.9 MB of every
install and 214 MB of prebuilt static libraries with no source beside them,
and the map now draws on Android's own Canvas through `modules/cell-canvas`,
which is the same Skia the operating system has carried since version 1.0.
The exclusion in `package.json` is what does it, since autolinking finds
native code by scanning `node_modules` rather than by following imports.
Web draws with Skia still, from CanvasKit, which is a download rather than
part of any APK.

### One entry per architecture

`plugins/withAbiSplits.ts` builds one APK per architecture and gives each its
own version code, `variant.versionCode * 10 + abiCode`, with the ABI digits
fixed at armeabi-v7a 1, x86 2, arm64-v8a 3 and x86_64 4. F-Droid wants one
`Builds:` entry per APK, so a release is four entries differing only in the
architecture they ask for and the code they carry.

`CurrentVersionCode` is the highest of the four, and every device is offered
the APKs it can run and takes the highest of those, so an arm64 phone gets
the arm64-v8a build rather than the armeabi-v7a one it could also install.

### Keeping it in step

`AutoUpdateMode: None` keeps anything from regenerating the recipe when a
version moves here, and `tools/check-fdroid-pin.sh` compares the two on every
push and in CI:

```
engine       v1.6.1 matches Cargo.lock
versionName  1.7.0 matches app.json
commit       v1.7.0
versionCodes 10070011 10070012 10070013 10070014
recommended  10070014
changelogs   four present, all within 500 bytes
```

After `tools/bump-version.sh` it fails until the recipe's `versionName`,
`commit`, four `versionCode` lines and `CurrentVersionCode` have moved and
the four changelog files have been renamed.

## Store text, changelogs and screenshots

F-Droid reads `<subdir>/fastlane/metadata/android/<locale>/`, and `subdir` is
`mobile`, so `mobile/fastlane/metadata/android/en-US/` is already where it
looks; the icon comes from the APK.

Changelogs are named for the version code, `changelogs/10070013.txt`, and are
truncated past 500 characters, with one per architecture, so a release writes
the same text to four files.

Screenshots go beside the changelogs in two directories that do not exist
yet:

```
mobile/fastlane/metadata/android/en-US/phoneScreenshots/
mobile/fastlane/metadata/android/en-US/tenInchScreenshots/
```

### Taking them

`tools/screenshots.sh` runs the whole capture. It hides the two system
bars, applies the screen override for that set, prompts for each shot, and
puts the device back afterwards, including when the run is interrupted:

```bash
tools/screenshots.sh --check    # what this device holds, changes nothing
tools/screenshots.sh phone      # the four phone captures
tools/screenshots.sh tablet     # the one ten inch capture
```

The script holds the list of shots a release needs, so that list lives in
one place rather than in somebody's memory. It stops before each capture
and waits, so the app is set up by hand between shots, and naming one
retakes it on its own:

```bash
tools/screenshots.sh phone 03-forecast-low-light
tools/screenshots.sh phone 03
```

The set is the forecast in each of the three themes, the radio settings
scrolled to the antenna, and one ten inch capture of the wide
arrangement.

Two things end up in a capture that the app does not draw. The status bar
carries whatever notifications are waiting, and one of them is always the
USB debugging notice, which cannot be dismissed while adb is attached. The
navigation bar sits at the bottom. The script hides both, two ways at once
because neither works everywhere: `policy_control` hides them outright,
which every build honoured until Android 11 dropped it and some still do,
and demo mode replaces the status bar with a fixed clock and a full
battery. GrapheneOS does not always honour demo mode either. `--check`
reads the Android version and says which to expect; the clock reading
12:00 during a run is the quick test of whether demo mode took. If a
device refuses both, capture with the bars and crop them off, which
F-Droid does not mind because it puts no constraint on screenshot
dimensions.

A ten inch capture needs no ten inch tablet. `wm size` makes Android
report a different screen to the app, which then lays out and draws as a
tablet. The override is clamped to twice the physical size on each axis
separately, so asking an 800x1280 panel for 2560x1600 gives 1600x1600:
the width is cut to twice 800, and the height is already under twice 1280.
The script gives the override the same way up as the panel, at 1600x2560,
and forces the rotation to landscape instead, which comes back as the
2560x1600 the listing wants.

The phone set overrides the screen too, to 1080x2400 at density 420,
which is 412x915 in points: the telephone `test/rotation.test.ts` is
written around. So one tablet produces both sets, and both come back the
same size whichever device took them.

The tablet arrangement is the reason to capture it rather than reuse a
phone shot: past 900 points across, the band grid moves to the right of
the map card instead of sitting below it, and no phone capture shows that.

### Letting maestro drive

`--auto` hands the app to [maestro](https://maestro.dev) instead of
prompting, running the flow in `maestro/` for that device:

```bash
tools/screenshots.sh tablet --auto
```

Everything above still applies. Maestro captures the framebuffer like
anything else, so it sees the same two system bars, and the script hides
them and restores the device around the run either way. What changes is
only who works the app.

Maestro is a standalone binary needing Java 11 or later, and nothing in
this repository depends on it, so the manual path keeps working without
it:

```bash
curl -Ls https://get.maestro.mobile.dev | bash
```

The flows are checked for shape, not against a device:

```bash
maestro check-syntax maestro/phone.yaml
```

That catches an unknown command or a bad direction, and cannot tell
whether a selector matches anything real. The flows match on the English
strings the app draws, so they hold for `en-US` and would need their own
selectors for another locale. `maestro hierarchy` dumps what the device
actually exposes when one of them finds nothing.

## Testing the recipe before submitting

`fdroid build` needs no F-Droid machine: without `--server` it calls
`build_local()` and runs on the host, which is what
[`.github/workflows/fdroid.yml`](../../.github/workflows/fdroid.yml) does on
every push that touches the recipe, assembling a minimal `fdroiddata`,
pointing `commit` at the pushed SHA and building arm64-v8a. `--stop` matters
there, because `fdroid build` exits 0 even when a build fails and a broken
recipe would pass CI in silence.

By hand, install `fdroidserver`, clone `fdroiddata`, drop both files in and
build one architecture:

```bash
fdroid build --test --no-tarball --stop io.github.jonathanmcsweet.hfcast:10070013
```

Two parts of the recipe need F-Droid's own build server. The `sudo:` block is
skipped without `--server`, so Node, Rust's Android target and the NDK have
to be on the machine already, and that block is the one piece nothing here
exercises.

The other is `gradle`, which on their machines is `gradlew-fdroid`,
downloading the Gradle the project asks for and checking it against a list of
known hashes. Debian's `fdroidserver` 2.2.1 carries a copy of that list
stopping at 8.0.2 while `expo prebuild` writes a wrapper asking for 9.3.1, so
a local run stops with "No hash for gradle version 9.3.1". That is the
packaged tool being old rather than a fault in the recipe, since
`gradlew-fdroid` has moved to its own repository, its list now runs past 9.5,
and it also fetches checksums from F-Droid's gradle transparency log at run
time; put a real Gradle 9.3.1 on PATH to get past it locally.

Running the four commands under **Building it by hand** in a clean checkout
catches most of what would fail and is much faster. The likeliest first
failure is the NDK, since `build-rust.sh` looks for
`$ANDROID_HOME/ndk/27.1.12297006` and `NDK_VERSION` overrides the version
where F-Droid's layout differs.

## Submitting

A merge request against `gitlab.com/fdroid/fdroiddata` adding
`metadata/io.github.jonathanmcsweet.hfcast.yml` and `srclibs/hfcast-engine.yml`.
Expect review rounds, because a Rust and NDK prebuild with a srclib is more
than their automated checks usually see.
