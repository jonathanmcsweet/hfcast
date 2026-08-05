#!/usr/bin/env bash
#
# Fails if a change did not move the version of the part it changed.
#
#   tools/check-version-bump.sh <base-ref>       # e.g. origin/main
#
# Three parts hold their own version and they do not move together:
#
#   mobile/         the application       mobile/package.json
#   server/         the prediction API    server/package.json
#   everything else the tooling project   package.json
#
# A change under `mobile/` has to move the application version. A change
# that touches two parts has to move both of their versions.
#
# Documentation is not counted. A version says what a part does, and a
# `.md` file changes none of that, so a pull request that only corrects
# the words in `server/README.md` must not ask for a new server version.
# Only files that are not documentation decide that a part changed.
#
# The comparison is "greater than", not "different from", so a version
# that goes backwards fails as well.
set -euo pipefail

base=${1:?usage: check-version-bump.sh <base-ref>}

cd "$(git rev-parse --show-toplevel)"

# The version line of a manifest at a git ref. Empty if the file is not
# there, which is a new part rather than a failure.
version_at() {
  git show "$1:$2" 2> /dev/null | grep -m1 '"version"' | sed 's/.*: *"//; s/".*//' || true
}

# True when $1 is a later version than $2. `sort -V` orders them, so $1 is
# later when it sorts last and the two are not the same.
is_later() {
  [[ $1 != "$2" ]] && [[ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" == "$1" ]]
}

changed="$(git diff --name-only "$base"...HEAD)"

if [[ -z $changed ]]; then
  echo "no files changed against $base"
  exit 0
fi

# Everything except documentation: `.md` anywhere, and anything under a
# `docs/` directory. These are what decide that a part changed.
code="$(grep -Ev '(^|/)docs/|\.md$' <<< "$changed" || true)"

if [[ -z $code ]]; then
  echo "only documentation changed against $base: no version has to move"
  exit 0
fi

failed=0

check() {
  local label=$1 manifest=$2
  local before after

  before="$(version_at "$base" "$manifest")"
  after="$(version_at HEAD "$manifest")"

  if [[ -z $before ]]; then
    echo "  $label: $manifest is new, nothing to compare"
    return
  fi

  if is_later "$after" "$before"; then
    echo "  $label: $before -> $after"
    return
  fi

  echo "::error file=$manifest::$label changed but its version did not move: still $before"
  failed=1
}

echo "changed against $base:"

if grep -q '^mobile/' <<< "$code"; then
  check "the application" mobile/package.json
fi

if grep -q '^server/' <<< "$code"; then
  check "the server" server/package.json
fi

# The lines the two tests above did not take. This asks for the list and
# then tests it, rather than `grep -qv`: `-q` with `-v` reports the
# pattern, not the lines that were kept, in more than one grep.
elsewhere="$(grep -Ev '^(mobile|server)/' <<< "$code" || true)"
if [[ -n $elsewhere ]]; then
  check "the project" package.json
fi

if [[ $failed -ne 0 ]]; then
  echo
  echo "Move the version with tools/bump-version.sh for the application," >&2
  echo "or by hand in package.json for the server and the project." >&2
  exit 1
fi

echo "every changed part moved its version"
