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

# fail MESSAGE — print an error, pause so a file-manager "Run as program" launch
# (which closes the window on exit) does not vanish before it can be read.
fail() {
  echo
  echo "Update failed: $1"
  echo
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
