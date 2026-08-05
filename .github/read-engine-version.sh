#!/usr/bin/env bash
# Reads the engine version the application depends on and reports it as
# the step output `version`.
#
# The answer comes from `Cargo.lock`, not from `Cargo.toml`. The manifest
# holds a range — `0.66` — and the lock holds the one version cargo
# resolved, with its checksum. That is what the application is actually
# built against, so it is what a workflow must test against.
#
# There is nothing else to keep in step. The version moves when cargo
# resolves a new one and writes the lock, and every workflow reads it
# from there.
#
# Run it with no argument to print the version.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lock="$here/../mobile/modules/engine-bridge/rust/Cargo.lock"

[[ -f $lock ]] || {
  echo "::error::$lock is missing. It names the engine version to test against." >&2
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

if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "::error::no hfcast version in $lock. Read: '$version'" >&2
  exit 1
fi

echo "engine version $version (from $lock)"
[[ -n ${GITHUB_OUTPUT:-} ]] && echo "version=$version" >>"$GITHUB_OUTPUT"
exit 0
