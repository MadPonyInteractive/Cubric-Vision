#!/usr/bin/env bash
# MPI-193 self-check — the start.sh node-dedupe canonicalizer + quarantine logic,
# in isolation, against the 4 real dirty volume dir names + the 2 must-keep dirs.
# Asserts: 4 dups quarantined, GGUF + a per-model pack survive, idempotent on re-run.
# Run: bash dedupe_selfcheck.sh   (no deps; uses a mktemp sandbox)
set -euo pipefail

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/baked" "$TMP/volume"
for b in ComfyUI-LTXVideo ComfyUI-MpiNodes comfyui-videohelpersuite comfyui-kjnodes comfyui-impact-pack; do
  mkdir -p "$TMP/baked/$b"; touch "$TMP/baked/$b/__init__.py"
done
# 4 dirty dups (incl. sha-suffixed VHS + case drift) + GGUF (volume-only) + a per-model pack
for v in "ComfyUI-VideoHelperSuite-4ee72c065db2b7ad4d1a2c3d4e5f60718293a4b5" \
         comfyui-kjnodes ComfyUI-MpiNodes ComfyUI-LTXVideo ComfyUI-GGUF ComfyUI-PainterI2Vadvanced; do
  mkdir -p "$TMP/volume/$v"; touch "$TMP/volume/$v/__init__.py"
done

COMFY_CUSTOM_NODES="$TMP/volume"; BAKED_ROOT="$TMP/baked"
_canon() { echo "$1" | tr 'A-Z' 'a-z' | sed -E 's/-[0-9a-f]{40}$//' | tr -d '_.-'; }
run_pass() {
  local BAKED_CANON=" " b d dn n=0
  for b in "$BAKED_ROOT"/*/; do [ -d "$b" ] || continue; BAKED_CANON="${BAKED_CANON}$(_canon "$(basename "$b")") "; done
  for d in "$COMFY_CUSTOM_NODES"/*/; do
    [ -d "$d" ] || continue; dn="$(basename "${d%/}")"
    case "$dn" in *.disabled*) continue ;; esac
    if printf '%s' "$BAKED_CANON" | grep -qF " $(_canon "$dn") "; then
      mv "${d%/}" "${d%/}.mpi193.disabled"; n=$((n + 1))
    fi
  done
  echo "$n"
}

p1=$(run_pass); p2=$(run_pass)
[ "$p1" = 4 ] || { echo "FAIL: pass1 quarantined $p1, expected 4"; exit 1; }
[ "$p2" = 0 ] || { echo "FAIL: not idempotent, pass2 moved $p2"; exit 1; }
[ -d "$TMP/volume/ComfyUI-GGUF" ] || { echo "FAIL: GGUF quarantined (must keep)"; exit 1; }
[ -d "$TMP/volume/ComfyUI-PainterI2Vadvanced" ] || { echo "FAIL: per-model pack quarantined (must keep)"; exit 1; }
echo "OK: 4 dups quarantined, GGUF+per-model kept, idempotent."
