# Building HFcast for F-Droid

F-Droid builds every app from source on its own machines and signs with its own
key. Nothing prebuilt may be used. This is what that requires here, and what it
does not.

## Nothing to remove

The four `libhfcast_jni.so` files are **not** in the repository. `jniLibs/` is
gitignored the same way `android/` is, and `modules/engine-bridge/build-rust.sh`
produces them. So there is no binary blob to strip out — the build simply has to
run one more step than a plain React Native app.

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

## Two APKs, one source

A release produces two: `android7`, on Expo SDK 57, and `android5`, on Expo
SDK 50 for devices React Native 0.81 no longer supports. `tools/build-android.sh`
builds both, and the commands above are what it runs for the first.

The second needs its own `Builds:` entry, because it is a different dependency
set. F-Droid supports several builds of one version as long as the version codes
differ, which they do: the last digit is 0 for the legacy build and 1 for the
modern one.

**F-Droid is the one channel that chooses for the user.** Its index carries each
APK's minimum SDK and architectures, and the client reads the device's Android
version and processor and offers a package that fits. Nobody has to know which
file they need.

One thing to watch: the client marks one version as recommended, and if the
recommended one is incompatible with an old device, the app can appear as
"Incompatible" in search results even though a version it could install exists
on the app's own page. That is a reported client behaviour rather than something
this recipe can fix, and it argues for saying in the store text that Android 5
and 6 devices are supported.

## Metadata

The build recipe belongs in F-Droid's own `fdroiddata` repository, not here, as
`metadata/solutions.cloudburner.hfcast.yml`. Its shape, for whoever writes it:

```yaml
Categories:
  - Science & Education
License: Apache-2.0
SourceCode: <the repository>
IssueTracker: <the tracker>

RepoType: git
Repo: <the repository>

Builds:
  - versionName: 0.30.0
    versionCode: 30001
    commit: v0.30.0
    subdir: hfcast/android
    sudo:
      - apt-get update
      - apt-get install -y rustup
    init:
      - rustup target add aarch64-linux-android armv7-linux-androideabi
          i686-linux-android x86_64-linux-android
    gradle:
      - yes
    srclibs:
      - hfcast-engine@v<engine version>
    prebuild:
      - cd .. && pnpm install --frozen-lockfile
      - cd .. && modules/engine-bridge/build-rust.sh
      - cd .. && npx expo prebuild --platform android --no-install

  # The Android 5.0 build. Same commit, same source; what differs is the
  # dependency set and the two files that select it.
  - versionName: 0.30.0
    versionCode: 30000
    commit: v0.30.0
    subdir: hfcast/android
    sudo:
      - apt-get update
      - apt-get install -y rustup
    init:
      - rustup target add aarch64-linux-android armv7-linux-androideabi
          i686-linux-android x86_64-linux-android
    gradle:
      - yes
    srclibs:
      - hfcast-engine@v<engine version>
    prebuild:
      - cd .. && cp legacy/package.json package.json
      - cd .. && cp legacy/pnpm-lock.yaml pnpm-lock.yaml
      - cd .. && node --experimental-strip-types tools/legacy-config.ts app.json
      - cd .. && pnpm install --frozen-lockfile
      - cd .. && ANDROID_API=21 modules/engine-bridge/build-rust.sh
      - cd .. && npx expo prebuild --platform android --no-install

# Two builds per release, so a version tag does not describe one build.
AutoUpdateMode: None
UpdateCheckMode: Tags

# The one the client recommends. It has to be the modern build: every device
# that can run it should get it, and the older devices fall back to the build
# they can run.
CurrentVersion: 0.30.0
CurrentVersionCode: 30001
```

The Android 5.0 APK would install on a modern phone as well — a low minimum
never excludes a newer device — but it should not be the one they get. It
targets API 34, so Android applies compatibility behaviour instead of its
current rules, and it is built on a framework release that receives no fixes.
That is a reasonable trade for reaching a 2016 tablet and a bad one for reaching
a 2026 phone. Which is the whole reason there are two: `CurrentVersionCode`
points at the modern build, and F-Droid gives each device the best it can run.

The store text is in `fastlane/metadata/android/en-US/`, which F-Droid reads
directly.

## One thing to settle first

**The engine is a separate repository.** `hfcast-engine` is where the Rust lives,
and the app depends on it by path. F-Droid needs it as a `srclib`, or the two
repositories merged. Neither is done. The `srclib` takes the release tag of the
version in `mobile/modules/engine-bridge/rust/Cargo.lock`, which is how this
repository pins the engine everywhere else.
