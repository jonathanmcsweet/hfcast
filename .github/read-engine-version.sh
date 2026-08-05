#!/usr/bin/env bash
# Reads the engine version the application depends on and reports it as
# the step output `version`.
#
# The answer comes from `Cargo.lock`, not from `Cargo.toml`. The manifest
# names the least version the application accepts; the lock holds the one
# version cargo resolved, with its checksum. That is what the application
# is built against, so it is what a workflow must test and build against.
#
# This one file is the pin. Every workflow reads it: the server tests
# install that version of the crate, and an Android build takes the
# engine repository at the tag of the same version. The version moves
# when cargo resolves a new one and writes the lock.
#
# Give an argument to use that version instead of the lock; the release
# workflow passes its `engine_version` input, which is empty on a normal
# run.
#
# Run it with no argument to print the version.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lock="$here/../mobile/modules/engine-bridge/rust/Cargo.lock"

version="${1:-}"
source="the workflow input"

if [[ -z $version ]]; then
  source="$lock"
  [[ -f $lock ]] || {
    echo "::error::$lock is missing. It names the engine version to build against." >&2
    exit 1
  }

  # The first `version` line after the `hfcast` package's own name. The
  # name is matched whole, because `hfcast-jni` is in the same file and
  # `hfcast` is a prefix of it.
  version="$(
    awk '
      /^name = "hfcast"$/ { found = 1; next }
      found && /^version = / { gsub(/"/, ""); print $3; exit }
    ' "$lock"
  )"
fi

if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "::error::$source does not hold one engine version. Read: '$version'" >&2
  exit 1
fi

echo "engine version $version (from $source)"
[[ -n ${GITHUB_OUTPUT:-} ]] && echo "version=$version" >>"$GITHUB_OUTPUT"
exit 0
