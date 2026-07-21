# MPI-284 Validation

## What shipped
Waiting mascot (`assets/mascot/waiting.png`) floats absolute bottom-right on the
Model-Library card thumb while an install job sits `queued`; removed the moment
it transitions to `downloading`. Reuses the shared history-viewer peek asset —
no new asset added.

- `_buildTile` appends `.mpi-tile__mascot` img, gated `st.downloadState==='queued'`.
- `_tileInstances` stores the `mascot` ref.
- `_patchTile` toggles `.mpi-tile__mascot--visible` on every state patch → auto-removes on queued→downloading.
- CSS `.mpi-tile__mascot` (float anim, opacity fade), mirrors `.mascot-peek`.

## Validation
User-verified 2026-07-15 (v1.2.0, live Electron): screenshot shows "Queued…"
label on SDXL NSFW card during a queued install behind an active download;
mascot behaviour confirmed working. User approved ("awesome").
