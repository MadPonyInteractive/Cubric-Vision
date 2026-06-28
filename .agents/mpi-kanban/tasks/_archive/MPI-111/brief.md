# MPI-111 — Gallery stale thumbnail sticks on card after Stop-at-completion

## START HERE — read these BEFORE grepping the codebase

This bug lives in a complex render-reuse diff. Do NOT start by reading every
gallery file. First consume the existing knowledge:

1. **`docs/PROJECT.md`** — orientation hub; find the gallery / project-data /
   media subsystem docs it points to. Read the relevant ones.
2. **`.claude/rules/components.md`** (§ observer lifecycle/teardown, Stage
   baseline) + the **Component Mount/Event/State maps** (`.claude/rules/component-mounts.md`,
   `component-events.md`, `component-state.md`) for who mounts the gallery grid,
   what events drive it, and which state keys it reads.
3. **Project memory** (`~/.claude/projects/c--AI-Mpi-Cubric-Vision/memory/MEMORY.md`)
   — relevant entries: `gallery_card_chrome`, `gallery_slider_sizing`,
   `gallery_video_thumb_pattern`, `queue_panel_render_diff`,
   `canvas_viewer_spinner_flags`. These describe the render-diff + thumb-promotion
   patterns already known. Likely the answer (or strong hints) is here.
4. `docs/project-integrity.md` — project.json / .meta / history-item shape, in
   case the bug is a save-overwrite-same-path staleness.

Only AFTER the above, grep the two suspect files. Don't re-read whole files at
different offsets — read the specific functions named below once.

## Symptom (reproducible, observed live 2026-06-17)

A gallery card displays the WRONG thumbnail image — a latent-preview blob or a
final image from a DIFFERENT (earlier) generation — while the card's own
metadata (filename e.g. `t2i_018`, dimensions e.g. 832×1024 / 1344×768) is
CORRECT. Opening the card shows the RIGHT saved image; only the gallery
thumbnail is stale.

**Repro:** queue ~4 gallery generations via Cue; press STOP on one job right as
it finishes (a fast ~2s gen). The card that was generating around the stop ends
up showing a stale image from a previous run.

**Sticky — does NOT refresh on:** size-slider resize, creating a new generation,
reopening the project from the project page, opening a DIFFERENT card's history
and returning.

**Only fix:** open THAT card's OWN history workspace and return to the gallery.

## Why this is NOT an MPI-74 (Phase 6 concurrency) bug

The two-lane concurrency + per-engine Stop work (MPI-74) is correct and
live-verified. It merely makes the Stop-at-the-instant-of-completion race easy to
hit. The stale image is a GALLERY RENDER-REUSE problem, independent of which
engine ran the job. Fix it in the gallery grid, not in generationService /
comfyController.

## Suspect code (read these functions, not whole files)

- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`
  - `generation:preview` handler (~1228): paints latent blobs onto the
    PLACEHOLDER card via `grid.el.updatePreview(tempId, blobUrl)`.
  - `_rebuildAfterEnd` (~1241): on complete/cancelled/error →
    `grid.el.removeCard(tempId)` then `grid.el.setGroups([...placeholders, ...savedGroups])`.
- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`
  - `_getCardEntry` (~1058): cards cached in `_cardMap` by `group.id`; reused
    unless `_getGroupRenderKey` (~1030) changed → only then `refreshGroup`.
  - `_getGroupRenderKey` (~1030): the signature. Does it FULLY cover the
    thumbnail source of the selected history item? If `sel.filePath` is identical
    but the file/blob content changed, the signature matches and the image is
    never re-swapped.
  - `_swapThumbToImage` (~504): early-returns if
    `imageThumb.getAttribute('src') === src` (~530). Plus `_stabilizedIds` (~88),
    `_aspectRatioCache` (~90), and an IntersectionObserver thumb promotion.
  - `el.updatePreview` (~1330): sets the blob directly on the card DOM, BYPASSING
    the signature — prime suspect for a blob leaking onto a reused card.

## Hypotheses to confirm/refute (pick the real one)

1. A placeholder's preview blob (set via `updatePreview`) survives onto the
   reused/rebuilt card because the new saved card's `<img src>` swap is suppressed
   by the `getAttribute('src') === src` early-return or `_stabilizedIds`.
2. `_getGroupRenderKey` doesn't change between stale and correct state (same
   `sel.id`/`filePath`), so `refreshGroup` never re-swaps the image.
3. A blob URL is shared/reused across generations such that two cards inherit the
   same `<img>` element/src.
4. Save-overwrite-same-path: the saved file path is reused, signature matches,
   stale cached image stays.

The "only the card's OWN history workspace fixes it" clue is decisive — that path
forces a fresh `_makeCard` / busts `_stabilizedIds`+`_aspectRatioCache` for that
group, while plain `setGroups` reuses the cached entry. Trace exactly what that
path does differently.

## Done when

- The wrong thumbnail NEVER persists after a Stop-at-completion (or any gen end);
  the card shows its own saved image on the next render without a workspace switch.
- Healthy (non-stop) generations still render correctly with no flicker /
  no extra re-render churn (don't regress the render-diff perf).
- Verify live: repro the Stop-at-completion sequence; confirm the card self-heals
  in the gallery without leaving + re-entering its history.

## Constraints

- App-only, frontend. No backend route change, no Pod image rebuild.
- Follow the gallery render-diff contract (signature-based, in-place patch) — do
  NOT switch to full-rebuild-on-every-event (that regresses `:hover` stability and
  perf; see `queue_panel_render_diff` + `gallery_slider_sizing` memory).
- Surgical: the fix should be a signature/invalidation correction or a blob-swap
  fix, not a gallery rewrite.
