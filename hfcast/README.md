# HFcast

A consumer-styled HF propagation forecast for a single point-to-point path, built with React Native, Expo, and Material Design 3 via `react-native-paper`.

The design premise: VOACAP output is climatology with a probability attached, which is structurally the same thing a weather app shows. So the UI borrows the weather app's vocabulary — a hero "conditions now", an hourly strip, a per-band list, and a 24-hour grid — rather than inventing a new one.

## Running it

Where the forecast comes from depends on the build. An Android build made from
this directory carries the engine and computes everything on the device, with no
network and no server — see
[Predicting on the device](#predicting-on-the-device). Expo Go, the web build and
iOS have no engine to load, so they read from `hfcast-server`; start that first,
see `server/README.md`. Then:

```bash
pnpm install
pnpm start
```

Then press `i` for the iOS simulator, `a` for an Android emulator, `w` for the browser, or scan the QR code with Expo Go on a phone that's on the same network.

Expo Go still runs everything except one thing: the device-location button, which
is a native module of this project and so cannot exist inside a pre-built
sandbox app. It is absent there rather than broken — see
[Device location without Google](#device-location-without-google).

The versions pinned in `package.json` target Expo SDK 57, and those in
`legacy/package.json` target SDK 50 — see
[Two APKs](#two-apks-because-one-cannot-cover-both-ends). On a newer SDK run
`npx expo install --fix` to move the native modules with it.

`API_BASE` in `src/api/client.ts` defaults to `http://127.0.0.1:8787`, which
suits the web build and a simulator. A real device needs
`EXPO_PUBLIC_HFCAST_API` pointing at the machine running the server.

**Opening the dev server URL in a browser shows a JSON manifest, not the app.** That's expected — the root of a Metro server serves app metadata. Press `w` for the browser build instead.

### Entry point

`index.js` registers the root component directly instead of relying on `expo/AppEntry.js`. AppEntry does `import App from '../../App'`, which only resolves when the expo package sits at `<project>/node_modules/expo/` — an assumption pnpm's store layout breaks, producing `Unable to resolve "../../App"`. Registering explicitly makes the project package-manager agnostic.

### Using pnpm

Metro resolves several packages from the project root, and pnpm's default
isolated layout only exposes direct dependencies there. `expo-asset`,
`@react-native/assets-registry`, `@babel/runtime` and `babel-preset-expo` are
therefore declared in `package.json` even though nothing imports them directly.
Without them `expo start` dies in Metro config with "The required package
`expo-asset` cannot be found", before any server exists to press `w` at.

The `.npmrc` in this directory sets `node-linker=hoisted`, which would also fix
it — but **pnpm 11 no longer reads pnpm-specific settings from `.npmrc`** and
silently uses the default instead. That file is inert on pnpm 11. The setting's
new home is `pnpm-workspace.yaml`.

### Bundler memory

`metro.config.js` budgets Metro's transform workers by system memory rather
than core count. Each worker is a separate Node process, so on a machine with
many cores and little memory the default pool is killed by the kernel partway
through a bundle. That presents as a blank page and `exit code 137`, with no
error from Metro itself.

## Getting an installable app

`npm start` runs it in development. For a build you can install on a phone,
either build the APK locally or let Expo build it.

### Building an APK locally

No Android Studio or emulator needed, but the NDK is: React Native itself takes
its native libraries prebuilt from Maven, and `expo-modules-core` does not — it
compiles its own C++. Gradle installs the NDK on demand, which is a 2.5 GB
download the first time.

**Budget memory for it.** Three separate things want a gigabyte or more: the
Gradle JVM, the Kotlin compiler, and Metro bundling the JavaScript. Attempted on
a 4 GB machine with about 2 GB actually free, this build was killed by the kernel
during `:expo-updates-gradle-plugin:compileKotlin`, and it presents as
`Gradle build daemon disappeared unexpectedly` rather than as an out-of-memory
message. 8 GB free is comfortable; 4 GB total is not enough. If a machine is all
that is available, give it swap first — the failure is a memory spike, and swap
absorbs a spike at the cost of speed.

Install a JDK 17 and the SDK tools once:

```bash
# JDK 17. A package manager is fine; this way needs no root.
curl -L -o /tmp/jdk.tar.gz \
  'https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse'
mkdir -p ~/jdk17 && tar -xzf /tmp/jdk.tar.gz -C ~/jdk17 --strip-components=1

# Android SDK command-line tools. The nested cmdline-tools/latest path is
# required — sdkmanager refuses to run from anywhere else.
curl -L -o /tmp/cmdline-tools.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
mkdir -p ~/android-sdk/cmdline-tools
unzip -q /tmp/cmdline-tools.zip -d ~/android-sdk/cmdline-tools
mv ~/android-sdk/cmdline-tools/cmdline-tools ~/android-sdk/cmdline-tools/latest

export JAVA_HOME=~/jdk17
export ANDROID_HOME=~/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

yes | sdkmanager --licenses
sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'

# Gradle will fetch this itself mid-build if it is missing. Doing it here
# keeps the 2.5 GB download separate from the build that needs it.
sdkmanager 'ndk;27.1.12297006'
```

Then, from this directory:

```bash
tools/build-android.sh          # both APKs
tools/build-android.sh modern   # just the one for Android 7.0 and up
```

They land in `build/apk/` — one binary each carrying all four ABIs, with the
JavaScript bundle inside, so either runs with no dev server. The Android 7 one
is about 92 MB and the Android 5 one about 72 MB; the difference is the new
architecture's native code. Copy one to the phone and open it, or
`adb install` it over USB. Android will ask for permission to install from
whichever app opened the file.

Measured with the NDK already downloaded and Gradle's caches warm, on the four
CPUs `HFCAST_BUILD_CPUS` allows: about 10 minutes per APK.

### Two APKs, because one cannot cover both ends

An APK declares one minimum Android version. So each release builds twice from
the same source:

|             | `hfcast-<version>-android7.apk` | `hfcast-<version>-android5.apk` |
| ----------- | ------------------------------- | ------------------------------- |
| Installs on | Android 7.0 and up              | Android 5.0 and up              |
| Targets     | Android 16 (API 36)             | Android 14 (API 34)             |
| Built with  | Expo SDK 57, React Native 0.86  | Expo SDK 50, React Native 0.73  |

Every line of `src/`, `test/`, `modules/` and `app.json` is shared. What differs
is the dependency set: this directory's `package.json` against
`legacy/package.json`. `tools/legacy-config.ts` derives the legacy `app.json`
from the real one rather than keeping a second copy, so the two cannot drift
apart on anything but the SDK levels.

React Native 0.81 raised its own floor to API 24, which is why the modern build
stops at Android 7.0; Expo SDK 50 is the last release whose React Native still
supports Android 5.0. Nothing reaches further back than that, so the 2014
Fire HD 6 and other Android 4.x devices are out of reach whatever is done here.
The _target_ level is a separate thing and takes no device away — API 36 is
there because Google Play requires it, and SDK 50 cannot compile against it.

### Which channel gets which file

Only one of them picks for the user, so the rest need the filenames to be plain.

| Channel         | Carries     | How the right one is chosen                                                                                                                       |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-Droid         | both        | The index holds each APK's minimum SDK and architectures, and the client reads the device and offers one that fits. Nothing for the user to know. |
| Direct download | both        | The page has to say which is which, in Android versions rather than in words like "legacy".                                                       |
| Obtainium       | both        | It does not choose. With two files it asks, or the user sets a regular expression — `android7` and `android5` are in the names for that.          |
| Google Play     | modern only | Its target API rule applies to every APK in a release, and Expo SDK 50 cannot compile against API 36.                                             |
| Accrescent      | modern only | It takes an app bundle, and a bundle declares one minimum version.                                                                                |

**The legacy build is not a maintained fork.** It is the same code; Expo SDK 50
receives no security fixes. Anything added to `src/` has to work under React 18
as well as 19, which is what `legacy/package.json` pins.

**`app.json` has to declare a splash background colour.** Prebuild writes
`res/drawable/splashscreen.xml` pointing at `@color/splashscreen_background`
whatever the configuration says, but only writes that colour when
`expo.splash.backgroundColor` exists. Without it, resource linking fails with
`resource color/splashscreen_background not found` after several minutes of
compiling. The two colours here match the app's own light and dark
backgrounds, so the launch window does not flash white on a dark device.

**It is signed with the debug keystore.** React Native's template does that so a
release build works with no credential setup, which suits testing. Anything
actually distributed needs its own keystore — a debug-signed APK cannot be
updated by a properly signed one later, so the app has to be uninstalled first.

**`android/` is generated.** `expo prebuild` rewrites it from `app.json`, so
changes made inside it are lost. Configuration belongs in `app.json`, or in an
`expo-build-properties` plugin entry.

On a small machine, put these in `~/.gradle/gradle.properties` — outside the
repository, where `expo prebuild` cannot discard them:

```properties
org.gradle.jvmargs=-Xmx3584m -XX:MaxMetaspaceSize=768m
org.gradle.daemon=false
org.gradle.parallel=false
org.gradle.workers.max=1

# The Kotlin compiler otherwise starts a second JVM of its own, and that
# pair is what the kernel kills first.
kotlin.compiler.execution.strategy=in-process
kotlin.daemon.jvmargs=-Xmx1024m
```

That trades speed for staying inside the memory it has, and the Kotlin setting is
the one that matters most: `--no-daemon` says nothing about the Kotlin compiler,
which runs in a separate process by default. Metro also runs as its own Node
process during the build; `metro.config.js` already scales its worker pool by
system memory for the same reason.

**None of that covers the C++ step**, which is where an 8 GB machine with 16
cores actually died. Gradle's settings say nothing about ninja, which compiles
the native code and decides how many compilers to run from the number of CPUs it
can see — sixteen of them, at a few hundred megabytes each. Ninja reads the
process's CPU affinity, so limiting that limits it:

```bash
HFCAST_BUILD_CPUS=0-3 tools/build-android.sh
```

The failure this avoids reports itself as `Gradle build daemon disappeared
unexpectedly`, with nothing about memory in it. On a machine with memory to
spare, skip all of this.

**An Android build needs no server at all** — it carries the engine and predicts
on the device. The rest of this section applies to the builds that do not: Expo
Go, the web build and iOS.

**The server address is a setting, not a build flag.** It is under
**Server address** in the settings menu, and on the error screen when there is
no forecast yet — which is where it is needed, since that screen is the whole
app until one arrives. So one APK can be pointed at a laptop on the same
network today and a tunnel tomorrow.

`EXPO_PUBLIC_HFCAST_API` still supplies the default for a fresh install, read by
Metro while bundling, so it belongs on the Gradle command:

```bash
EXPO_PUBLIC_HFCAST_API=https://your-server.example ./gradlew assembleRelease
```

Left unset it defaults to `http://127.0.0.1:8787`, which suits a simulator and
is wrong on a phone — that address is the phone itself. The error screen says so
in those words rather than reporting a failed connection, because it is a
setting to change and not a fault to debug.

Without a reachable server — and without the engine, so this means Expo Go, the
web build or iOS — the station settings and the antenna compass are still openable
from that screen. Nothing else is: the forecast, the bands and the map all need a
prediction, and the screen does not exist until there is one.

### Letting Expo build it

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview   # produces an APK
eas build --platform ios --profile preview       # needs an Apple Developer account
```

This builds on Expo's servers, so the memory limits above do not apply, but it
uploads the source there and needs an Expo account. The Android `preview`
profile gives an APK you can sideload. iOS builds require a paid Apple Developer
account and either TestFlight or a registered device UDID; that is Apple's
policy rather than a limitation here.

## Predicting on the device

`modules/hfcast-engine` compiles VOACAP into the APK, so an Android build needs
no server and no network. The forecast and the coverage map are both computed
locally.

The Rust engine is built as one shared library per ABI with the coefficient files
compiled into it, reached through the same JSON interface the server uses over a
pipe — so the device and the server cannot disagree about a number they were both
given the same inputs for. `modules/hfcast-engine/build-rust.sh` builds the four
libraries; they are committed under `android/src/main/jniLibs/`, so an ordinary
build does not need Rust installed.

Nothing switches this on. `Engine.isAvailable()` is true when the library loaded,
and `usePrediction` and `useCoverage` each pick the device or the server from it.
Which one answered is part of the React Query key, so an answer from one is never
shown as the other's. Expo Go, the web build and iOS have no library to load and
keep using the server unchanged.

Three things the device does differently:

- **The sunspot number** comes from `src/data/ssn.json` rather than NOAA. VOACAP
  takes the smoothed SSN as an input, not a refinement, so without a figure there
  is no prediction at all — this is what makes offline work possible, and it is
  also the main limitation. 3.5 KB covering 2020 to 2030, frozen at the date in
  the file.
- **The antenna** is written to the module's cache directory as a `.voa` file and
  the engine is pointed at `<embedded>+<dir>`, reading that first and the
  compiled-in files after. The engine names an antenna by filename and the card
  holds 21 columns, so the name comes from the rounded parameters.
- **Space weather** needs the network and is absent offline. The forecast does not
  depend on it.

Choosing a place works offline too. A Maidenhead locator is arithmetic, so it is
resolved on the device; a place name is looked up in `src/assets/cities.json`,
which is VOACAP's own `itshfbc/geocity` index built by `tools/build-cities.ts` —
3,997 places in 118 KB. The network geocoder is still asked when that list returns
few matches, so an online reader still reaches somewhere smaller than a city. The
list is from about 2001 and names thirteen cities as they were then; the generator
corrects those and keeps the old names searchable. Its country names are not
corrected — see the roadmap.

Cost, measured with the engine compiled in: a point-to-point forecast over five
bands is 15 ms, and a 192-point coverage map is 48 ms — both on a desktop, with
the ARM build under `qemu-aarch64-static` about 17 times slower for the map. The
map is the expensive one, so `useCoverage` waits for the hour slider to settle
rather than starting a run per value it reports.

Correction factors and the mode table are copies of the server's, because Metro
will not resolve modules outside this directory. `server/test/shared-with-app.test.ts`
pins every fitted number against this app's source; if it fails, the two were
changed on one side only.

## Device location without Google

`modules/aosp-location` is a local Expo module reading
`android.location.LocationManager` directly. It exists to keep one proprietary
artifact out of the build.

`expo-location` reaches location through Google's fused provider, so using it
links `com.google.android.gms:play-services-location`. That has two costs: F-Droid
will not distribute a build containing it, and on a phone with no Google services
— GrapheneOS without sandboxed Play, or a Fire tablet — the fused client is not
present, so the feature fails anyway. `LocationManager` is AOSP, has been in the
platform since Android 1, and is what Organic Maps and OsmAnd use.

Nothing else in this project depends on Google code. `@expo-google-fonts/…` is
packaging only: IBM Plex is under the SIL Open Font License and the files are in
the npm package, so nothing is fetched at build or run time.

The three services the app calls are [Open-Meteo](https://open-meteo.com/) for
place search, [NOAA SWPC](https://www.swpc.noaa.gov/) for solar and geomagnetic
readings, and [UMass Lowell GIRO](https://giro.uml.edu/) for measured
soundings. All three are asked directly, without a key and without this
project's server — see _Attribution_ below and the About screen in the app.

What the fused provider does better is battery-efficient continuous tracking,
geofencing, and network location backed by Google's database of wireless
networks. None of that applies here: the app asks once, to fill in a grid
square, and a station's position then stops changing.

Two consequences to know about:

- **Usually satellites only.** A de-Googled phone typically has no network
  provider, so a cold fix needs a view of the sky and can take a minute. The
  module answers from a cached fix up to five minutes old before asking for a
  new one, and gives up after 45 seconds.
- **The button is absent, not broken, where it cannot work.** In Expo Go
  (which cannot contain this project's native code) and on iOS (no
  implementation yet), `isAvailable()` is false and the button is not rendered.
  Typing a place name or a Maidenhead locator does the same job everywhere,
  including the web build, which uses `navigator.geolocation` through
  `index.web.ts` and needs no dependency at all.

The Android permissions are declared in `app.json` under `android.permissions`,
not by a config plugin.

## Architecture

```
App.tsx                     providers: i18n, Paper theme, safe area
src/palette.ts              raw ramps — imported only by theme.ts
src/theme.ts                MD3 scheme + the four propagation-quality roles
src/i18n/                   i18next setup, Intl polyfills, five locale files
src/data/types.ts           PathPrediction — mirrors server/src/types.ts
src/data/selectors.ts       pure reads over a prediction
src/data/grid.ts            Maidenhead locator from a GPS fix
src/data/quality.ts         reliability → four-state bucketing
src/api/                    client and React Query hooks — all network state
src/store/usePathStore.ts   Zustand — path, pinned band, selected day
src/hooks/useFormatters     every number and date in the app goes through here
src/hooks/useDirection      language switching, including the RTL reload dance
src/components/             presentational pieces
src/screens/ForecastScreen  composition
```

### Where the data comes from

Two paths produce the same shape. On Android the engine in this APK computes it
(see [Predicting on the device](#predicting-on-the-device)); elsewhere
`hfcast-server` runs the same engine and returns it over HTTP. Everything
downstream of `src/data/types.ts` reads that shape and nothing else, and does not
know which produced it.

The `basis` field says which sunspot number drove the run — observed, predicted,
or inferred from current conditions — and the hero and the disclaimer both
change wording to match. VOACAP is fitted against the _smoothed_ sunspot number,
not today's SFI, so a live figure cannot simply be passed through; the server
converts it. Never label a run "live" without checking `basis`.

## Design notes

### Colour

The palette is built from one idea in the subject: a path between the lit and unlit sides of the earth.

Neutrals are cold and violet-shifted rather than pure grey, so the dark theme reads as night sky instead of switched-off screen. Primary is a plasma cyan. A single warm amber is reserved for the MUF tile — the one number on screen that's driven directly by the sun — and appears nowhere else, which is what lets it carry meaning rather than decoration.

Two Material defaults were overridden deliberately:

- **Elevation tinting is off.** MD3 tints raised surfaces with the primary hue. At this chroma that washes the whole dark theme cyan, so elevation steps through the neutral ramp and hairline borders do the work instead.
- **Containers aren't pastel.** The soft tonal fills of the Material You era are the most recognisable "generated by the theme builder" tell. These are tighter and higher-contrast.

Ramps were spaced in OKLCH for even perceptual steps and flattened to hex, since React Native has no `oklch()` support in styles.

### The quality scale is ordinal, not categorical

`QUALITY_SCALE` in `theme.ts` switches between two four-state scales.

`signal` (default) runs plasma cyan → indigo → violet → slate. It encodes quality as **contrast against the page**: brighter on the dark theme, darker on the light one. Because lightness carries the ordering, it survives greyscale printing and every form of colour blindness — which matters more here than usual, since the heatmap is the one place colour does most of the work.

`traffic` is the familiar green/amber/red. It's strictly worse on accessibility but wins on instant recognition, and red-green deuteranopia affects roughly 6% of men — a meaningful slice of any amateur radio audience. Flip the constant and every component follows; it's a one-line change.

**Quality is four states, not a gradient.** Reliability is continuous, but the decision it feeds is discrete: call on this band or don't. `qualityFor()` is the single place those thresholds live — change them there and the hero, strip, list, heatmap, and legend all move together.

**Colour is never the only channel.** Every quality indicator is paired with a text label, a position, or a printed percentage. The heatmap is the one place colour carries most of the weight, which is why it has a legend directly beneath it.

**The disclaimer isn't dismissible.** A friendly skin over climatology is one wrong assumption away from being read as a live forecast, so the assumed SSN and quiet-geomagnetic caveat stay on screen permanently.

**The heatmap is 3-hour columns, not 24.** Twenty-four columns at phone width gives you 13px cells. Each column takes the _best_ hour in its window rather than the first, so a short opening never disappears. Change `step` on `<BandHeatmap />` if you'd rather scroll horizontally at full resolution.

## Internationalisation

Five locales ship: English, Spanish, German, Japanese, and Arabic. Arabic is there specifically to exercise RTL — it's the case that breaks layouts, and it's cheaper to keep it working from day one than to retrofit.

Things worth knowing before you extend this:

**RTL needs a reload.** React Native resolves layout direction natively, so `I18nManager.forceRTL()` doesn't take effect until the JS bundle restarts. `useDirection` calls `Updates.reloadAsync()` and falls back to an alert in Expo Go, where reloading isn't available. Without that step, strings flip but layout doesn't — the classic half-broken RTL bug.

**Use logical properties, not left/right.** `marginStart` / `marginEnd` / `paddingStart` / `paddingEnd` flip automatically; `marginLeft` doesn't. `flexDirection: 'row'` and `alignItems: 'flex-end'` also flip, which is why the reliability percentages are right-aligned via a flex container instead of `textAlign: 'right'`.

**Hermes has a partial ICU.** On Android especially, `Intl.NumberFormat` can quietly fall back to English formatting for other locales, which defeats the point. `src/i18n/polyfills.ts` installs the `@formatjs` polyfills with locale data for the five shipped languages. Add a language, add its data there too — it isn't automatic, and the failure mode is silent.

**Nothing concatenates numbers with units.** Percent placement, decimal separators, and digit shaping are all locale decisions. `useFormatters` is the only place `Intl` is touched.

**Some strings are deliberately not translated.** Band designations (20m), Maidenhead grids (CN87), dB, MHz, and UTC are international by convention among operators. Translating them would be worse, not better.

## Attribution

The app carries all of this in its About screen, with links and the full text
of every licence it has to travel with, because that is where a person who
installed it can read it. `src/data/credits.ts` is the list, and
`test/credits.test.ts` fails the build if a credit loses its terms, its link or
its translation.

| What                                                                                                                            | Whose                                            | Terms                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| [VOACAP](https://its.ntia.gov/), the propagation model                                                                          | NTIA/ITS, maintained by Greg Hand                | US Government work, not subject to copyright protection in the US |
| [voacapl](https://github.com/jawatson/voacapl), the port this engine was translated from                                        | J.A. Watson                                      | [CC0](https://creativecommons.org/publicdomain/zero/1.0/)         |
| [The ionospheric coefficient maps](https://www.itu.int/rec/R-REC-P.1239/)                                                       | CCIR Report 340 and URSI, published by ITU-R     | published for implementers free from copyright assertions         |
| The place list searched offline                                                                                                 | NTIA/ITS, from the VOACAP distribution           | US Government work                                                |
| [Coastlines and country borders](https://www.naturalearthdata.com/)                                                             | Natural Earth                                    | public domain                                                     |
| [Sunspot numbers and solar indices](https://www.swpc.noaa.gov/)                                                                 | NOAA Space Weather Prediction Center             | US Government work                                                |
| [Measured ionosonde soundings](https://giro.uml.edu/)                                                                           | UMass Lowell Global Ionosphere Radio Observatory | used with attribution                                             |
| [Place search, when online](https://open-meteo.com/)                                                                            | Open-Meteo                                       | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)         |
| [The aurora on the launch screen](https://commons.wikimedia.org/wiki/File:ISS-42_Aurora_borealis_over_North_Atlantic_Ocean.jpg) | NASA / Samantha Cristoforetti, ESA               | public domain                                                     |
| [IBM Plex Sans](https://github.com/IBM/plex), the typeface                                                                      | IBM                                              | SIL Open Font License 1.1                                         |

Two of these are obligations rather than courtesies. The SIL Open Font License
requires its notice and text to travel with the font, which is inside the APK,
so `tools/build-licences.ts` copies the text out of the installed package into
`src/assets/licences.json` rather than anyone pasting it. CC BY 4.0 asks for a
link to the licence as part of the attribution itself, which is why every
credit carries a URL.

NTIA/ITS asks that nothing imply a US Government endorsement. The About screen
carries that wording verbatim, in English in every language, because it is
their statement of their position and a translation would be this project
speaking for them.

## Known rough edges

- **Tabular figures on Android.** `fontVariant: ['tabular-nums']` is honoured on iOS. On Android it depends on the bundled font exposing the `tnum` OpenType feature; Roboto does, but a custom font may not, in which case numeric columns will jitter slightly as values change.
- **Times are UTC only.** Operators think in UTC, but a consumer-facing app aimed at newcomers should default to device-local time with a UTC toggle. That's the first thing I'd add.
- **The heatmap flips under RTL.** `flexDirection: 'row'` reverses the time axis in Arabic. That's arguably correct for RTL reading order and arguably wrong for a time axis — worth deciding deliberately rather than inheriting.
- **Tests cover `src/data/` only.** The pure functions are tested; no component renders in a test, so nothing checks that the app starts. `npx expo export --platform web` is the cheapest thing that actually executes the module graph.
- **Days inside one month are identical.** VOACAP is monthly climatology, so the day selector only changes the answer at a month boundary, or for today when a now-cast is available.
