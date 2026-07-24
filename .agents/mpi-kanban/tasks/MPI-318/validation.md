# MPI-318 — Validation

## Result: PASS (user-verified live, 2026-07-24)

Single-card drag-out to the OS file system, shipped via Chromium `DownloadURL`.

### What was verified
- **Drag a card out to a folder** → file lands with its real Media-folder
  filename (e.g. `t2i_001.png`), not the old generic `project-file.png`.
- **Drag a card onto the prompt** → still adds as a media chip. In-app
  drag-to-prompt is intact — the exact behaviour the prior attempt broke.

### Why the prior revert can't recur
The fix sets `DownloadURL` **alongside** the existing `application/mpi-media`
on the same HTML5 drag, with **no `preventDefault`, no `startDrag`, no IPC**.
The in-app drag fires normally, so its consumers (PromptBox `getData`,
gallery/group-history `types`-sniff) are untouched. The revert was caused by
`preventDefault()` (required by `startDrag`) killing that HTML5 drag.

### Scope
- **Single card per drag only** — `DownloadURL` is capped at one file by
  Chromium. Multi-select export was explicitly dropped by the user to avoid the
  `startDrag` + IPC + `main.js` surface. Upgrade path if ever wanted: native
  `webContents.startDrag({ files, file, icon })` gated behind selection count.

### Touch points
- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` — `_addDownloadUrl`
  helper + `_EXPORT_MIME` map; called in both dragstart handlers (image + video).
- No other files. `main.js` deliberately untouched.
