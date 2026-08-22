# Building HFcast for F-Droid

F-Droid builds every app from source on its own machines and signs with its own
key. Nothing prebuilt may be used. This is what that requires here, and what it
does not.

## Nothing to remove

The four `libhfcast_jni.so` files are **not** in the repository. `jniLibs/` is
gitignored the same way `android/` is, and `modules/engine-bridge/build-rust.sh`
produces them, so there is no binary to strip out and the build simply runs one
more step than a plain React Native app.

Everything the engine needs at run time is source too: the coefficient files
under `hfcast-engine/embedded/` are data compiled into the library by
`include_bytes!`, not a downloaded artifact.

## The extra step

Three things have to happen before Gradle runs, in this order:

```bash
pnpm install --frozen-lockfile
modules/engine-bridge/build-rust.sh      # needs cargo and the Android NDK
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease
```

`build-rust.sh` needs the NDK and four Rust targets:

```bash
sdkmanager 'ndk;27.1.12297006'
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

`prebuild` must run after the libraries exist, because it is what generates the
Gradle project that packages them.

## The Android 7 build only

A release produces two APKs, `android7` on Expo SDK 57 and `android5` on Expo
SDK 50 for devices React Native 0.81 no longer supports. **Only the first goes
to F-Droid**, because the legacy build has never been tested on a device. It
still goes to GitHub releases, so nobody loses it.

The consequence is that Android 5 and 6 devices see HFcast as incompatible in
the F-Droid client rather than being offered a build that might not work. If the
legacy build is ever tested, adding it is four more `Builds:` entries with the
last version-code digit 0 instead of 1.

## The recipe

It lives at [`docs/fdroid/solutions.cloudburner.hfcast.yml`](fdroid/solutions.cloudburner.hfcast.yml),
with the srclib beside it at
[`docs/fdroid/hfcast-engine.yml`](fdroid/hfcast-engine.yml). Both belong in
F-Droid's own `fdroiddata` repository and are kept here so they move with the
build they describe.

Seven things in them are worth knowing about, because each is a decision rather
than boilerplate:

**`subdir: mobile`, not `mobile/android`.** F-Droid runs `prebuild` inside
`subdir`, and the directory has to exist in the checkout. `android/` does not
exist until `expo prebuild` makes it.

**The engine arrives as a srclib.** `rust/Cargo.toml` asks for the published
crate, but the Android build turns on `embedded-coefficients` and the published
crate does not carry those files. F-Droid clones the engine repository beside
the app and `build-rust.sh` takes the crate from there, through the same
`HFCAST_ENGINE` variable the CI workflows use.

**Node comes from nodejs.org with its checksum**, not from a package
repository. Debian's own Node is too old for Expo SDK 57, and this is the
pattern F-Droid's React Native guide asks for.

**The scan is answered by deleting, not by promising.** The scanner walks the
tree between `prebuild` and `build` and rejects every prebuilt binary it
finds, and its paths are relative to the repository root rather than to
`subdir`. Two ways out of that: `scanignore`, which asks a reviewer to take
our word that a file is unused, and deleting the file, which shows the same
thing by the build still working. `tools/fdroid-prune.sh` runs in `prebuild`
and deletes what this build genuinely does not read, around 1.5 GB of it:

- the four prebuilt Skia packages, and Expo's eight precompiled modules
- everything for Apple, which is most of the count. Expo ships xcframework
  tarballs, React Native ships binary string packs for its own iOS strings,
  and the macros plugin ships a compiled tool
- host tools for other operating systems: `dotslash` and `hermesc` built for
  macOS and Windows, and the Gradle wrappers other packages carry
- TypeScript's native compiler, which types the source and builds nothing

`build-rust.sh` sits in `build` rather than `prebuild` for a related reason.
Run earlier, its Rust object files and the engine library would land before
the scan, and all 38 of them are binaries the scan refuses.

**`scanignore` covers seven files that have to stay.** Five packages declare
a maven repository at `node_modules/react-native/android`, a path React
Native has not published to since it moved to Maven Central, and the sixth is
React Native's own publishing script. The scanner reads the text rather than
the resolved path, so it reports a repository that is not on its allowlist.
Deleting is not an option for those: `scandelete` removes the whole file for
any problem, and these are the build files of async-storage,
safe-area-context, svg, vector-icons and expo-modules-core, so losing them
fails the Gradle configuration with nothing to say why.

The seventh is `hermesc` for linux64, and it is the one prebuilt binary this
build really does run: it compiles the JavaScript bundle to Hermes bytecode.
It runs on the build machine and no part of it enters the APK, which is the
argument a reviewer will want to see made.
**Expo's modules are built from source.** SDK 57 ships eight of them as `.aar`
files under `node_modules/*/local-maven-repo/`, which is faster and is one
thing F-Droid will not take. Two separate checks reject it: the scanner
deletes prebuilt binaries out of the source tree, and it strips maven
repositories that are not on its allowlist, which is twenty remote ones plus
Debian's own local repository. A `file://` repository inside `node_modules` is
neither.

Expo reads this setting from `package.json` alone, with no flag and no
environment variable, so `tools/expo-build-from-source.mjs` writes it in during
`prebuild`. **It runs nowhere else**, which is what keeps `build-android.sh` and
a local `gradlew assembleRelease` on the faster precompiled path. Nothing in the
repository carries the setting.

**Skia is not in the APK at all.** `@shopify/react-native-skia` was 13.9 MB of
every install and 214 MB of prebuilt static libraries with no source beside
them, which F-Droid cannot build and would not accept. The map now draws on
Android's own Canvas through `modules/cell-canvas`, which is the same Skia:
the operating system has carried it since version 1.0. `package.json` excludes
the package from Android autolinking, because autolinking finds native code by
scanning `node_modules` rather than by following imports, so dropping the last
import would not have been enough. Web still draws with Skia, from CanvasKit,
which is a download and never enters an APK.

### One entry per architecture

`plugins/withAbiSplits.ts` builds one APK per architecture and gives each its
own version code, `variant.versionCode * 10 + abiCode`, with the ABI digits
fixed at armeabi-v7a 1, x86 2, arm64-v8a 3, x86_64 4. F-Droid wants one
`Builds:` entry per APK, so a release is four entries that differ only in the
architecture they ask for and the code they carry.

`CurrentVersionCode` is the highest of the four. Every device sees the APKs it
can run and takes the highest of those, so an arm64 phone gets the arm64-v8a
build rather than the armeabi-v7a one it could also install.

### Keeping it in step

`AutoUpdateMode: None`, so nothing regenerates the recipe when a version moves
here. `tools/check-fdroid-pin.sh` compares the two on every push and in CI:

```
engine       v1.6.1 matches Cargo.lock
versionName  1.7.0 matches app.json
commit       v1.7.0
versionCodes 10070011 10070012 10070013 10070014
recommended  10070014
changelogs   four present, all within 500 bytes
```

After `tools/bump-version.sh`, expect it to fail until the recipe's
`versionName`, `commit`, four `versionCode` lines and `CurrentVersionCode` have
moved and the four changelog files have been renamed.

## Store text, changelogs and screenshots

F-Droid reads `<subdir>/fastlane/metadata/android/<locale>/`, and `subdir` is
`mobile`, so `mobile/fastlane/metadata/android/en-US/` is already where it
looks. No icon is needed there because F-Droid takes one from the APK.

Changelogs are named for the version code, `changelogs/10070013.txt`, and are
**truncated past 500 characters**. There is one per architecture, so a release
writes the same text to four files.

Screenshots go beside the changelogs, in two directories that do not exist
yet:

```
mobile/fastlane/metadata/android/en-US/phoneScreenshots/
mobile/fastlane/metadata/android/en-US/tenInchScreenshots/
```

They must be **PNG or JPEG, with an extension that matches the format**: a
WebP file is rejected whatever it is called, and so is a JPEG named `.png`.
The ones under `docs/screenshots/` are the wrong way round on both counts, so
they cannot simply be copied. Order is by filename, which is why the examples
below are numbered.

### Taking them

`adb exec-out screencap -p > shot.png` captures the framebuffer, which includes
the status bar and the navigation bar. F-Droid has no rule against either, and
most listings keep them, but demo mode gives a clean and repeatable bar instead
of whatever the phone happened to be showing:

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

GrapheneOS does not always honour demo mode, so check before planning around
it.

**A tablet screenshot without a tablet.** Android will report a different screen
to the app, so the phone lays out and draws as a tablet and the capture comes
back at the size asked for:

```bash
adb shell wm size 2560x1600      # a 10 inch tablet, landscape
adb shell wm density 320         # 1280x800 in dp, which is what the layout reads
# the phone looks wrong in your hand here; the framebuffer is what matters
adb exec-out screencap -p > tenInchScreenshots/01-forecast.png

adb shell wm size reset
adb shell wm density reset
```

This is worth doing rather than skipping: the tablet layout puts the readout,
the map and the clock on one screen, and it is the arrangement `MapSlot`'s
380-point cap exists for.

## Testing the recipe before submitting

`fdroid build` does not need F-Droid's machines. Without `--server` it calls
`build_local()` and runs on the host, which is what
[`.github/workflows/fdroid.yml`](../../.github/workflows/fdroid.yml) does on
every push that touches the recipe: it assembles a minimal `fdroiddata`,
points `commit` at the pushed SHA, and builds arm64-v8a.

`--stop` is not optional there. `fdroid build` exits 0 even when a build
fails, so without it a broken recipe passes CI silently.

Two parts of the recipe cannot be checked outside F-Droid's own build server.

The `sudo:` block is skipped without `--server`, so Node, Rust's Android
target and the NDK have to be on the machine already. That block is the one
piece nothing here exercises.

And `gradle` on F-Droid's machines is `gradlew-fdroid`, which downloads the
Gradle the project asks for and checks it against a list of known hashes.
Debian's `fdroidserver` 2.2.1 carries a copy of that list which stops at
8.0.2, while `expo prebuild` writes a wrapper asking for 9.3.1, so a local
run stops with "No hash for gradle version 9.3.1". This is the packaged tool
being old rather than a problem with the recipe: `gradlew-fdroid` moved to
its own repository and its list now runs past 9.5, and it also fetches
checksums from F-Droid's gradle transparency log at run time. Put a real
Gradle 9.3.1 on PATH to get past it locally.

To check by hand, install `fdroidserver`, clone `fdroiddata`, drop both files
in and build one architecture:

```bash
fdroid build --test --no-tarball --stop solutions.cloudburner.hfcast:10070013
```

Running the four commands under **The extra step** in a clean checkout catches
most of what would fail, and is much faster. The likeliest first failure is the
NDK: `build-rust.sh` looks for `$ANDROID_HOME/ndk/27.1.12297006`, and
`NDK_VERSION` overrides the version if F-Droid's layout differs.

## Submitting

A merge request against `gitlab.com/fdroid/fdroiddata` adding
`metadata/solutions.cloudburner.hfcast.yml` and `srclibs/hfcast-engine.yml`.
Expect review rounds, because a Rust and NDK prebuild with a srclib is more than
their automated checks usually see.
