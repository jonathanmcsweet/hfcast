# Quick start — build the application and install it

This makes the Android APK files. The build needs no Android Studio and
no emulator.

Approximately 15 minutes, plus the downloads. The first build also
downloads the Android NDK, which is 2.5 GB.

## Before you start

You need a Linux or macOS machine with:

- 8 GB of free memory. 4 GB is not sufficient. The build stops with the
  message `Gradle build daemon disappeared unexpectedly`, which does not
  mention memory.
- 15 GB of free disk space.
- `git`, `curl` and `unzip`.

## 1. Get the two repositories

```bash
git clone https://github.com/jonathanmcsweet/hfcast.git
cd hfcast
git clone https://github.com/jonathanmcsweet/hfcast-engine.git
```

You now have this:

```
hfcast/                <- the repository you cloned
├── mobile/            <- the application, for Android and the web
├── server/
├── docs/
└── hfcast-engine/     <- the engine, a second repository
```

The application depends on the published `hfcast` crate, but an APK has
the ionospheric coefficients compiled in and the published crate does
not carry them. So the Android build takes the crate from this checkout.
See [development.md](development.md).

## 2. Install the tools

**Node.js 24 and pnpm.**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 24
corepack enable pnpm
```

**Rust, and the four Android targets.**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

**A Java 17 development kit.**

```bash
curl -L -o /tmp/jdk.tar.gz \
  'https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse'
mkdir -p ~/jdk17 && tar -xzf /tmp/jdk.tar.gz -C ~/jdk17 --strip-components=1
```

**The Android tools.** The `cmdline-tools/latest` directory name is
necessary. `sdkmanager` refuses to operate from a different path.

```bash
curl -L -o /tmp/cmdline-tools.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
mkdir -p ~/android-sdk/cmdline-tools
unzip -q /tmp/cmdline-tools.zip -d ~/android-sdk/cmdline-tools
mv ~/android-sdk/cmdline-tools/cmdline-tools ~/android-sdk/cmdline-tools/latest

export JAVA_HOME=~/jdk17
export ANDROID_HOME=~/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

yes | sdkmanager --licenses
sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' \
           'ndk;27.1.12297006'
```

Put the three `export` lines in your shell profile. The build needs
them each time.

## 3. Build

From the `mobile` directory:

```bash
cd mobile
pnpm install
tools/build-android.sh modern
```

The files are in `build/apk/`. There are four, one for each processor
type:

| File                            | For                                                 |
| ------------------------------- | --------------------------------------------------- |
| `...-arm64-v8a.apk`             | almost all telephones made after approximately 2016 |
| `...-armeabi-v7a.apk`           | older 32-bit ARM devices                            |
| `...-x86_64.apk`, `...-x86.apk` | emulators, and some Intel tablets                   |

Each file has the JavaScript and the engine in it. The application
operates with no development server.

### If the build stops

The build has too many compiler processes for the memory of the
machine. Limit the processors it uses:

```bash
HFCAST_BUILD_CPUS=0-3 tools/build-android.sh modern
```

This is necessary because the C++ step reads the number of processors
directly. No Gradle setting changes it.

## 4. Install

With a USB cable:

```bash
adb install build/apk/hfcast-*-arm64-v8a.apk
```

Or copy the file to the telephone and open it. Android asks for
permission to install applications from the application that opened the
file.

**A build with no key is a debug build.** Android will not replace a
debug build with a signed build, or a signed build with a debug build.
To change from one to the other, remove the application first. You lose
your settings. To make signed builds, see
[publishing-setup.md](publishing-setup.md), step 4.

## To operate it without a telephone

The web build needs the server, because it has no engine in it.

```bash
pnpm install
pnpm dev:app
```

This starts the server and the application together, and stops the
server when you exit. Then press `w` for the browser.

The server needs `voacapl` and an `itshfbc` data tree on the machine.
See [server/README.md](../server/README.md).
