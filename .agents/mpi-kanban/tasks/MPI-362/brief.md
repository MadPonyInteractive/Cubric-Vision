# MPI-362 — Mask composite (Add / Subtract) in image history

## What the user asked for

A context-menu action in the **image** history workspace, gated like Compare on **exactly two
selected entries**, where one of them carries a mask. It opens a dialog with three choices —
**Add**, **Subtract**, **Cancel** — each with a one-line explanation. The mask decides which
pixels come from which entry.

Motivating case: an upscale/detail pass morphs one of two cats. Mask the morphed cat and
composite, and that region comes back from the previous entry.

## Direction semantics

`M` = the entry that carries the mask. `O` = the other selected entry.

| Choice | Base (everything outside the mask) | Inside the mask |
|---|---|---|
| **Add** | `M` | `O` — the other entry is added *into* the mask |
| **Subtract** | `O` | `M` — the mask is subtracted *from* the other entry |

They are the same operation with base/overlay swapped, which is why one mask serves both.

## Engine decision — Sharp, not ComfyUI, not canvas

Sharp `^0.34.5` is already a dependency and already does the equivalent job for
`POST /project/crop-media`. It has every primitive needed:

- `.resize(w, h, { fit: 'fill' })` — conform overlay + mask to the base (matches the
  stretch semantics `pasteMaskLayersToEntry` already has).
- `.greyscale().blur(sigma)` — the feather.
- `.joinChannel(maskRaw)` — turn the feathered mask into the overlay's alpha channel.
- `.composite([...])` — lay the alpha'd overlay over the base.

No ComfyUI workflow, no model, no generation lane. Server-side also avoids pushing a ~27MB
base64 string of a 4K PNG back through the upload route — only the (small) mask travels, and
Sharp reads both source images straight off disk.

## Implementation

1. **`services/imageComposite.js`** (new, server) — `compositeThroughMask({ basePath,
   overlayPath, maskBuffer, outPath, feather })`. General purpose: any two images, any mask,
   any feather. Feather defaults to `min(w,h)/400` (≈2.5px at 1024) and is a request-body knob.
2. **`POST /project/composite-media`** in `routes/projects.js` — mirrors `crop-media`:
   monotonic `nextSequence(folderPath, mediaDir, 'composite', ext)`, `.meta/<uuid>.json`
   sidecar, image thumb (`extractImageThumb`), returns `{ itemId, filename, filePath,
   displayName, pixelDimensions }`.
3. **`MpiMaskCompositeDialog`** (new Compound) — `MpiModal` + three `MpiButton`s + per-option
   explainer copy naming both entries. Emits `add` / `subtract` / `cancel`.
4. **`MpiHistoryList`** — one more context-menu row (`layers` icon), image-only, enabled when
   exactly 2 entries are targeted and at least one has a mask (reuses the existing async
   `hasMaskForIndex` prop). Emits `composite-requested { indices }`.
5. **`MpiGroupHistoryBlock`** — resolves which entry owns the mask, pulls the mask via
   `viewer.el.getMaskDataURLForEntry(item)`, opens the dialog, POSTs, then appends the result
   with `createImageItem` + `appendToHistory` — the exact path `crop-applied` already uses.

## Traps respected

- Mask polarity is white-on-black (`getMaskDataURL('black', 'white')`) — white = the masked
  region, same convention the generation path ships to ComfyUI.
- `getMaskDataURLForEntry` returns the **live canvas** mask for the on-screen entry and the
  TEMP composite for the other, so an unsaved stroke is not lost.
- Masks are session TEMP files, not sidecars ([[project_masks_temp_files_not_memory]]) — the
  composite result is a real file, so the output survives the restart the mask does not.
- Filenames go through `nextSequence` (monotonic) — never re-mint a deleted number
  ([[project_sequenced_filename_reuse_orphan]]).
- `composite` is a client-driven tool op like `crop`/`snapshot`, which are absent from
  `operation_registry.json` — no registry entry and no version bump.

## Check

`tests/mask-composite.test.cjs` — builds a red base, a blue overlay and a half-white mask,
runs `compositeThroughMask`, and asserts the unmasked half stayed red while the masked half
became blue, in both directions, with the feather confined to the seam.
