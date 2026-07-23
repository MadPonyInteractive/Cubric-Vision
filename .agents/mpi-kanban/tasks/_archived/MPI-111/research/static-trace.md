# MPI-111 static trace (pre-repro)

Read suspect functions in MpiGalleryGrid.js, MpiGalleryBlock.js, generationService.js,
activeGenerations.js. Findings below. Two clues do NOT fully reconcile yet — need a
live repro to pick the real source. Recorded so a fresh session doesn't re-derive.

## Render mechanics (confirmed)

- `MpiGalleryGrid._rerenderJustified()` rebuilds rows from `_groups`. For each group it
  calls `_getCardEntry(group)`:
  - new id → fresh `_makeCard` (renders clean via `_render` → `_swapThumbToImage`).
  - existing id → `setGroup(group)` (stores, NO render) + `refreshGroup` ONLY if
    `_getGroupRenderKey` changed.
- Line 1171-1173: every render, `if (group.isGenerating) card.el.setGenerating(group.latestPreviewUrl ?? null)`.
  There is NO inverse branch in this loop — exiting the generating/preview-blob state
  depends entirely on `refreshGroup` firing (renderKey change) or `setDone` (never
  called from the grid).
- `_getGroupRenderKey` (1029) DOES include `isGenerating ? 'generating' : ''`, so the
  generating→done flip changes the key — but only helps if the SAME `_cardMap` entry is
  reused across the flip.
- Preview blob lives on a floating `.mpi-group-card__preview-img` (`_ensurePreviewImage`/
  `_setPreviewImageSrc`), cleared by `_clearPreviewImage` (called from `setDone`,
  `refreshGroup` when !isGenerating, `setGenerating(null)`).
- `_swapThumbToImage` early-returns at line 530 if `getAttribute('src') === src` — cannot
  cause a FRESH card to go stale (src starts empty).

## The Stop-at-completion race (confirmed paths)

- Stop = `pb.on('cancel')` (MpiGalleryBlock ~1173): finds running gallery entry →
  `cancelRunningCueJob(queueJobId)` (or `activeGenerations.cancel`) → **synchronously**
  emits `generation:cancelled {id, tempId}` → Block `_rebuildAfterEnd`:
  `_myGenIds.delete(id)`, `removeCard(tempId)`, `setGroups([...placeholdersForFirst, ...visibleGroups])`.
  Then back in `pb.on('cancel')`: a SECOND `grid.el.setGroups(_visibleProjectGroups())`.
- Real save = `exec.onComplete` (generationService ~952, gallery branch): `await addGroup`
  (fresh `createItemGroup` id — NO collision with tempId), then emits
  `generation:complete {id, tempId, ...}`.
- Block `generation:complete` handler (1250) guards `if (!_myGenIds.has(id)) return`.
  **If Stop already deleted the id, the completed save is swallowed → `_rebuildAfterEnd`
  never runs for the real card.** Same guard on `generation:cancelled`/`error`.

## Leading hypothesis

The `_myGenIds.has(id)` early-return in the `generation:complete` handler drops the grid
rebuild for a job that BOTH completed AND was Stopped. The real saved card is in
`state.currentProject.itemGroups` but the grid was last rebuilt by the cancelled path
(which removed the placeholder). A stale render (placeholder blob OR a prior card the
diff reused) stays until an unrelated `setGroups`.

## UNRESOLVED — the discriminator clue

Brief: "ONLY opening THAT card's OWN history workspace and returning fixes it; opening a
DIFFERENT card's history does NOT." A workspace switch destroys+remounts the gallery
block → a FRESH `_cardMap` either way, which would fix ANY stale `_cardMap` entry on
return — contradicting "only own history." That implies the stale state is in PERSISTED
group data, not the grid instance. BUT: `isGenerating:true` / `latestPreviewUrl` are only
ever set on PLACEHOLDER objects (533, 1141), never on the real `createItemGroup` saved
group, so persisted `isGenerating` is not it either.

=> Both candidate models have a hole. Do NOT ship a fix on this incomplete picture.
Reproduce live, observe the actual stale source (is the stale card the real saved group
or a leftover placeholder? does its DOM still have `--generating` + `.preview-img`? what
does returning-from-own-history actually mutate?), THEN fix.
