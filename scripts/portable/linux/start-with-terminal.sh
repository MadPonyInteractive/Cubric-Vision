#!/usr/bin/env sh
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
# Prefer the bundled Electron binary directly. The node_modules/.bin/electron
# shim is a symlink that does not survive archiving on all platforms, so do not
# rely on it. Fall back to the shim, then npm, only if the binary is absent.
ELECTRON_BIN="node_modules/electron/dist/electron"
if [ -f "$ELECTRON_BIN" ]; then
  [ -x "$ELECTRON_BIN" ] || chmod +x "$ELECTRON_BIN" 2>/dev/null || true
  "$ELECTRON_BIN" .
elif [ -x "node_modules/.bin/electron" ]; then
  "node_modules/.bin/electron" .
else
  npm start
fi
