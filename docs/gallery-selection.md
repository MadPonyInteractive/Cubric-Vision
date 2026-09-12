# Gallery selection — multi-select and Cue all

Split out of [gallery.md](gallery.md) when that file reached the 200-line cap (MPI-733). Card
rendering, media playback and drag-drop stay there. Verify a named symbol still exists before
relying on an entry.

## Selection survives setGroups refresh (2026-07-12)

`MpiGalleryGrid.setGroups()` used to `_selectedIds.clear()` unconditionally → a generation finishing mid-select (which re-feeds the grid) silently dropped the user's multi-select and kicked them out of selection mode. Fix: reconcile instead of clear — keep selected ids whose group still exists, drop only vanished ones, and `_exitSelectionMode()` only when the set empties. Any grid refresh path that replaces `_groups` must preserve live selection, not reset it.

## Selection order is click order — until a shift-click

`_selectedIds` is a `Set`, so ctrl/cmd-click order survives into every context-menu action's `targetIds`, and the `#N` order badge shows it. **Shift-click REPLACES the selection** (`_rangeSelect`): it clears the set and walks from the anchor (the last ctrl-clicked card) to the clicked one in grid order, so earlier ctrl-picks outside that range are dropped. No ordering machinery exists beyond this; anything consuming selection order — Cue all's queue order included — inherits it.

## Cue all — one queued job per selected card (MPI-733)

Select N cards, right-click → **Cue all (N)**. Each eligible card becomes its own queued job, all on the PromptBox's current recipe (prompt, style, LoRAs, controls). It is a context-menu entry because entering selection mode HIDES the PromptBox (`grid.on('selection-start')` → `_pb.el.hide()`), so the Cue button is off screen once a multi-select exists. `hide()` is not `destroy()`, so `getRunPayload()` still returns the live recipe.

**The op is the one the user can SEE, read live.** `MpiGalleryBlock` mounts the grid with `getCueContext: () => ({ operation: activeOperation, model: activeModel })`, and the grid calls it at right-click time. Never `s_selectedOpByModel`: that memory is written only for USER picks, and dragging an image in auto-selects `i2i` programmatically. The first cut read the memory and was wrong both ways — greyed under a visible `i2i`, and still enabled after the chip was cleared and the strip dropped to `t2i`.

**Eligible = the op declares exactly ONE REQUIRED media slot, of the card's type.** `selectCueAllTargets(operation, model, groups)` in `js/data/commandRegistry.js`, reading slots through `getCommandMediaInputs` / `filterMediaInputsForModel` — no whitelist. The looser "any slot of that type" queues jobs that cannot run: two-required-input flows get N graphs missing an input, and optional slots make text ops "batchable". A mixed selection FILTERS to the op's type, so the label counts eligible cards, not selected ones. Zero eligible → disabled, with the reason in `data-info` (the status bar; this app has no tooltips) for `no-operation` / `not-batchable` / `wrong-media-type`.

The batch axis is an image selection; the output can be video — `i2v` / `i2v_ms` batch, so 5 photos → 5 clips. Selecting VIDEO cards batches nothing today because no model declares `extend` (Video Extend ships as a Flow). Correct as-is.

**The swept slot is the user's.** `buildCueAllJobItems(operation, model, staged, card)` takes the role of the LAST staged chip of the batched type — a role pill set to `endFrame` sweeps end frames — falling back to the op's required slot when nothing is staged. Every other staged chip rides along. The card substitutes IN PLACE, never appends: `control` / `krea2Edit` / `kleinEdit` / `qwenEdit` have ORDINAL slots where chip order decides (MPI-330). **So a queue or sidecar check must read the swept slot, not `mediaItems[0]`** — on a two-chip sweep index 0 is the fixed chip.

**Dispatch** is `_cueAllDispatch` in `MpiGalleryBlock.js`: one `getRunPayload()` read, one `enqueueGeneration` per eligible card, and **no `getNextGeneration`** — a batch job must never re-fire itself. **It refuses while Loop is armed** (`state.loopArmed`): `_onLaneDrain` re-fires the last job, so a draining batch would never end, and silently disarming the user's Loop is worse. Two traps kept out on purpose:

- The `grid.on('cue-all')` subscription sits OUTSIDE `_wirePromptBox`, which runs at two mount sites — inside it, a PromptBox remount stacks a second listener and cues every job twice.
- No `_exitSelectionMode()` in the handler: the grid's `onSelect` already exits after every menu action.

Regression spec: `tests/desktop/gallery-cue-all.spec.js`. It mounts through the BLOCK — a grid-only mount hands the op in and cannot see the op source — and holds jobs pending with no GPU by reporting both lanes busy through `generationStore.getSnapshot`. Unit: `tests/cue-all-eligibility.test.cjs`.
