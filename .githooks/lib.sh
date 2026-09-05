#!/usr/bin/env bash
#
# Shared by pre-commit and pre-push. Sourced, not run.
#
# `$hook` names the caller, so a failure says which hook stopped and what
# to do about it.

# cargo and cargo-audit are separate installs and neither is always on the
# PATH a hook gets from an editor. Take what is there, then the rustup
# default location.
cargo_bin() {
  if command -v cargo > /dev/null 2>&1; then
    command -v cargo
    return
  fi
  [[ -x $HOME/.cargo/bin/cargo ]] || {
    echo "$hook: no cargo found. Put it on PATH." >&2
    exit 1
  }
  echo "$HOME/.cargo/bin/cargo"
}

# The Rust advisory check, over the one Cargo.lock this repository holds.
# The engine is a separate repository with its own history, and it has no
# dependencies at all.
#
# A missing cargo-audit stops the hook rather than being skipped. A skip
# and a clean audit print the same nothing, so the Rust dependencies would
# quietly stop being checked the first time somebody cloned without it.
#
# `--file` rather than a directory, because auditing a lockfile needs no
# manifest, no network beyond the advisory database, and no build.
rust_audit() {
  local cargo
  cargo="$(cargo_bin)"
  if ! "$cargo" audit --version > /dev/null 2>&1; then
    echo "$hook: cargo-audit not installed. Install it once with:" >&2
    echo "      cargo install cargo-audit --locked" >&2
    exit 1
  fi
  "$cargo" audit --file mobile/modules/engine-bridge/rust/Cargo.lock
}
