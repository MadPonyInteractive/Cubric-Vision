#!/usr/bin/env sh
# Cubric Studio Vision - online updater (Linux).
# Fetches the latest GitHub release's linux update bundle and applies it.
#
# NO EXTERNAL TOOL ASSUMPTIONS. A portable install is only guaranteed to have
# its own bundled Electron binary (it IS the app). The original launcher called
# `curl`, which is absent on minimal Linux installs ("curl: not found", exit
# 127) and silently aborted under `set -e`. All network work now happens inside
# update/fetch-release.cjs, run via electron-as-node (the same trick
# update-from-zip.sh uses for the applier) — no curl, no wget, no system node.
# The only thing this script needs is the bundled Electron binary.
set -u

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"
export MPI_RESOURCES_PATH="$ROOT/resources"

REPO="${CUBRIC_GITHUB_REPO:-MadPonyInteractive/Cubric-Vision}"
DOWNLOAD_DIR="$ROOT/update/downloads"
ELECTRON="$ROOT/app/node_modules/electron/dist/electron"
FETCH="$ROOT/update/fetch-release.cjs"
LOG="$ROOT/update/update.log"
RESULT="$ROOT/update/update-result.json"

mkdir -p "$ROOT/update" 2>/dev/null || true

# MPI-422: the in-app Update button spawns us detached with stdio 'ignore', so with
# no terminal every message below goes to /dev/null and a failure is invisible. When
# stdout is not a tty, log to a file the user can be pointed at instead. A
# double-clicked / terminal run keeps its live output, so no pipe and no lost exit
# status.
if [ ! -t 1 ]; then
  : > "$LOG" 2>/dev/null || true
  exec >>"$LOG" 2>&1
fi

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# MPI-422: the update prompt promises "the app will close, update, and reopen" and
# nothing ever reopened it. Relaunch on BOTH outcomes — after a failure the user gets
# a window and the reason back instead of a machine that looks crashed. start.sh
# double-forks itself out of our process group, so it must NOT be backgrounded here.
relaunch() {
  if [ -x "$ROOT/start.sh" ]; then
    echo "Relaunching Cubric Vision..."
    "$ROOT/start.sh" || echo "Relaunch failed."
  else
    echo "Relaunch skipped: $ROOT/start.sh not found."
  fi
}

# fail MESSAGE — print an error, pause so a file-manager "Run as program" launch
# (which closes the window on exit) does not vanish before it can be read.
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
# fetch-release.cjs prints the downloaded zip path on stdout; diagnostics go to
# stderr (shown to the user). Run it as Node via the bundled Electron binary.
TARGET="$(ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$FETCH" \
  --repo "$REPO" \
  --pattern '^CubricVision-linux-x64-update-v.*\.zip$' \
  --out-dir "$DOWNLOAD_DIR")" \
  || fail "could not download the update (see the message above)."

[ -n "$TARGET" ] && [ -f "$TARGET" ] || fail "the downloaded update file was not found."

echo "Applying update..."
"$ROOT/update-from-zip.sh" "$TARGET" || fail "applying the update bundle failed (see messages above)."

echo
echo "Update applied successfully."
relaunch
