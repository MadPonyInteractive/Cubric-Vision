# MPI-90 — Manifest compatibility gate + repair/reinitialize

> Promoted from MPI-64 Phase 3 Step 5 / OPEN-ITEMS F1. App + backend feature.

## Goal

At remote readiness, read `GET /wrapper/manifest` and compare it against the desktop app's expected profile.
Gate generation on an incompatible profile with a clear modal + a repair/reinitialize action — NOT a failed
generation. The manifest is written Pod-side (Phase 3 Step 3 wrapper, atomic upsert) and survives Pod stop/start.

## Decision matrix (from research/volume-manifest-schema.md)

- **Reinitialize** (volume rebuilt): arch-family mismatch (e.g. volume built for Ampere, GPU is Blackwell),
  CUDA mismatch, image-digest mismatch.
- **Repair** (re-fetch/re-run): ComfyUI version, PyTorch version, custom-node/workflow bundle mismatch.
- **Warn** (informational, allow): VRAM below recommended, DC mismatch, a model missing.

Each manifest field has a defined comparison rule (exact / minimum / informational) in the schema doc.

## Likely files

- `routes/remoteEngine.js` / `routes/remoteProxy.js` — fetch + parse `/wrapper/manifest`; run the matrix.
- `routes/platformEngine.js` — readiness integration.
- Settings/status components — the gated modal with Repair / Reinitialize / Warn-and-continue actions.
- `research/volume-manifest-schema.md` (in MPI-64 task workspace) — the schema + comparison rules = source of truth.

## Constraints

- The GPU↔PyTorch arch binding is the key gate (a volume built for one arch family won't run on another —
  proven live, MPI-64 Phase 3). Arch-family exact-match = Reinitialize.
- USER runs live Pod ops; a reinitialize is destructive (rebuilds the volume's engine) — confirm before running.

## Verify

- An incompatible GPU/template/volume profile produces a clear gated state with a repair/reinitialize action,
  not a failed generation.
- A compatible profile proceeds with no gate.

## Related

- MPI-64 (epic), research/volume-manifest-schema.md, MPI-91 (GPU-picker filter — folds into the same compat axis),
  MPI-81 (CUDA floor / image rebuild).
