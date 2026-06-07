#!/usr/bin/env sh
# Cubric Studio Vision - DEV/TEST setup (Linux/macOS).
#
# This script ONLY exists in --no-node-modules dev/test builds. Shipped portable
# artifacts bundle node_modules and never need this. It installs the Linux/macOS-
# native dependencies that could not be cross-built on a Windows staging machine.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT"

echo "== Cubric Vision dev/test setup =="

# 1. Node.js + npm
if ! command -v npm >/dev/null 2>&1; then
  echo "!! npm not found."
  echo "   Ubuntu/Mint:  sudo apt update && sudo apt install -y nodejs npm"
  echo "   Fedora:       sudo dnf install -y nodejs npm"
  echo "   macOS:        brew install node"
  echo "   Then re-run ./setup.sh"
  exit 1
fi
echo ">> node $(node --version), npm $(npm --version)"

# 2. uv (Python env manager for the ComfyUI engine bootstrap)
if ! command -v uv >/dev/null 2>&1 && [ ! -x "$ROOT/uv/uv" ]; then
  echo ">> uv not found; installing to ~/.local/bin ..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
if command -v uv >/dev/null 2>&1; then
  echo ">> uv $(uv --version)"
else
  echo ">> uv staged at \$ROOT/uv/uv (used via CUBRIC_UV_BIN)"
fi

# 3. Install native app dependencies from the pinned lockfile
echo ">> Installing app dependencies (npm ci) ..."
cd "$ROOT/app"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
cd "$ROOT"

echo ""
echo "== Setup complete. Launch with: =="
echo "   ./start-with-terminal.sh    (live logs)"
echo "   ./start.sh                  (detached)"
