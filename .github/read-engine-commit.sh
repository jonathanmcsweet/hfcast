#!/usr/bin/env bash
# Reads the engine pin from `.github/engine-commit` and reports it as the
# step output `commit`.
#
# Both workflows call this, so the value they build against is written in
# one file rather than in two that can drift apart. Give an argument to
# use that instead of the file; the release workflow passes its
# `engine_commit` input, which is empty on a normal run.
#
# Run it with no argument to print the pin.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pin="$here/engine-commit"

commit="${1:-}"
source="the workflow input"

if [[ -z $commit ]]; then
  source="$pin"
  [[ -f $pin ]] || {
    echo "::error::$pin is missing. It holds the engine commit to build against." >&2
    exit 1
  }
  # Comments and every kind of space go, so the file can explain itself.
  commit="$(sed 's/#.*//' "$pin" | tr -d '[:space:]')"
fi

if [[ ! $commit =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::$source does not hold one full 40-character commit hash. Read: '$commit'" >&2
  exit 1
fi

echo "engine pinned at $commit ($source)"
[[ -n ${GITHUB_OUTPUT:-} ]] && echo "commit=$commit" >>"$GITHUB_OUTPUT"
exit 0
