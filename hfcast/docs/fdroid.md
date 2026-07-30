# Building HFcast for F-Droid

F-Droid builds every app from source on its own machines and signs with its own
key. Nothing prebuilt may be used. This is what that requires here, and what it
does not.

## Nothing to remove

The four `libhfcast_jni.so` files are **not** in the repository. `jniLibs/` is
gitignored the same way `android/` is, and `modules/hfcast-engine/build-rust.sh`
produces them. So there is no binary blob to strip out — the build simply has to
run one more step than a plain React Native app.

Everything the engine needs at run time is source too: the coefficient files
under `hfcast-engine/embedded/` are data compiled into the library by
`include_bytes!`, not a downloaded artifact.

## The extra step

Three things have to happen before Gradle runs, in this order:

```bash
pnpm install --frozen-lockfile
modules/hfcast-engine/build-rust.sh      # needs cargo and the Android NDK
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease
```

`build-rust.sh` needs the NDK and four Rust targets:

```bash
sdkmanager 'ndk;26.1.10909125'
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

`prebuild` must run after the libraries exist, because it is what generates the
Gradle project that packages them.

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
  - versionName: 0.29.0
    versionCode: 1
    commit: v0.29.0
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
      - hfcast-engine@<commit>
    prebuild:
      - cd .. && pnpm install --frozen-lockfile
      - cd .. && modules/hfcast-engine/build-rust.sh
      - cd .. && npx expo prebuild --platform android --no-install

AutoUpdateMode: Version
UpdateCheckMode: Tags
```

The store text is in `fastlane/metadata/android/en-US/`, which F-Droid reads
directly.

## Two things to settle first

**The engine is a separate repository.** `hfcast-engine` is where the Rust lives,
and the app depends on it by path. F-Droid needs it as a `srclib` pinned to a
commit, or the two repositories merged. Neither is done.

**`versionCode` is 1 and has never moved.** F-Droid, Play and Android itself all
use it to decide what is an upgrade; `versionName` is only ever shown to people.
Shipping two releases with the same code means the second will not install over
the first. It needs to increment on every published build, which is a release
step nothing currently performs.
