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
[`docs/fdroid/solutions.cloudburner.hfcast.yml`](fdroid/solutions.cloudburner.hfcast.yml)
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

They have to be PNG or JPEG with an extension matching the format, since a
WebP file is rejected whatever it is called and so is a JPEG named `.png`,
and the ones under `docs/screenshots/` are JPEG and WebP behind `.png` names,
so they cannot be copied across. Order is by filename, which is why the
examples below are numbered.

### Taking them

`adb exec-out screencap -p > shot.png` captures the framebuffer, status bar
and navigation bar included. F-Droid has no rule about either and most
listings keep them, though demo mode gives a clean and repeatable bar in
place of whatever the phone happened to be showing:

```bash
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1200
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false

adb exec-out screencap -p > phoneScreenshots/01-forecast.png

adb shell am broadcast -a com.android.systemui.demo -e command exit
```

GrapheneOS does not always honour demo mode, so check it before planning a
set of captures around it.

A ten inch capture needs no tablet. Android reports a different screen to the
app, which then lays out and draws as a tablet, and the capture comes back at
the size asked for:

```bash
adb shell wm size 2560x1600      # a 10 inch tablet, landscape
adb shell wm density 320         # 1280x800 in dp, which is what the layout reads
adb exec-out screencap -p > tenInchScreenshots/01-forecast.png

adb shell wm size reset
adb shell wm density reset
```

The tablet layout puts the readout, the map and the clock on one screen,
which is the arrangement `MapSlot`'s 380 point cap exists for, so it is worth
capturing rather than reusing a phone shot.

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
fdroid build --test --no-tarball --stop solutions.cloudburner.hfcast:10070013
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
`metadata/solutions.cloudburner.hfcast.yml` and `srclibs/hfcast-engine.yml`.
Expect review rounds, because a Rust and NDK prebuild with a srclib is more
than their automated checks usually see.
