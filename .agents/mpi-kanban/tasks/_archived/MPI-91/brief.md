# MPI-91 - Auto-filter unsupported cards in the GPU picker

> Promoted from MPI-64 Phase 3 Step 5.2 / OPEN-ITEMS F3. User request 2026-06-12. App-UI feature.

## Problem

Connecting to a card whose DC-host driver can't meet the active image's CUDA floor fails at container init with
a raw `nvidia-container-cli: cuda>=12.8` refusal (HOST-driver mismatch, not card arch - the 4090 wall, MPI-64
Step 5.1). The picker currently offers these cards anyway -> the user picks one, waits, and Connect dies cryptically.

## Goal

Cross-check the image CUDA floor (from `POD_IMAGE` / manifest) against RunPod's per-card/DC CUDA capability and
**gray-out or badge** incompatible cards with a clear reason ("needs a newer-driver host / not available for this
engine's CUDA in {DC}"), so Connect never fails at container init for a foreseeable reason.

## Data sources

- **Image CUDA floor:** the active `POD_IMAGE` tag (cu124 / cu128 / future cu130) -> its CUDA floor.
- **Host CUDA capability:** RunPod's GraphQL `gpuTypes` / availability - RunPod's OWN console filters its
  dropdown by required CUDA, so the data exists in their API (find the field; may be on availability per-DC).
- Data axis = image CUDA floor vs host-driver-provided CUDA, **per card/DC** (NOT per card arch alone).

## Likely files

- `routes/runpodRemote.js` - the `gpuTypes` / availability query (add the CUDA-capability field if not present).
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` - the GPU picker render: gray-out/badge +
  reason; block selecting an incompatible card.

## Verify

- A card whose DC-hosts can't meet the image CUDA floor is shown disabled/flagged with a clear reason and never
  produces the raw `nvidia-container-cli` failure at Connect.
- A compatible card connects normally.

## Related

- MPI-64 (epic), MPI-90 (manifest-compat gate - same compatibility axis, folds together), MPI-81 (CUDA-floor
  image strategy / cu130 - changes which cards qualify), MPI-64 Step 5.1 (the host-driver wall).
