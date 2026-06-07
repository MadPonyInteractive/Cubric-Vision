#!/usr/bin/env sh
# Install a per-user .desktop entry + icon so the Linux taskbar/dock shows
# "Cubric Vision" and our logo instead of "Electron" + the default Electron icon.
#
# Why this is needed: the portable app runs the unpackaged `electron` binary
# directly. On X11 the window's WM_CLASS comes from package.json `name`
# (cubric-vision) and on Wayland the app_id comes from `desktopName`
# (cubric-vision.desktop). GNOME/KDE map that class to an icon ONLY via a
# matching .desktop file (StartupWMClass=) whose Icon= resolves through the
# hicolor icon theme. No system install step exists for a portable app, so the
# launcher calls this on first run. Everything is written under ~/.local — no
# root required. Re-running is cheap and idempotent (paths are refreshed in case
# the portable folder moved).
set -eu

ROOT="${CUBRIC_PORTABLE_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}"
ICON_SRC="$ROOT/cubric-vision.png"
LAUNCHER="$ROOT/start.sh"

APPS_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
DESKTOP_FILE="$APPS_DIR/cubric-vision.desktop"

# Nothing to install if the icon is missing (e.g. a stripped build).
[ -f "$ICON_SRC" ] || exit 0

mkdir -p "$APPS_DIR" "$ICON_DIR"
cp -f "$ICON_SRC" "$ICON_DIR/cubric-vision.png" 2>/dev/null || true

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Cubric Vision
Comment=Local Open Source Image and Video Generator
Exec="$LAUNCHER"
Icon=cubric-vision
Terminal=false
Categories=Graphics;Photography;AudioVideo;
StartupWMClass=cubric-vision
StartupNotify=true
EOF

# Refresh the desktop database + icon cache where the tools exist. All optional;
# the .desktop/icon files alone are enough on most DEs after the next relogin.
update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true

exit 0
