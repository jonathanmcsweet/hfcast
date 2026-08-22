#!/usr/bin/env bash
#
# Removes what F-Droid's scanner refuses and this build does not use.
#
# F-Droid builds from source, so its scanner walks the tree after `prebuild`
# and rejects prebuilt binaries. Anything left that the scanner objects to
# has to be deleted or listed in `scanignore`, and deleting is the better
# answer wherever the build genuinely does not read the file: `scanignore`
# asks a reviewer to take our word for it, while a build that still works
# without the file has shown its own working.
#
# Run from `mobile/`, after `pnpm install` and before `expo prebuild`.
# Ordinary APK builds never run this, so nothing here slows one down.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../mobile"

removed=0

drop() {
  local what=$1
  shift
  for path in "$@"; do
    [[ -e $path ]] || continue
    rm -rf "$path"
    removed=$((removed + 1))
    echo "  $what: $path"
  done
}

echo "pruning node_modules for the F-Droid scan"

# Skia. The app draws with Android's own Canvas (`modules/cell-canvas`) and
# `package.json` excludes the package from Android autolinking, so none of
# this is read: the four platform packages are prebuilt libraries alone, and
# 214 MB of the arm64 one is static libraries with no source beside them.
# Web still draws with Skia, from CanvasKit, which no APK carries.
drop 'prebuilt skia' \
  node_modules/react-native-skia-android \
  node_modules/react-native-skia-apple-ios \
  node_modules/react-native-skia-apple-tvos \
  node_modules/react-native-skia-apple-macos \
  node_modules/@shopify/react-native-skia

# Expo's precompiled modules, eight `.aar` files with their sources beside
# them. `tools/expo-build-from-source.mjs` has already told Gradle to compile
# these modules instead, so the artifacts are dead weight the scanner would
# reject.
while IFS= read -r dir; do
  drop 'precompiled expo module' "$dir"
done < <(find node_modules -type d -name local-maven-repo -not -path '*/build/*')

# Gradle wrappers shipped inside packages. The app builds with its own
# `android/gradlew`; these are only used by someone running Gradle from
# inside the package directory, which no build here does.
while IFS= read -r jar; do
  drop 'packaged gradle wrapper' "$jar"
done < <(find node_modules -name gradle-wrapper.jar -not -path '*/build/*')

echo "pruned $removed"
