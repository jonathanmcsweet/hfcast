#!/usr/bin/env bash
#
# Starts the Playwright MCP server for the editor.
#
# `.mcp.json` names this script instead of naming `npx` directly. The
# editor starts a server with the PATH it was given itself, and on many
# machines that PATH has no node on it: node installed by nvm, by fnm,
# by volta or by homebrew is put on the PATH of a terminal, by a line in
# a shell profile, and a program started by the editor never reads that
# profile. Naming `npx` there gives `spawn npx ENOENT`, and the editor
# reports only that the server did not connect.
#
# So this looks for node in the usual places, and puts the one it finds
# on PATH before starting the server. That second part matters: `npx` is
# a script that begins `#!/usr/bin/env node`, so a full path to `npx` is
# not enough on its own — node has to be findable as well.
#
# The same search as `.githooks/pre-push` does for pnpm, over more
# places, because this one runs on a contributor's machine and not only
# in CI.
#
# To check that it works, and to see why when it does not:
#
#     node tools/check-mcp.mjs
#
set -euo pipefail

# The pinned server. Moving this can ask for a new browser build, so run
# `npx playwright install chromium` afterwards. See AGENTS.md.
version=0.0.79

# Where node puts npx when it is not on PATH. Newest first within each
# manager, because these hold every version ever installed.
npx_bin() {
  if command -v npx > /dev/null 2>&1; then
    command -v npx
    return
  fi

  local found
  found="$(
    ls -d \
      "$HOME"/.nvm/versions/node/*/bin/npx \
      "$HOME"/.fnm/node-versions/*/installation/bin/npx \
      "$HOME"/.local/state/fnm_multishells/*/bin/npx \
      "$HOME"/.volta/tools/image/node/*/bin/npx \
      "$HOME"/n/bin/npx \
      "$HOME"/node*/bin/npx \
      /opt/homebrew/bin/npx \
      /usr/local/bin/npx \
      2> /dev/null | sort -V | tail -1
  )"

  [[ -n $found ]] || {
    echo "mcp-playwright: no npx found. Install node 24, or put the" >&2
    echo "node you have on the PATH your editor starts programs with." >&2
    exit 1
  }
  echo "$found"
}

npx="$(npx_bin)"

# node itself, for the `#!/usr/bin/env node` line inside npx.
PATH="$(dirname "$npx"):$PATH"
export PATH

# --browser chromium uses the browser `npx playwright install chromium`
# downloads. Without it the server looks for Google Chrome installed in
# the system and fails where there is none. --headless draws nothing;
# remove it to watch the browser work. --isolated keeps the browser
# profile in memory, so no profile directory is left behind.
exec "$npx" -y "@playwright/mcp@$version" \
  --browser chromium \
  --headless \
  --isolated \
  "$@"
