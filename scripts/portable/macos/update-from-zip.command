#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"
export MPI_RESOURCES_PATH="$ROOT/resources"

if [ "${1:-}" = "" ]; then
  echo "Usage: update-from-zip.command path/to/CubricVision-update.zip"
  exit 2
fi
if [ ! -f "$1" ]; then
  echo "Update bundle not found: $1"
  exit 2
fi

echo "Cubric Vision local update validation skeleton."
echo "Portable root: $CUBRIC_PORTABLE_ROOT"
echo "Bundle: $1"
echo "Manifest: $MPI_RESOURCES_PATH/cubric/update-manifest.json"
echo "No files were changed."
exit 2
