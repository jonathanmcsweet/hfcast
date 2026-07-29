# HFcast

A consumer-styled HF propagation forecast for a single point-to-point path, built with React Native, Expo, and Material Design 3 via `react-native-paper`.

The design premise: VOACAP output is climatology with a probability attached, which is structurally the same thing a weather app shows. So the UI borrows the weather app's vocabulary — a hero "conditions now", an hourly strip, a per-band list, and a 24-hour grid — rather than inventing a new one.

## Running it

The app reads its forecasts from `hfcast-server`, so start that first — see
`server/README.md`. Then:

```bash
pnpm install
pnpm start
```

Then press `i` for the iOS simulator, `a` for an Android emulator, `w` for the browser, or scan the QR code with Expo Go on a phone that's on the same network.

Expo Go still runs everything except one thing: the device-location button, which
is a native module of this project and so cannot exist inside a pre-built
sandbox app. It is absent there rather than broken — see
[Device location without Google](#device-location-without-google).

The versions pinned in `package.json` target Expo SDK 51. On a newer SDK run
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
sdkmanager 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0'

# Gradle will fetch this itself mid-build if it is missing. Doing it here
# keeps the 2.5 GB download separate from the build that needs it.
sdkmanager 'ndk;26.1.10909125'
```

Then, from this directory:

```bash
npx expo prebuild --platform android    # generates android/, which is gitignored
cd android && ./gradlew assembleRelease
```

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`, about
65 MB — one binary carrying all four ABIs, with the 3.5 MB JavaScript bundle
inside it, so it runs with no dev server. Copy it to the phone and open it, or
`adb install` it over USB. Android will ask for permission to install from
whichever app opened the file.

Measured on 16 cores with the NDK already downloaded: 7.5 minutes cold, 4.5
minutes for a second build.

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

On a small machine, add to `android/gradle.properties` before building:

```properties
org.gradle.jvmargs=-Xmx1200m -XX:MaxMetaspaceSize=512m
org.gradle.daemon=false
org.gradle.parallel=false
org.gradle.workers.max=1

# The Kotlin compiler otherwise starts a second JVM of its own, and that
# pair is what the kernel kills first.
kotlin.compiler.execution.strategy=in-process
kotlin.daemon.jvmargs=-Xmx512m
```

That trades speed for staying inside the memory it has, and the Kotlin setting is
the one that matters most: `--no-daemon` says nothing about the Kotlin compiler,
which runs in a separate process by default. Metro also runs as its own Node
process during the build; `metro.config.js` already scales its worker pool by
system memory for the same reason.

These settings live in generated files, so `expo prebuild` discards them. On a
machine with memory to spare, skip them.

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

Without a reachable server, the station settings and the antenna compass are
still openable from that screen. Nothing else is: the forecast, the bands and
the map all need a prediction, and the screen does not exist until there is one.

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
the npm package, so nothing is fetched at build or run time. The services the app
talks to are Open-Meteo, NOAA SWPC and UMass Lowell GIRO.

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

`hfcast-server` runs real VOACAP through `voacapl` and returns `PathPrediction`.
Everything downstream of `src/data/types.ts` reads that shape and nothing else.

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

## Known rough edges

- **Tabular figures on Android.** `fontVariant: ['tabular-nums']` is honoured on iOS. On Android it depends on the bundled font exposing the `tnum` OpenType feature; Roboto does, but a custom font may not, in which case numeric columns will jitter slightly as values change.
- **Times are UTC only.** Operators think in UTC, but a consumer-facing app aimed at newcomers should default to device-local time with a UTC toggle. That's the first thing I'd add.
- **The heatmap flips under RTL.** `flexDirection: 'row'` reverses the time axis in Arabic. That's arguably correct for RTL reading order and arguably wrong for a time axis — worth deciding deliberately rather than inheriting.
- **Tests cover `src/data/` only.** The pure functions are tested; no component renders in a test, so nothing checks that the app starts. `npx expo export --platform web` is the cheapest thing that actually executes the module graph.
- **Days inside one month are identical.** VOACAP is monthly climatology, so the day selector only changes the answer at a month boundary, or for today when a now-cast is available.
