#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"
export CUBRIC_ENGINE_ROOT="$ROOT/engine"
export CUBRIC_MODELS_ROOT="$ROOT/models"
export CUBRIC_USER_DATA_ROOT="$ROOT/user-data"
export MPI_RESOURCES_PATH="$ROOT/resources"
if [ -x "$ROOT/uv/uv" ]; then
  export CUBRIC_UV_BIN="$ROOT/uv/uv"
fi

cd "$ROOT/app"
if [ -x "node_modules/.bin/electron" ]; then
  "node_modules/.bin/electron" .
else
  npm start
fi
