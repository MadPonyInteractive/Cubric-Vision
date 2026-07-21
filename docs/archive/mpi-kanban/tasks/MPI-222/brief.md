# MPI-222 — Per-node version drift → targeted auto-reinstall on boot (no engine wipe)

## Problem
`dev_configs/node_lock.json` pins each custom node to a commit (single source of truth). But **nothing records which commit was actually installed**, and the install/status check is **folder-exists only** (both engines). So when a node's pinned commit bumps — `ComfyUI-MpiNodes` bumps almost every release, to add nodes for new workflows — **existing installs keep the old commit silently**, with no signal and no refresh. MPI-219 was exactly this (MpiNodes `780c7c3 → 2d409b5` / v1.1.4; existing Pods kept the old node).

## Hard constraint (why the simple fix is wrong)
**Do NOT bump/reinstall the ComfyUI engine for a node bump.** MpiNodes bumps constantly; a full engine wipe+reinstall (multi-GB) for a 1.76MB node folder is unacceptable. The refresh must be **per-node and targeted** — only the drifted node reinstalls, engine untouched.

This is why "bump COMFY_VERSION on any shared-node bump" (considered, rejected) fails: it forces the engine-upgrade path for the common case.

## Why versioning is genuinely required
`installOnEngine` nodes are refreshed only by an engine wipe (COMFY_VERSION bump, local) or a Pod image rebuild (remote). Per-model nodes are restored only when **missing** (`getInstalledModelNodeDeps`, folder-exists → a stale-but-present node is skipped). Neither path compares commits. `nodeset_version` in node_lock has **zero consumers**. There is **no stored installed-commit to diff** — that single missing datum is the whole gap.

## Design — extend the EXISTING boot-repair ladder (wiring, not new machinery)

The boot flow already has the exact UX and the targeted-reinstall plumbing. Node drift becomes a 4th case in the same ladder, auto-applied through the same modal — consistent with the ComfyUI-upgrade and missing-dep-repair flows the user already knows.

**Existing machinery (verified):**
- `js/shell.js` `_bootApp()` L235-263: `/engine/version-check` → `needsInstall`/`needsUpgrade` → `MpiEngineInstall` modal `'installing'`/`'upgrading'`; else `/engine/deps-status` → `needsDepsInstall` → modal **`'repairing'`**, SSE drives completion. ← the "repair on boot" the user remembered.
- `routes/engine.js` `POST /engine/repair-deps` L560: reinstalls a **specific dep set** via `startUniversalWorkflowInstall(set, true)` — **no engine wipe**. Targeted per-node reinstall already exists.

**New pieces (small):**
1. **Record installed commit per node (marker).**
   - Local: stamp `<node_folder>/.mpi_node_commit` = the node_lock pinned commit, at install time. Travels with the folder; survives unless the folder is deleted.
   - Remote: record node commit in the wrapper manifest (a `_manifest_record_model` sibling for nodes).
2. **Drift check.** Extend `/engine/deps-status` (local) and the connect-edge `syncModelInstalled` / `remoteModelsCheck` (remote) to compare each installed node's marker vs the node_lock pinned commit. A mismatch → drifted. Fold drifted nodes into the existing `needsDepsInstall` signal so the boot `'repairing'` modal fires.
3. **Targeted reinstall.** Feed the drifted set into the existing per-dep repair path (local `repair-deps` → `startUniversalWorkflowInstall`; remote `remoteInstallDep` with `force`/`requirements_only`): remove the stale folder, re-fetch at the pinned commit, re-run pinned requirements, re-stamp `.mpi_node_commit`. **Engine binaries untouched.**

**UX:** auto-apply, same "installing…" modal as ComfyUI upgrade + boot repair. No new surface. (User: "comfyui already does that … this shouldn't be any different.")

## BOTH engines (do not forget the remote twin)
Local heals via the engine deps-status/`repair-deps` path. **Remote heals via a DIFFERENT path** — the connect-edge `syncModelInstalled` + wrapper install, NOT engine repair. Both must gain the marker + drift check + targeted reinstall. Historically the repo fixes local and forgets remote (see `feedback_check_both_engine_paths` — MPI-122/216 bit twice). Guard test must cover both.

## Enabler (from the same discussion) — collapse the per-model-node class
Only **3** non-engine nodes exist, and moving them is low-risk NOW:
- `ComfyUI-PainterI2Vadvanced` — no requirements (trivial).
- `ComfyUI-LTXVideo` — reqs, already `pipPins` (kornia).
- `RES4LYF` — reqs, already `pipPins` (opencv==5.0.0.93, numpy==2.5.1; the MPI-217 fix).

Move all 3 to `installOnEngine: true` → one node class, uniform refresh. The reason per-model nodes existed (unpinned pip reqs drifting the shared venv — MPI-217: Chroma install dragged opencv 4.13→5.0 for everyone) is **already neutralized** by the pins. Enforce the invariant: **any engine node with `installRequirements: true` MUST have `pipPins`.** Currently `ComfyUI-Impact-Pack`, `comfyui-kjnodes`, `ComfyUI-Frame-Interpolation` have reqs but no pins — pin them too so the shared env is deterministic. (This enabler is optional for the drift fix but makes step 3 uniform and prevents the next MPI-217.)

## Verify
Guard test (both paths): a node_lock commit change flips that node to drifted → boot repair reinstalls it at the new commit → `.mpi_node_commit` re-stamped, on BOTH local (`/engine/deps-status` → `repair-deps`) and remote (connect check → wrapper install). Assert the engine is NOT wiped for a node-only bump.

## Context
Surfaced by MPI-221 (`docs/runpod-troubleshooting.md` § Volume disk-full triage). MPI-117 = build-time node pin (not runtime). MPI-118 = engine-upgrade restores installed-model nodes (missing-only). MPI-217 = the pip-drift precedent that pins already fixed.
