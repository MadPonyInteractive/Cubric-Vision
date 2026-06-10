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

if [ -x "$ROOT/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]; then
  ELECTRON_RUN_AS_NODE=1 "$ROOT/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "$ROOT/update/apply-update.cjs" -- --root "$ROOT" --bundle "$1"
elif [ -x "$ROOT/app/node_modules/electron/dist/electron" ]; then
  ELECTRON_RUN_AS_NODE=1 "$ROOT/app/node_modules/electron/dist/electron" "$ROOT/update/apply-update.cjs" -- --root "$ROOT" --bundle "$1"
else
  node "$ROOT/update/apply-update.cjs" --root "$ROOT" --bundle "$1"
fi

# Belt-and-suspenders: re-assert +x on the launchers from the WRAPPER too, not
# only inside the applier (which is itself updated by the bundle, so an old
# applier may lack the exec-bit fix). This wrapper always runs, so the launchers
# end up executable regardless of applier version — restoring the Finder
# double-click "open" path.
for f in start.command start-with-terminal.command update.command update-from-zip.command; do
  [ -e "$ROOT/$f" ] && chmod +x "$ROOT/$f" 2>/dev/null || true
done

# Freshly-written / extracted files can carry Gatekeeper quarantine. Strip it from
# the whole tree so the updated launchers + Electron.app open without a block.
xattr -dr com.apple.quarantine "$ROOT" 2>/dev/null || true
