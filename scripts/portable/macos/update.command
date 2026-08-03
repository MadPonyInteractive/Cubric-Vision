#!/bin/sh
# Cubric Studio Vision - online updater (macOS).
# Fetches the latest GitHub release's macOS update bundle and applies it.
#
# NO EXTERNAL TOOL ASSUMPTIONS (critical for macOS, which we cannot test). The
# only guaranteed runtime in a portable install is its own bundled Electron
# binary. All network work happens inside update/fetch-release.cjs, run via
# electron-as-node — no curl, no wget, no system node. The Electron binary on
# macOS lives inside the Electron.app bundle.
set -u

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"
export MPI_RESOURCES_PATH="$ROOT/resources"

REPO="${CUBRIC_GITHUB_REPO:-MadPonyInteractive/Cubric-Vision}"
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  PATTERN='^CubricVision-macos-arm64-update-v.*\.zip$'
else
  PATTERN='^CubricVision-macos-x64-update-v.*\.zip$'
fi
DOWNLOAD_DIR="$ROOT/update/downloads"
ELECTRON="$ROOT/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
FETCH="$ROOT/update/fetch-release.cjs"
LOG="$ROOT/update/update.log"
RESULT="$ROOT/update/update-result.json"

mkdir -p "$ROOT/update" 2>/dev/null || true

# MPI-422: the in-app Update button spawns us detached with stdio 'ignore', so with
# no terminal every message below goes to /dev/null and a failure is invisible. When
# stdout is not a tty, log to a file the user can be pointed at instead. A
# double-clicked run keeps its live Terminal output, so no pipe and no lost exit
# status.
if [ ! -t 1 ]; then
  : > "$LOG" 2>/dev/null || true
  exec >>"$LOG" 2>&1
fi

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# MPI-422: the update prompt promises "the app will close, update, and reopen" and
# nothing ever reopened it. Relaunch on BOTH outcomes — after a failure the user gets
# a window and the reason back instead of a machine that looks crashed. start.command
# runs Electron in the FOREGROUND, so it must be detached here or we would block (and
# take the app down with us when the Terminal window closes).
relaunch() {
  if [ -x "$ROOT/start.command" ]; then
    echo "Relaunching Cubric Vision..."
    nohup "$ROOT/start.command" >/dev/null 2>&1 </dev/null &
  else
    echo "Relaunch skipped: $ROOT/start.command not found."
  fi
}

# fail MESSAGE — print an error, pause so a double-clicked .command window does
# not vanish before the error can be read.
fail() {
  printf '{"ok":false,"error":"%s","at":"%s"}\n' \
    "$(json_escape "$1")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$RESULT" 2>/dev/null || true
  echo
  echo "Update failed: $1"
  echo
  relaunch
  printf 'Press Enter to close...'
  read _ 2>/dev/null || read _ </dev/tty 2>/dev/null || true
  exit 1
}

[ -x "$ELECTRON" ] || fail "bundled Electron runtime not found at $ELECTRON. Is this a complete portable install?"
[ -f "$FETCH" ] || fail "updater helper missing at $FETCH. Is this a complete portable install?"

echo "Checking for updates ($REPO)..."
TARGET="$(ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$FETCH" \
  --repo "$REPO" \
  --pattern "$PATTERN" \
  --out-dir "$DOWNLOAD_DIR")" \
  || fail "could not download the update (see the message above)."

[ -n "$TARGET" ] && [ -f "$TARGET" ] || fail "the downloaded update file was not found."

echo "Applying update..."
"$ROOT/update-from-zip.command" "$TARGET" || fail "applying the update bundle failed (see messages above)."

echo
echo "Update applied successfully."
relaunch
