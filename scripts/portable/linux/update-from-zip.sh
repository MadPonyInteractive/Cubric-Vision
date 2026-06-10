#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"
export MPI_RESOURCES_PATH="$ROOT/resources"

if [ "${1:-}" = "" ]; then
  echo "Usage: update-from-zip.sh path/to/CubricVision-update.zip"
  echo
  echo "This script must be run from a terminal with the update zip path as an"
  echo "argument. Double-clicking it in a file manager will not work (no zip"
  echo "given, and the window closes before you can read this). For an automatic"
  echo "download-and-apply from the latest GitHub release, run update.sh instead."
  exit 2
fi
# Accept a .zip file OR an already-extracted directory. Some file managers
# auto-extract a downloaded archive; apply-update.cjs handles both (MPI-62).
if [ ! -e "$1" ]; then
  echo "Update bundle not found: $1"
  exit 2
fi

if [ -x "$ROOT/app/node_modules/electron/dist/electron" ]; then
  ELECTRON_RUN_AS_NODE=1 "$ROOT/app/node_modules/electron/dist/electron" "$ROOT/update/apply-update.cjs" -- --root "$ROOT" --bundle "$1"
else
  node "$ROOT/update/apply-update.cjs" --root "$ROOT" --bundle "$1"
fi

# Belt-and-suspenders: re-assert +x on the launchers from the WRAPPER too, not
# only inside the applier. The applier is itself updated by the bundle, so when
# an OLD applier applies a new bundle its exec-bit fix may be absent — but this
# wrapper always runs, so the launchers end up executable regardless of applier
# version. Restores the file-manager "Run as program" / double-click path.
for f in start.sh start-with-terminal.sh update.sh update-from-zip.sh resources/setup-desktop.sh; do
  [ -e "$ROOT/$f" ] && chmod +x "$ROOT/$f" 2>/dev/null || true
done
