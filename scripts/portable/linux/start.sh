#!/usr/bin/env sh
# Cubric Studio Vision - default launcher (no terminal window).
# Runs the app detached so no console stays attached and closing the
# launching shell (if any) will not kill the app. If you need to see
# console output for diagnostics, use start-with-terminal.sh instead.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# Prefer setsid to fully detach from any controlling terminal; fall back to
# plain nohup background when setsid is unavailable.
if command -v setsid >/dev/null 2>&1; then
  setsid nohup "$ROOT/start-with-terminal.sh" >/dev/null 2>&1 < /dev/null &
else
  nohup "$ROOT/start-with-terminal.sh" >/dev/null 2>&1 < /dev/null &
fi
