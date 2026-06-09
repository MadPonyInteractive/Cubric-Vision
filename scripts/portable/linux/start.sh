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

# Fully detach the app so it survives this launcher exiting.
#
# This MUST work under file-manager "Run as program" (GNOME Files / Nautilus),
# not just from a terminal. Nautilus tracks the descendants of the script it
# launched and tears them down when the script exits — a backgrounded child
# (`... &`) is still a descendant, so the GUI process was being killed before it
# could draw (the 0.0.3 bug). `setsid --fork` double-forks the child into a NEW
# session reparented to init (PID 1), escaping Nautilus's tracked process group;
# it returns immediately, so we do NOT background it with `&` (that would re-add
# a tracked child). Fall back to `setsid` without --fork, then plain nohup, for
# the rare setsid lacking --fork or absent entirely.
if command -v setsid >/dev/null 2>&1; then
  if setsid --fork sh "$ROOT/start-with-terminal.sh" >/dev/null 2>&1 < /dev/null; then
    :
  else
    # --fork unsupported on this setsid — fall back to backgrounded setsid.
    setsid nohup sh "$ROOT/start-with-terminal.sh" >/dev/null 2>&1 < /dev/null &
  fi
else
  nohup sh "$ROOT/start-with-terminal.sh" >/dev/null 2>&1 < /dev/null &
fi
