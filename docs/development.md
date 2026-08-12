# Development guide

The [quick start](#quick-start) installs the tools and makes one
build. The rest of this document explains how the parts fit together
and how to make a change safely.

## Quick start

This makes the Android APK files. The build needs no Android Studio and
no emulator.

Approximately 15 minutes, plus the downloads. The first build also
downloads the Android NDK, which is 2.5 GB.

### Before you start

You need a Linux or macOS machine with:

- 8 GB of free memory. 4 GB is not sufficient. The build stops with the
  message `Gradle build daemon disappeared unexpectedly`, which does not
  mention memory.
- 15 GB of free disk space.
- `git`, `curl` and `unzip`.

### 1. Get the two repositories

```bash
git clone https://github.com/jonathanmcsweet/hfcast.git
cd hfcast
```

You now have this:

```
hfcast/                <- the repository you cloned
├── mobile/            <- the application, for Android and the web
├── server/
└── docs/
```

### 2. Install the tools

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

### 3. Build

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

#### If the build stops

The build has too many compiler processes for the memory of the
machine. Limit the processors it uses:

```bash
HFCAST_BUILD_CPUS=0-3 tools/build-android.sh modern
```

This is necessary because the C++ step reads the number of processors
directly. No Gradle setting changes it.

### 4. Install

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

### To operate it without a telephone

The web build needs the server, because it has no engine in it.

```bash
pnpm install
pnpm dev:app
```

This starts the server and the application together, and stops the
server when you exit. Then press `w` for the browser.

The server needs `voacapl` and an `itshfbc` data tree on the machine.
See [server/README.md](../server/README.md).

## Measuring a telephone

The map is drawn from work that can be counted, and until 0.60.0 nobody
could tell which part of it was slow. A Pixel 8 reported 3.9 seconds of
engine time for the whole-world fine grid. The same engine, the same
34,560 points, takes 1.24 seconds on one desktop core and 0.17 across
eight. A telephone core is two or three times slower than a desktop one,
not twenty, so most of that gap was somewhere other than the arithmetic.

There are three places it can be, and they need opposite fixes:

| where        | what it is                                                              |
| ------------ | ----------------------------------------------------------------------- |
| the engine   | the prediction, inside Rust                                             |
| the crossing | turning a 2.9 MB answer into a Java string and handing it to JavaScript |
| the parse    | `JSON.parse` and building 34,560 objects, on the thread that draws      |

So each is timed on its own and written to the Android log. Nothing is
written until something asks for it, so an ordinary run measures nothing.

### Take a measurement

1. Install the APK and open the application.
2. Start the log, on the computer:

   ```bash
   adb logcat -c                    # clear what is already there
   adb logcat -s hfcast:V ReactNativeJS:V > hfcast.log
   ```

   Two tags: `hfcast` is what the engine and the module write, and
   `ReactNativeJS` is where the application's own lines come out.

3. On the telephone: the menu at the top right, then **Diagnostics**,
   then **Measure this device**. It takes under a minute. A box shows
   the result when it finishes, and its copy icon puts the same text on
   the clipboard — so with no cable at all, the summary can still be
   pasted somewhere rather than photographed.
4. Stop the log with Ctrl-C and send `hfcast.log`.

### What the lines mean

```
native | in 412 B 0 ms | predict 214 ms | out 186234 B 41 ms | total 255 ms
batch  | 16 strips | 8 threads asked | 8 at once | wall 980 ms | engine 4310 ms | cpu 3900 ms | 4.4 in flight | 4.0 cores busy | 2380114 chars back
[hfcast] benchmark: fine grid, 4 threads | 34560 points | native 1020 | parse 460 | total 1480
```

The first is one strip, from inside the Rust. `predict` is the
arithmetic; `out` is the boundary, and its size is the answer it had to
convert.

The second is the whole batch, from Kotlin, and it carries two ratios
that answer different questions. `in flight` is engine time divided by
wall time: how many strips were running at the same moment. `cores
busy` is processor time divided by wall time: how many cores the batch
really held. Read them together:

| in flight | cores busy | each strip       | it means                                                    |
| --------- | ---------- | ---------------- | ----------------------------------------------------------- |
| high      | high       | as fast as alone | healthy — the pool works                                    |
| high      | low        | slow             | threads waiting for cores: the scheduler, or thermal limits |
| high      | high       | slow             | cores held but starved — the strips fight over memory       |
| about one | about one  | —                | the pool is not running in parallel at all                  |

A Pixel 8 measured the third row: eight strips in flight, and each one
five times slower than it runs alone. That is memory contention, and
more threads cannot fix it — which is what the benchmark's thread sweep
is for. It runs the same grid at 1, 2, 4 and the map's own thread
count; where the total stops falling is the count this device is worth,
and past that the extra threads are only heat.

The third is the application's own line. `native` is everything up to
the answers arriving as text; `parse` is turning them into objects, on
the thread that draws.

## Testing on an emulated telephone

Three faults in the compute-ahead job reached people who had installed
the app, and nothing here caught any of them. All three were the same
thing: work that stops when the screen goes off. The checks that run on
every change cannot see it. They run on a computer or in a browser, and
neither has an Android screen to switch off.

An emulated telephone does. It runs a real copy of Android on a
computer, so the app runs the same code it runs on a handset, and the
screen can be switched off from the command line.

This cannot run in the development container. Running Android inside it
needs hardware support for running one operating system inside another,
and the container has none — `/dev/kvm` is absent and the processor
reports no support for it. The container is also short of memory. So the
emulated telephone runs on a Linux computer of yours, and the container
talks to it across the network if it needs to.

### What you need, once

A Linux computer where this file exists:

```bash
ls -l /dev/kvm
```

That file is how Linux offers the hardware support. Without it an
emulated telephone either will not start or is too slow to use.

If the file is there but you are not allowed to read it, join the group
that owns it, then log out and back in:

```bash
sudo usermod -aG kvm "$USER"
```

Then the Android tools. `sdkmanager` installs them, `avdmanager` builds
an emulated telephone, `emulator` runs it, and `adb` is the program that
sends commands to a telephone over a cable or a network.

```bash
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

sdkmanager --list | grep "system-images;android-34"
sdkmanager "platform-tools" "emulator" "system-images;android-34;aosp_atd;x86_64"
```

Ask for the list first, because what is offered differs between Android
versions. Take `aosp_atd` if it is there: it is Android with no Google
applications, which is what many of this app's users run, and it is
built to be driven by scripts, so it starts faster. Otherwise take
`default`. Take `google_apis` only if neither is offered.

Android 14 is the one to start with. It is where the rules that broke
this app apply: asking permission before showing a notification, and
saying what a background job is for.

Now build the telephone. `pixel_6` only sets the screen size and shape:

```bash
echo no | avdmanager create avd -n hfcast-34 \
  -k "system-images;android-34;aosp_atd;x86_64" -d pixel_6
```

### Start it, and install the app

```bash
emulator -avd hfcast-34 -no-audio -no-boot-anim -no-snapshot &
adb wait-for-device
```

Leave the window showing while testing by hand, because you need to tap
things. Adding `-no-window` hides it, which is for scripts.

Install the `x86_64` file. An emulated telephone has the same kind of
processor as the computer running it, not the kind a handset has:

```bash
adb install -r mobile/build/apk/hfcast-0.62.16-android7-x86_64.apk
adb shell pm grant solutions.cloudburner.hfcast android.permission.POST_NOTIFICATIONS
```

The second line allows notifications without waiting to be asked. The
app asks for itself when a job starts, and this is only so that a script
does not have to answer a dialog.

### Pretending about the charger

The compute-ahead job can be told to wait for a charger, and an emulated
telephone reports itself as plugged in. These commands change what it
reports. They are how the waiting message and the switch beside it are
tested:

```bash
adb shell dumpsys battery unplug         # pretend the charger came out
adb shell dumpsys battery set status 2   # pretend it went back in
adb shell dumpsys battery reset          # stop pretending
```

### The check that matters: does it keep working with the screen off

1. Open the app and answer the first screen with any place.
2. Open the menu at the top right, then **Compute maps ahead**.
3. Press **Start**, and note the count it shows.
4. Switch the screen off, exactly as pressing the button on a handset
   does:

   ```bash
   adb shell input keyevent 26
   ```

5. Make sure it really is off, rather than only dimmed:

   ```bash
   adb shell dumpsys power | grep -m1 mWakefulness
   ```

   It should say `mWakefulness=Asleep`.

6. Wait three minutes.
7. Read the count **without waking it**, from the notification the job
   puts up:

   ```bash
   adb shell dumpsys notification --noredact | grep -i -A4 hfcast
   ```

   The line to look for reads `N of M maps`.

8. Wake it again when you are done. The first line switches the screen
   back on and the second clears the lock screen:

   ```bash
   adb shell input keyevent 26
   adb shell input keyevent 82
   ```

A working build keeps counting for the whole time the screen is off. A
broken one stops at the number it had reached when the screen went off,
and never moves again. Version 0.62.14 fails this and 0.62.16 passes it,
so either can be used to check that the check itself works.

Counting the stored maps is the more direct measure, and needs a build
made for debugging — a release build does not let anything outside read
its own files. Every stored map is one file ending `.hfg`:

```bash
cd mobile/android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-x86_64-debug.apk
adb shell run-as solutions.cloudburner.hfcast find . -name '*.hfg' | wc -l
```

### Letting the development container drive it

Only needed if the container is to run these commands rather than you.
`adb` normally refuses connections from other computers, so it has to be
started differently. The container is at `192.168.1.101`:

```bash
adb kill-server
adb -a -P 5037 nodaemon server &
sudo ufw allow from 192.168.1.101 to any port 5037 proto tcp
```

Anything that can reach that port has full control of the emulated
telephone, so allow the one address and nothing else, and stop it when
you have finished. An encrypted tunnel from the container to this
computer does the same job while exposing nothing, if you would rather.

In the container, name the computer running the telephone:

```bash
export ADB_SERVER_SOCKET=tcp:<address of the Linux computer>:5037
adb devices
```

### Stopping

```bash
adb emu kill      # close the emulated telephone
adb kill-server   # stop accepting commands
```

### Why do it by hand first

Every step above is a command, so all of it becomes a script, and the
script becomes a check that runs on its own. That is the open item on
the roadmap: the same steps on a machine that builds the app, so a fault
of this kind is caught before somebody installs it rather than after.

## The three parts

| Directory        | What it is             | Language                       |
| ---------------- | ---------------------- | ------------------------------ |
| `mobile/`        | The application        | TypeScript, React Native, Expo |
| `server/`        | The prediction API     | TypeScript, Node               |
| `hfcast-engine/` | The propagation engine | Rust                           |

`mobile/` is named for the kind of device, not for one operating
system. It builds the Android APK and it builds for the web, and
`app.json` also carries an iOS configuration. A desktop application, if
one is written, gets its own directory beside it rather than a place
inside this one.

The engine is a different git repository. It is not a submodule. The
application finds it at `hfcast-engine/` beside the application
directory, and `.gitignore` excludes that path.

This has two results that you must remember:

- To build the application you must clone both.
- A change to the engine is a different repository, and this one uses
  only released versions of it. The pin is the `hfcast` version in
  `mobile/modules/engine-bridge/rust/Cargo.lock`. Every workflow reads
  that one file: the server tests install that version from crates.io,
  and an Android build takes the engine repository at the tag of the
  same version. No engine commit is named anywhere.
- If your change needs a newer engine, publish that engine version and
  tag it, then move the pin in the same pull request:

  ```bash
  cd mobile/modules/engine-bridge/rust
  cargo update -p hfcast --precise 0.66.6
  ```

  Run the server tests against the new version before you do.

## How the engine gets into the application

The application does not call the server on Android. It has the engine
in it.

```
mobile/modules/engine-bridge/
├── rust/           A small Rust crate. It calls the engine and gives a
│                   Java interface (JNI).
├── build-rust.sh   Builds that crate one time for each processor type.
├── android/        The Kotlin module that loads the libraries.
└── src/            The TypeScript that the application calls.
```

`build-rust.sh` writes four `.so` files into
`android/src/main/jniLibs/`. They are not in git. Run the script again
after a change to the engine or to the JNI crate.

### Where the engine crate comes from

`rust/Cargo.toml` asks for the published `hfcast` crate. That version is
what the application depends on.

An APK also needs the ionospheric coefficients compiled in, because a
telephone has no `itshfbc` tree to read. The published crate does not
carry those files: part of that data is CCIR Report 322 and 340 material
that the engine does not redistribute. Only the engine repository has
them.

So `build-rust.sh` finds the engine checkout and points Cargo at it with
a `[patch.crates-io]` entry, which changes where the crate comes from and
nothing else. The version in `Cargo.toml` still says what the application
depends on. The script looks in each parent directory for
`hfcast-engine/`; `HFCAST_ENGINE` names it instead.

This is also how you try an engine change before it is published: build
in the engine checkout, then build here. It works even when the checkout
is a version ahead of anything on crates.io, which is the usual state
while a change is being made. When the change is published, move the
version with `cargo update -p hfcast --precise <version>`. That writes
`Cargo.lock`, which is the pin the workflows read.

Until it is published, `Cargo.lock` holds the local copy rather than a
registry entry with a checksum, and the workflows cannot build. That is
deliberate: a lock that quietly named an older engine would build an
application whose newer half does nothing, and nothing on screen would
say so.

The engine repository must have a tag for that version — `v0.66.6` —
because an Android build in CI takes the coefficient files from the
repository at that tag. The build fails and says so if the tag is not
there.

The web build and iOS have no engine. They read from the server.

## Two builds, one source

`mobile/package.json` targets Expo SDK 57 and Android 7.0.
`mobile/legacy/package.json` targets Expo SDK 50 and Android 5.0,
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

Only the modern build is published now.

## Before you commit

Run these in `mobile/`:

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

Hooks run them for you: formatting and lint before a commit, the
typechecks and the tests before a push. Turn them on once per clone,
because git does not enable a hook directory by itself:

```bash
git config core.hooksPath .githooks
```

`git commit --no-verify` and `git push --no-verify` get past them.

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
in three files: `mobile/package.json`, `mobile/legacy/package.json` and
`mobile/app.json`. A test fails if they disagree.

Use the script rather than an editor, because `app.json` holds a fourth
number that must move with them:

```bash
tools/bump-version.sh patch     # or minor, major, or a version
tools/bump-version.sh --check   # say what the files hold, change nothing
```

It stops if the three files already disagree, and it stops if the new
version would give a code Android will not accept. The server and the
project at the top have their own versions and are not touched.

`app.json` also has `versionCode`, the integer Android compares to
decide what is an upgrade. `versionCodeFor` in
`mobile/src/data/version.ts` computes it, and a test fails if the number in
`app.json` is not the one that function gives:

```
versionCode = major * 100000 + minor * 100 + patch  ...then * 10 + tier
```

The tier is 0 for the legacy build and 1 for the modern one. The build
adds one more digit below that, for the architecture:
`plugins/withAbiSplits.ts` multiplies by ten again and adds 1 for
`armeabi-v7a`, 2 for `x86`, 3 for `arm64-v8a` and 4 for `x86_64`. For
example, version 0.54.4, modern, `arm64-v8a` is `540413`.

Each field has its own block of digits, and each block has a limit:
patch below 100, minor below 1000, major below 210. Past a limit, two
different versions get one code and the second one will not install.
Do not change the ABI numbers: a device that installed `arm64-v8a` as 3
must keep seeing 3.

**Open work is tracked by the maintainer outside this repository.** Do
not add tracker or progress documents. If you defer work or find a gap,
describe it in the pull request and the maintainer will record it.

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
telephone and on a tablet. `mobile/test/contrast.test.ts` measures the
contrast of each colour pair that the design puts on the screen.

## Documents

Write in ASD-STE100 Simplified Technical English. Use short sentences
and simple words. Do not use idioms: a reader who learned English
recently, or a translator, cannot always understand them.
