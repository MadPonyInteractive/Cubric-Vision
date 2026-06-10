#!/bin/sh
set -eu

# One-time setup for the macOS portable build.
#
# Unsigned, un-notarized downloads (open-source, runs in place) get the
# com.apple.quarantine attribute from the browser. Gatekeeper then blocks the
# launchers BEFORE they run, so the per-launch xattr inside start.command cannot
# clear it in time ("Apple could not verify ... is free of malware").
#
# Run this ONCE, right after unzipping: right-click setup.command -> Open ->
# Open (you only have to approve this one file). It strips quarantine from the
# whole portable folder, after which start.command launches normally by
# double-click — no further prompts.

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

echo "Cubric Vision — clearing the macOS download quarantine on:"
echo "  $ROOT"
echo

xattr -dr com.apple.quarantine "$ROOT" 2>/dev/null || true

echo "Done. You can now double-click start.command to launch Cubric Vision."
echo "(This window can be closed.)"
