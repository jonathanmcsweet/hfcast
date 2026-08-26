#!/usr/bin/env bash
#
# Checks that the F-Droid recipe still describes this commit.
#
# The recipe is written by hand and lives in fdroiddata, so nothing moves
# it when a version moves here. Four things have to agree:
#
#   the engine revision the srclib clones   Cargo.lock
#   the version name and the commit tag     mobile/app.json
#   the four version codes                  mobile/app.json, times ten
#   a changelog for every version code      fastlane
#
# Run it with no arguments. It says what it compared and exits non-zero on
# the first disagreement.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
recipe="$here/mobile/docs/fdroid/solutions.cloudburner.hfcast.yml"
appjson="$here/mobile/app.json"
changelogs="$here/mobile/fastlane/metadata/android/en-US/changelogs"

fail() {
  echo "check-fdroid-pin: $1" >&2
  exit 1
}

one() {
  # The distinct values of a field in the recipe, which must be a single
  # value: every build entry in a release describes the same release.
  local field=$1 pattern=$2 values
  values="$(grep -oE "$pattern" "$recipe" | sed "s/^$field: //" | sort -u)"
  [[ $(grep -c . <<<"$values") -eq 1 ]] \
    || fail "the recipe holds more than one $field: $(tr '\n' ' ' <<<"$values")"
  printf '%s' "$values"
}

[[ -f $recipe ]] || fail "no recipe at $recipe"

# The engine, from the lock file rather than the manifest. See
# .github/read-engine-version.sh for why the lock is the pin.
engine="$(bash "$here/.github/read-engine-version.sh" | awk '{print $3}')"
pinned="$(one 'hfcast-engine@v' 'hfcast-engine@v[0-9]+\.[0-9]+\.[0-9]+')"
pinned="${pinned#hfcast-engine@v}"
[[ $pinned == "$engine" ]] \
  || fail "the srclib clones v$pinned but Cargo.lock resolves the engine to $engine"
echo "engine       v$pinned matches Cargo.lock"

version="$(grep -m1 -oE '"version": "[0-9]+\.[0-9]+\.[0-9]+"' "$appjson" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
base="$(grep -m1 -oE '"versionCode": [0-9]+' "$appjson" | grep -oE '[0-9]+')"

name="$(one versionName 'versionName: [0-9]+\.[0-9]+\.[0-9]+')"
[[ $name == "$version" ]] || fail "the recipe builds $name but app.json holds $version"
echo "versionName  $version matches app.json"

commit="$(one commit 'commit: v[0-9]+\.[0-9]+\.[0-9]+')"
[[ $commit == "v$version" ]] || fail "the recipe builds commit $commit, expected v$version"
echo "commit       $commit"

# withAbiSplits.ts: variant.versionCode * 10 + abiCode, the ABI codes fixed
# at armeabi-v7a 1, x86 2, arm64-v8a 3, x86_64 4.
want="$(for d in 1 2 3 4; do echo $((base * 10 + d)); done)"
got="$(grep -oE 'versionCode: [0-9]+' "$recipe" | awk '{print $2}' | sort -n)"
[[ $got == "$want" ]] \
  || fail "version codes are $(tr '\n' ' ' <<<"$got"), expected $(tr '\n' ' ' <<<"$want")"
echo "versionCodes $(tr '\n' ' ' <<<"$got")"

current="$(grep -oE '^CurrentVersionCode: [0-9]+' "$recipe" | awk '{print $2}')"
highest="$(tail -1 <<<"$got")"
[[ $current == "$highest" ]] \
  || fail "CurrentVersionCode is $current, expected the highest in the release, $highest"
echo "recommended  $current"

# A version code with no changelog ships an update that says nothing.
while read -r code; do
  [[ -f "$changelogs/$code.txt" ]] || fail "no changelog at $changelogs/$code.txt"
  size="$(wc -c < "$changelogs/$code.txt")"
  [[ $size -le 500 ]] || fail "$code.txt is $size bytes; F-Droid truncates past 500"
done <<<"$got"
echo "changelogs   four present, all within 500 bytes"
