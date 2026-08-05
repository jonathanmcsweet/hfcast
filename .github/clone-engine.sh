#!/usr/bin/env bash
# Clones the engine repository at the tag of one released version.
#
#   clone-engine.sh <version> <directory>
#
# An Android build needs the engine repository, not the published crate:
# the APK has the ionospheric coefficients compiled in and the crate does
# not carry those files. See `build-rust.sh`. So this repository has to
# name a point in the engine's history, and it names the release tag of
# the version in `Cargo.lock` — the same version the server tests install
# from crates.io.
#
# A tag, not a commit hash. This repository names no engine commit at
# all. A hash says nothing about which release it is, it does not tell
# you when the pin is behind, and it can leave the history when a branch
# is rebased. The tag of a published version stays.
#
# `v0.66.6` is the expected name. A tag of `0.66.6` is accepted too,
# because both are common and the release is the same either way.
#
# ENGINE_REPO names the repository. The default is the engine.
set -euo pipefail

version="${1:?usage: clone-engine.sh <version> <directory>}"
dest="${2:?usage: clone-engine.sh <version> <directory>}"
repo="${ENGINE_REPO:-jonathanmcsweet/hfcast-engine}"

git clone --quiet --filter=blob:none --no-checkout \
  "https://github.com/$repo.git" "$dest"

tag=""
for candidate in "v$version" "$version"; do
  if git -C "$dest" rev-parse --verify --quiet "refs/tags/$candidate^{commit}" > /dev/null; then
    tag="$candidate"
    break
  fi
done

if [[ -z $tag ]]; then
  echo "::error::$repo has no tag v$version or $version. Tag that release in the engine repository, then run this again." >&2
  exit 1
fi

git -C "$dest" checkout --quiet "$tag"

# The tag has to carry the version it is named for. A tag put on the
# wrong commit would otherwise build a different engine under the right
# name, and nothing later would notice.
in_repo="$(sed -n '/^\[package\]/,/^\[/ s/^version = "\(.*\)"/\1/p' "$dest/Cargo.toml" | head -1)"
if [[ $in_repo != "$version" ]]; then
  echo "::error::$repo tag $tag holds version $in_repo, not $version" >&2
  exit 1
fi

echo "engine $version from $repo at tag $tag"
