#!/usr/bin/env bash
#
# Starts the prediction server and the app together.
#
# Every screen in the app is a forecast, so the app alone can only show its
# error state. Starting the two separately was a step with no useful
# outcome, which is why this is the normal way to run the project.
#
# Use `dev:ui` to run the app on its own, and `dev:server` for the server
# on its own.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The same defaults the server reads, so an override reaches both the
# server and the check below rather than starting one and testing the other.
host="${HOST:-127.0.0.1}"
port="${PORT:-8787}"

# Bash opens the socket itself, so this needs no `curl`. The question is
# only whether something is listening; any reply, including an error,
# answers it.
listening() {
  (exec 3<>"/dev/tcp/$host/$port") 2>/dev/null
}

server=''

if listening; then
  echo "prediction server already listening on $host:$port"
else
  echo "starting the prediction server on $host:$port"

  # Run the server directly rather than through `pnpm --dir server start`.
  # pnpm starts it as a grandchild, so stopping the pnpm process leaves the
  # server holding the port, and the next run finds it taken. `exec` makes
  # this subshell become the server, so `$!` is the process that can
  # actually be stopped.
  #
  # This repeats the `start` script in `server/package.json` and has to stay
  # in step with it.
  (cd "$root/server" && exec node --experimental-strip-types src/index.ts) &
  server=$!

  # Ten seconds. The app asking before the server is ready is the failure
  # this script exists to prevent.
  ready=''
  for _ in $(seq 40); do
    if listening; then
      ready=1
      break
    fi
    sleep 0.25
  done

  if [ -z "$ready" ]; then
    echo "the prediction server did not answer on $host:$port" >&2
    echo "its output is above; the app was not started" >&2
    exit 1
  fi

  echo "prediction server ready on $host:$port"
fi

# Stop only what this script started. A server already running in another
# terminal belongs to that terminal and must survive the app exiting.
#
# There is deliberately no `set -m` here. Job control would put each child
# in its own process group, and the terminal sends Ctrl-C to one group —
# so the app would keep running with the signal going nowhere. Sharing the
# script's group is what lets one Ctrl-C reach both.
cleanup() {
  [ -n "$server" ] || return 0
  kill "$server" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm --dir "$root/hfcast" start
