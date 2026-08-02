#!/usr/bin/env bash
#
# Moves the application version, in every file that holds it.
#
#   tools/bump-version.sh patch      # 0.54.5 -> 0.54.6
#   tools/bump-version.sh minor      # 0.54.5 -> 0.55.0
#   tools/bump-version.sh major      # 0.54.5 -> 1.0.0
#   tools/bump-version.sh 0.60.0     # to that version
#   tools/bump-version.sh --check    # say what the files hold, change nothing
#
# Four places have to agree: three package.json files and `app.json`,
# which also holds `versionCode`. A sed over one of them has been done by
# hand and got it wrong twice, and the failure is quiet — the app shows one
# number, the installed package carries another.
#
# `versionCode` is what Android compares to decide what is an upgrade. The
# formula is in `app/src/data/version.ts` and this reads it from there
# rather than repeating it, so the two cannot drift apart. See
# `docs/development.md`.
#
# The server and the tooling project at the top have their own versions and
# are not touched. They move on their own.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

files=(app/package.json app/legacy/package.json app/app.json)

node_bin() {
  # node is not always on PATH here. Take the one in use if it is, and the
  # newest nvm install if it is not.
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  local newest
  newest="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)"
  [[ -n $newest ]] || {
    echo "no node found: put it on PATH" >&2
    exit 1
  }
  echo "$newest"
}

node="$(node_bin)"

# Every version in the files, so disagreement is reported rather than
# silently overwritten by whichever file is read first.
read_versions() {
  for f in "${files[@]}"; do
    "$node" -e "
      const v = require('$root/$f');
      process.stdout.write((v.version ?? v.expo?.version ?? '') + '\n');
    "
  done
}

current() {
  local seen
  mapfile -t seen < <(read_versions)
  local first="${seen[0]}"
  for i in "${!seen[@]}"; do
    if [[ ${seen[$i]} != "$first" ]]; then
      echo "the files disagree: ${files[$i]} says ${seen[$i]}, ${files[0]} says $first" >&2
      echo "fix them by hand, then run this again" >&2
      exit 1
    fi
  done
  echo "$first"
}

now="$(current)"

if [[ ${1:-} == --check ]]; then
  code="$("$node" -p "require('$root/app/app.json').expo.android.versionCode")"
  echo "version      $now  (in ${#files[@]} files, all agreeing)"
  echo "versionCode  $code"
  exit 0
fi

[[ $# -eq 1 ]] || {
  sed -n '3,18p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
  exit 1
}

IFS=. read -r major minor patch <<<"$now"

case "$1" in
  major) next="$((major + 1)).0.0" ;;
  minor) next="$major.$((minor + 1)).0" ;;
  patch) next="$major.$minor.$((patch + 1))" ;;
  [0-9]*.[0-9]*.[0-9]*) next="$1" ;;
  *)
    echo "not a version and not major, minor or patch: $1" >&2
    exit 1
    ;;
esac

# The code comes from the app's own function, so this script cannot hold a
# second copy of the formula that drifts from it. The modern tier is the
# one `app.json` carries; the legacy build takes its own from the same
# function at build time.
code="$(
  cd app && "$node" --experimental-strip-types -e "
    import('./src/data/version.ts').then(({ versionCodeFor }) => {
      process.stdout.write(String(versionCodeFor('$next', 'modern')));
    });
  " 2>/dev/null
)"

[[ $code =~ ^[0-9]+$ ]] || {
  echo "could not compute the version code for $next" >&2
  exit 1
}

# The largest number this release can produce, not the one in `app.json`.
# `plugins/withAbiSplits.ts` multiplies by ten and adds up to 4 for the
# architecture, so `app.json` fitting says nothing about whether the APKs do.
largest="$((code * 10 + 4))"
if [[ $largest -gt 2100000000 ]]; then
  echo "$next gives $largest for the largest APK, above Android's limit of 2100000000" >&2
  echo "the scheme runs out at version 210.0.0" >&2
  exit 1
fi

VERSION="$next" CODE="$code" "$node" -e '
  const fs = require("fs");
  const { VERSION, CODE } = process.env;
  for (const f of process.argv.slice(1)) {
    const text = fs.readFileSync(f, "utf8");
    // Text, not JSON.parse and stringify: these files are formatted by
    // dprint, and rewriting them from the object would reflow every line.
    const out = text
      .replace(/("version": )"[0-9]+\.[0-9]+\.[0-9]+"/, `$1"${VERSION}"`)
      .replace(/("versionCode": )[0-9]+/, `$1${CODE}`);
    if (out === text) {
      console.error(`nothing changed in ${f} — its shape is not what this expects`);
      process.exit(1);
    }
    fs.writeFileSync(f, out);
    console.log(`${f}: ${VERSION}`);
  }
' "${files[@]}"

echo
echo "version      $now -> $next"
echo "versionCode  $code"
echo
echo "The four architectures get $((code * 10 + 1)) to $((code * 10 + 4))."
echo "Run the app tests: one of them checks that these agree."
