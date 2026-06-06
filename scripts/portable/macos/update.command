#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"
export MPI_RESOURCES_PATH="$ROOT/resources"

echo "Cubric Vision GitHub release updater is not implemented in this skeleton."
echo "Portable root: $CUBRIC_PORTABLE_ROOT"
echo "Manifest: $MPI_RESOURCES_PATH/cubric/update-manifest.json"
echo "No files were changed."
exit 2
