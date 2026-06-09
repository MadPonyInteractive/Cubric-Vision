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
if [ ! -f "$1" ]; then
  echo "Update bundle not found: $1"
  exit 2
fi

if [ -x "$ROOT/app/node_modules/electron/dist/electron" ]; then
  ELECTRON_RUN_AS_NODE=1 "$ROOT/app/node_modules/electron/dist/electron" "$ROOT/update/apply-update.cjs" -- --root "$ROOT" --bundle "$1"
else
  node "$ROOT/update/apply-update.cjs" --root "$ROOT" --bundle "$1"
fi
