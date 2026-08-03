#!/usr/bin/env bash
#
# Puts CanvasKit where the web build can serve it.
#
# Skia's web runtime is a WASM blob that the bundle fetches at run time
# rather than importing, so Metro never sees it and never copies it. The
# file has to be in `public/`, which Expo copies to the root of `dist/`.
# Without this the web build asks for /canvaskit.wasm and gets a 404,
# and the map silently keeps its fallback for ever.
#
# Copied from node_modules rather than committed: 8 MB of binary in the
# history is worth avoiding, and a committed copy goes stale against the
# JavaScript API a Skia upgrade brings — which breaks at run time, in a
# browser, rather than at build time here.
#
# Run before `expo export --platform web`. Safe to run repeatedly.
set -euo pipefail

mobile="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$mobile/node_modules/canvaskit-wasm/bin/full/canvaskit.wasm"
dest="$mobile/public/canvaskit.wasm"

if [[ ! -f $src ]]; then
  echo "no CanvasKit at $src — is @shopify/react-native-skia installed?" >&2
  exit 1
fi

mkdir -p "$mobile/public"
cp "$src" "$dest"
echo "canvaskit.wasm -> public/ ($(du -h "$dest" | cut -f1))"
