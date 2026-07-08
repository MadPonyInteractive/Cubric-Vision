# Fix stale-reference bugs: deleted-preview upload 404 + stale card poster/thumb

## Current State

Project mode: scalable-foundation.

Two bugs, one family (a reference outliving the thing it points at). Root cause
fully diagnosed and confirmed against the on-disk Chroma project + `logs/app.log`
(delete at `10:42:29` → 404 at `10:42:47`). No further investigation needed.

**Bug 2 (HIGH — generation-blocking):** Deleting a *preview* card while a
generation sourced from that preview is queued/running strands its start-frame.
The start-frame upload is lazy — it runs at dispatch inside `runWorkflow`, not at
enqueue. The delete handler removes `Media/.preview-assets/<id>/startFrame.png`
(`routes/projects.js:868-872`), then `_uploadImage` (`js/services/comfyController.js:1347`,
called from the asset-upload loop at `:1043-1051`) does `fetch(deletedUrl)` → HTTP
404 → throws the raw `Failed to prepare blob for mpi_input_start_frame.png` error,
which surfaces as the crash + GitHub-report dialog (`ui:error` opens a dialog per
the error-vs-toast convention). `_uploadImage` is the SHARED path — one instance
per engine, same method — so a single fix covers **both local and remote** engines.
Deleting a preview mid-generation is a legitimate, common user action; the app must
degrade gracefully, not crash.

**Bug 1 (stale card paint — video posters + any in-place image overwrite):**
`/project-file?path=…` URLs carry no version token. On a preview→final replace,
`save-generation` reuses the sidecar id (`id = replaceItemId`) and overwrites the
video poster at `.meta/<id>.thumb.jpg` — the **same file path** → the returned
`thumbPath` URL string is identical. `_swapThumbToImage` early-returns when
`imageThumb.getAttribute('src') === src` (`js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js:609`),
and even if it didn't, the browser HTTP cache serves the stale bytes for the
unchanged URL. Net effect: the card keeps painting the OLD poster/frame until a
full card re-mount (navigate away + back) forces a cache-miss. Same class hits any
image whose file is overwritten in place under a reused path. (The main media
`filePath` gets a fresh sequence number on replace, so it already refetches — only
in-place-overwritten URLs, chiefly `<id>.thumb.jpg`, are stale.)

Confirmed non-causes (do not re-investigate): browser-vs-app WS preview bleed
(separate `clientId` per renderer), preview-header corruption (SOI-scan strip),
card object reuse across gallery gens (cards are per-tempId, removed on complete),
and backslash `%5C` path separators (normalized fine on Windows).

## Implementation

- [ ] **Bug 2 — fail soft on a deleted frame source.** In the asset-upload loop
      in `js/services/comfyController.js` (`~:1043-1051`, the `_uploadImage` call
      site shared by both engines), detect an upload failure whose source is a
      `/project-file` URL that no longer resolves (HTTP 404 from `_uploadImage`'s
      `fetch`), and convert it into a clear, friendly failure instead of the raw
      blob-prepare throw: emit a `ui:error` dialog worded for the user (e.g. "The
      input image for this generation was deleted. Re-add it and try again.") and
      settle the job cleanly (no orphan). Keep the raw error for non-frame /
      non-404 upload failures. Do NOT block the delete action itself — deleting a
      preview mid-gen stays allowed; the fix is graceful degradation. Confirm the
      one code path covers local AND remote (single `_uploadImage`).
- [ ] **Bug 1 — version-stamp media URLs at save.** In `routes/projects.js`
      `save-generation`, append a cache-busting `&v=<file mtime ms>` to the
      `filePath` and `thumbPath` `/project-file?path=…` URLs it writes into the
      sidecar (both the fresh-save and the `replaceItemId` branches; poster at
      `:1614-1618` is the key one). Use the actual written file's mtime so an
      in-place overwrite always mints a new URL → the `_swapThumbToImage`
      same-URL guard passes AND the browser cache misses. Verify the `/project-file`
      route ignores the extra `v` query param (it reads only `path`) so nothing
      else breaks. Do not weaken the same-URL guard — it is correct; the URL is the
      thing that must change when content changes.
      **Verify:** drive the real app (see Verification).

## Completed

- [ ] Nothing yet.

## Remaining Work

- Implement both fixes (one JS service change, one route change).
- Drive the real app to confirm both behaviors.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Both bugs have a UI surface the user must see in the running Electron app.

1. **Bug 2:** Start a multi-stage i2v generation from a preview, then delete that
   preview card while the generation is in flight. Expect a clear, friendly error
   dialog ("input image was deleted…"), NOT the raw `Failed to prepare blob for
   mpi_input_start_frame.png` GitHub-report crash. The app stays usable; no orphan
   job left running. Check `logs/app.log` shows the soft path, not the raw throw.
2. **Bug 1:** Run a preview→final (Finish) on a video multi-stage card. The card's
   poster/thumbnail must update to the FINAL video's frame immediately on
   completion, WITHOUT navigating away and back. Repeat for an image op that
   overwrites in place. Confirm no stale frame lingers.

Also run the repo's normal checks (lint / any guard tests touching the changed
files) before marking complete.

## Preservation Notes

- Durable knowledge home: `docs/ui-gotchas.md` already owns the MpiToast /
  gallery-card DOM lessons — add a short "§ /project-file URLs need an mtime
  cache-bust; in-place overwrites (video posters) go stale without it" note there
  when the fix lands. Download/preview-asset lifecycle lives in
  `docs/download-manager.md`; note the delete-strands-in-flight-frame + fail-soft
  there if it fits the ≤200-line budget.
- The `_uploadImage` shared-both-engines property is exactly the
  `feedback_check_both_engine_paths` pattern — one fix, both engines; note it in
  the card close-out so the repo does not "forget one twin".
- No `.claude/rules/` change expected (no new component / event / state wiring).
