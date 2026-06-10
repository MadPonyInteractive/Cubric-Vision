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

# fail MESSAGE — print an error, pause so a double-clicked .command window does
# not vanish before the error can be read.
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
