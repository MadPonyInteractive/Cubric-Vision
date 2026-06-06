#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"
export MPI_RESOURCES_PATH="$ROOT/resources"

if [ "${1:-}" = "" ]; then
  echo "Usage: update-from-zip.sh path/to/CubricVision-update.zip"
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
