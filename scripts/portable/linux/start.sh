#!/usr/bin/env sh
# Cubric Studio Vision - default launcher (no terminal window).
# Runs the app detached so no console stays attached and closing the
# launching shell (if any) will not kill the app. If you need to see
# console output for diagnostics, use start-with-terminal.sh instead.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"

# Install/refresh the per-user .desktop entry + icon so the taskbar shows
# "Cubric Vision" and our logo (not "Electron"). Idempotent and non-fatal.
# Done here too (not only via start-with-terminal.sh) so the branding lands
# even on the no-terminal default path before we detach.
if [ -f "$ROOT/resources/setup-desktop.sh" ]; then
  sh "$ROOT/resources/setup-desktop.sh" >/dev/null 2>&1 || true
fi

# Invoke through `sh` (not direct exec) so a dropped exec bit on
# start-with-terminal.sh does not silently no-op the launch. Archiving can
# strip exec bits on some platforms; `sh <file>` ignores the bit entirely.
# Also self-chmod as a belt-and-suspenders for any direct callers.
chmod +x "$ROOT/start-with-terminal.sh" 2>/dev/null || true

# Prefer setsid to fully detach from any controlling terminal; fall back to
# plain nohup background when setsid is unavailable.
if command -v setsid >/dev/null 2>&1; then
  setsid nohup sh "$ROOT/start-with-terminal.sh" >/dev/null 2>&1 < /dev/null &
else
  nohup sh "$ROOT/start-with-terminal.sh" >/dev/null 2>&1 < /dev/null &
fi
