#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export CUBRIC_PORTABLE_ROOT="$ROOT"
export MPI_RESOURCES_PATH="$ROOT/resources"

REPO="${CUBRIC_GITHUB_REPO:-MadPonyInteractive/Cubric-Vision}"
PATTERN='CubricVision-linux-x64-update-v[^"]*\.zip'
DOWNLOAD_DIR="$ROOT/update/downloads"
mkdir -p "$DOWNLOAD_DIR"

API_JSON="$DOWNLOAD_DIR/latest-release.json"
curl -fsSL -H 'User-Agent: CubricVision-Updater' "https://api.github.com/repos/$REPO/releases/latest" -o "$API_JSON"
ASSET_URL="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const asset=(data.assets||[]).find(a=>/^CubricVision-linux-x64-update-v.*\\.zip$/.test(a.name)); if(!asset) process.exit(2); console.log(asset.browser_download_url);" "$API_JSON")"
ASSET_NAME="$(node -e "const url=new URL(process.argv[1]); console.log(url.pathname.split('/').pop());" "$ASSET_URL")"
TARGET="$DOWNLOAD_DIR/$ASSET_NAME"
curl -fL -H 'User-Agent: CubricVision-Updater' "$ASSET_URL" -o "$TARGET"
"$ROOT/update-from-zip.sh" "$TARGET"
