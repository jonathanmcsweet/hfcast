#!/usr/bin/env bash
#
# Builds the app for Android. One source tree, two APKs.
#
#   tools/build-android.sh            # both
#   tools/build-android.sh modern     # Android 7.0 and up, targets Android 16
#   tools/build-android.sh legacy     # Android 5.0 and up, targets Android 14
#
# An APK declares one minimum Android version, so covering both old and new
# devices takes two of them. They share every line of `src/`, `test/`,
# `modules/` and `app.json`; what differs is the dependency set. The modern one
# is this directory's own `package.json` on Expo SDK 57. The legacy one is
# `legacy/package.json` on Expo SDK 50, the last release whose React Native
# still supports Android 5.0.
#
# The legacy build runs in a copy of this tree, because the two need different
# `node_modules` and Metro will not resolve a source file outside the directory
# it is run from. The copy is remade each time so it cannot hold a file this
# tree has deleted, but its `node_modules` is left alone, which is the part that
# costs anything.
#
# The copy sits beside this directory rather than inside it. Expo's autolinking
# searches every parent directory for `node_modules`, so a copy under
# `hfcast/build/` picks up the modern tree's packages: the legacy build linked
# expo-asset 57 against React Native 0.73 and failed to configure.
#
# Needs the JDK, the Android SDK and both NDKs. See README.md.
set -euo pipefail

mobile="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="$(cd "$mobile/.." && pwd)"
work="$root/build/legacy-app"
out="$mobile/build/apk"

what="${1:-both}"
case "$what" in
  modern | legacy | both) ;;
  *)
    echo "usage: $(basename "$0") [modern|legacy|both]" >&2
    exit 2
    ;;
esac

version="$(node -p "require('$mobile/package.json').version")"
mkdir -p "$out"

# Ninja decides how many compilers to run from the CPUs it is allowed, and each
# one wants a few hundred megabytes. On a machine with more cores than memory
# that is what runs it out, and it presents as "Gradle build daemon disappeared
# unexpectedly" rather than as anything mentioning memory. HFCAST_BUILD_CPUS
# takes a taskset list — `0-3` for four of them.
run_gradle() {
  local dir="$1"
  if [[ -n ${HFCAST_BUILD_CPUS:-} ]]; then
    (cd "$dir/android" && taskset -c "$HFCAST_BUILD_CPUS" ./gradlew assembleRelease)
  else
    (cd "$dir/android" && ./gradlew assembleRelease)
  fi
}

# The icons are glyphs in one ~1.1 MB font, and every other font in the APK is
# an IBM Plex face at about 220 KB. A build that stops bundling the icon font
# still runs — it draws every icon as an empty box, with nothing in any log to
# say why — so it is checked here rather than found on a phone. It has happened
# once already: Expo SDK 57 stopped including these fonts as a side effect of
# `@expo/vector-icons`, which is what SDK 50 had been doing.
check_icon_font() {
  local apk="$1"
  local biggest
  biggest="$(unzip -l "$apk" | awk '/\.ttf$/ { if ($1 > max) max = $1 } END { print max + 0 }')"

  if [[ $biggest -lt 900000 ]]; then
    echo "$(basename "$apk"): no icon font — largest .ttf is $biggest bytes" >&2
    exit 1
  fi
  echo "$(basename "$apk"): icon font present ($biggest bytes)"
}

# Expo SDK 57 writes each module function's argument and result types when the
# module is compiled, using the pika compiler plugin that
# `expo-module-gradle-plugin` brings in. A module built without that plugin
# still compiles and still packages, but every one of its types is left as a
# placeholder that throws the moment the module is created. That stops React
# Native before it draws anything, so the application opens to a black screen
# and writes one line to the log. It has happened once already — the modules
# here kept the older Expo build file through the SDK 50 to 57 upgrade — and it
# cost a full build to find, so it is checked here against the compiled
# classes, where the placeholder is named in plain text.
#
# Modern only. Expo SDK 50 has no pika and reads the types when the module is
# created, so there is nothing to check in the legacy build.
check_type_descriptors() {
  local tree="$1"
  local module name classes left

  for module in "$tree"/modules/*/android; do
    name="$(basename "$(dirname "$module")")"
    classes="$module/build/tmp/kotlin-classes/release"

    # Rather than pass quietly if a Gradle release moves where classes land.
    if [[ ! -d $classes ]]; then
      echo "$name: nothing compiled at $classes to check" >&2
      exit 1
    fi

    left="$(grep -rl "throwNonReifiedTypeDescriptorError" "$classes" || true)"
    if [[ -n $left ]]; then
      echo "$name: function types were left as placeholders" >&2
      echo "$left" >&2
      echo "add 'expo-module-gradle-plugin' to $module/build.gradle" >&2
      exit 1
    fi
    echo "$name: function types built at compile time"
  done
}

# Collects the four per-architecture APKs a build produced.
#
# Both builds split by architecture — see plugins/withAbiSplits.ts, which
# applies to whichever of the two is being built because `app.json` is shared.
# A phone can run only one of the four, and one APK carrying all of them made
# the download about four times what it had to be.
#
# Takes the tree that was built and the name to use, `android7` or `android5`.
collect_apks() {
  local tree="$1"
  local label="$2"
  local src="$tree/android/app/build/outputs/apk/release"
  local found=0

  for abi in armeabi-v7a arm64-v8a x86 x86_64; do
    local from="$src/app-$abi-release.apk"
    if [[ ! -f $from ]]; then
      continue
    fi
    local to="$out/hfcast-$version-$label-$abi.apk"
    cp "$from" "$to"
    check_icon_font "$to"
    found=$((found + 1))
  done

  if [[ $found -ne 4 ]]; then
    # A build that quietly produced one file, or three, would look like a
    # release and leave some devices with nothing to install.
    echo "expected 4 per-architecture APKs, found $found in $src" >&2
    ls -1 "$src" >&2
    exit 1
  fi
}

build_modern() {
  echo
  echo "=== modern: Expo SDK 57, Android 7.0 and up ==="
  ANDROID_API=24 bash "$mobile/modules/engine-bridge/build-rust.sh"
  (cd "$mobile" && npx expo prebuild --clean --platform android --no-install)
  run_gradle "$mobile"
  check_type_descriptors "$mobile"
  collect_apks "$mobile" android7
}

build_legacy() {
  echo
  echo "=== legacy: Expo SDK 50, Android 5.0 and up ==="
  mkdir -p "$work"

  # Emptied first so a file deleted here cannot survive there, except
  # node_modules, which is the copy's own and expensive to rebuild.
  find "$work" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +

  # Everything the build reads, and nothing generated. `android` and the Rust
  # output are excluded because they are built from the copy's own
  # dependencies, against a different NDK and a different minimum API.
  tar -cf - -C "$mobile" \
    --exclude=./node_modules \
    --exclude=./build \
    --exclude=./android \
    --exclude=./ios \
    --exclude=./.expo \
    --exclude=./dist \
    --exclude='./modules/*/rust/target' \
    --exclude='./modules/*/android/src/main/jniLibs' \
    --exclude='./modules/*/android/build' \
    . | tar -xf - -C "$work"

  cp "$mobile/legacy/package.json" "$work/package.json"

  # The Skia seam, which this build does not have a Skia for.
  #
  # `src/` is shared line for line by both builds, but only the modern
  # dependency set contains `@shopify/react-native-skia`. A bundler
  # follows every import before any code runs, so a file naming a package
  # that is not installed fails to build — a run-time availability check
  # never gets the chance to answer. `legacy/render/` holds stand-ins that
  # export the same names and report the canvas absent, which is what
  # sends `CoverageGlobe` down its SVG path.
  #
  # The whole directory is replaced rather than patched file by file, so
  # no modern file naming Skia can survive the swap. `src/render/` holds
  # nothing but the seam for exactly this reason: anything added there
  # needs a stand-in here, and a missing one fails the legacy build
  # rather than passing quietly.
  rm -rf "$work/src/render"
  cp -r "$mobile/legacy/render" "$work/src/render"

  # The Gradle seam, for the same reason as the Skia one above.
  #
  # Each module in `modules/` is built by `expo-module-gradle-plugin`, which
  # Expo SDK 50 does not have. Every module therefore needs a second build
  # file here, and the loop reads the module list from the tree rather than
  # from a list written by hand, so a module added without one stops this
  # build instead of producing an APK that opens to a black screen.
  for android in "$work"/modules/*/android; do
    name="$(basename "$(dirname "$android")")"
    cp "$mobile/legacy/modules/$name/build.gradle" "$android/build.gradle"
  done

  # The copy arrives holding the modern lockfile, which describes a different
  # dependency set entirely. It is replaced by the legacy one, or removed so
  # pnpm resolves from nothing rather than from something wrong.
  if [[ -f $mobile/legacy/pnpm-lock.yaml ]]; then
    cp "$mobile/legacy/pnpm-lock.yaml" "$work/pnpm-lock.yaml"
  else
    rm -f "$work/pnpm-lock.yaml"
  fi

  # The one configuration difference, derived rather than duplicated.
  node --experimental-strip-types "$mobile/tools/legacy-config.ts" "$work/app.json"

  (cd "$work" && pnpm install --no-frozen-lockfile)

  # Kept so the legacy build resolves the same versions on any machine.
  cp "$work/pnpm-lock.yaml" "$mobile/legacy/pnpm-lock.yaml"

  # `build-rust.sh` takes the engine crate from a checkout, which it finds by
  # examining each parent directory for `hfcast-engine`. From the copy those
  # parents start inside `build/`, since the copy sits one directory deeper
  # than the application. A link at the place it now looks sends it to the
  # real one.
  ln -sfn "$root/hfcast-engine" "$root/build/hfcast-engine"

  # The same arrangement for the shared physics. `src/` reaches it as
  # `../../../shared`, which from the copy is `build/shared`, and
  # `metro.config.js` names the same relative path in `watchFolders`. A
  # link rather than a copy, so the legacy build cannot be built against a
  # stale set of correction factors.
  ln -sfn "$root/shared" "$root/build/shared"

  ANDROID_API=21 bash "$work/modules/engine-bridge/build-rust.sh"
  (cd "$work" && npx expo prebuild --clean --platform android --no-install)
  run_gradle "$work"
  collect_apks "$work" android5
}

if [[ $what == modern || $what == both ]]; then build_modern; fi
if [[ $what == legacy || $what == both ]]; then build_legacy; fi

echo
echo "APKs in $out:"
ls -l "$out"
