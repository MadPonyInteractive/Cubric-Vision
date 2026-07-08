# Content-addressed permanent preview-assets store + manual Cleanup GC + reuse video/audio toggles

## Current State

Project mode: **scalable-foundation**. This is an architecture-level refactor of
the preview-assets subsystem. Root problem: preview-assets were meant to be a
DURABLE store keeping Reuse Prompt independent of source cards
(`docs/project-integrity.md` §121-125), but they are (a) stored per-item
(`.preview-assets/<itemId>/startFrame.png`) so 100 reuses of one image = 100
copies, and (b) DELETED when the owning card is deleted — so a reused frame
404s the next generation ("Generation failed / input image deleted" dialog,
MPI-225). This card makes the store **content-addressed, deduped, and permanent**
so that failure is structurally impossible, adds a manual Cleanup GC, and expands
Reuse to Video + Audio.

Investigation complete (4 read-only agents; notes in `research/`). Surfaces fully
mapped — no further discovery needed before implementing.

### Locked decisions (do NOT re-litigate)

1. **Dedup key = SHA-256, flat store.** `Media/.preview-assets/<sha256>.<ext>`.
   On place: hash bytes → file exists? reference it : write it. One image reused
   100× = ONE file. Sidecar reuse refs point at the hash path.
2. **Migration = one-time on project load.** Flatten + dedup existing per-item
   `.preview-assets/<itemId>/` into the flat store; rewrite sidecar refs
   (`generationSettings.mediaItems`, `previewAssets.snapshots`,
   `frozenParams.mediaItems`). Old projects keep working.
3. **GC = manual only.** No auto-GC, no dedup-on-delete, no per-item folder
   removal on card delete. Add "Cleanup" to the projects-page context menu →
   MpiOkCancel confirm → OK wipes the whole flat store for that project. Reuse
   after cleanup → WARNING TOAST "Cannot reuse — prompt assets no longer exist"
   (not an error dialog; `feedback_error_dialog_vs_toast`).
4. **Reuse dialog gains "Use Video" + "Use Audio"** toggles beside "Use Images".
5. **Soft-fail net stays** as last-resort, DOWNGRADED to a `ui:warning` toast.

### Key facts from investigation (file:line)

**No refcounting needed.** Because normal delete NEVER removes a content file
(only manual Cleanup wipes all), a SHA file shared by N sidecars is simply never
deleted until Cleanup. This collapses agent-1's refcount concern — the simplest
model is correct.

**Write sites (11)** — all in `routes/projects.js` unless noted:
- `_materializeLatent` L321-354 (latents — SEE SCOPE below)
- `materializePreviewAssets` L366-397 (startFrame/endFrame snapshots + frozenParams rewrite)
- `materializeGenerationFrameSnapshots` L449-461 (i2v generationSettings frame snapshots)
- `save-generation` L1501/1627/1644 (primary media, thumb, sidecar — NOT preview-assets, unchanged)
- `/extend-video` `routes/videoConcat.js:313-327` (frame snapshots for extended item)
- `replaceItemId` Finish SKIPS materialization at L1531 (`if (!replaceItemId)`) → a
  final card's `generationSettings.mediaItems` keeps preview-era refs.

**Materialized snapshot shape** (sidecar `previewAssets.snapshots[]`):
`{ role, mediaType, originalUrl, filename, relativePath, filePath, status }` —
`filePath` is the authoritative read path promptReuse uses. Content-addressing
just changes `filename`/`relativePath`/`filePath` to the SHA path.

**Delete sites to NEUTRALIZE (only 2):**
- `routes/projects.js:861-866` — latent delete on card-delete (SEE SCOPE)
- `routes/projects.js:868-872` — `.preview-assets/<itemId>/` folder delete on card-delete → THIS is the bug; remove it.
- All other delete/GC (media/sidecar/thumb on card-delete L846-879; save-gen orphan GC L1664-1726; reconciler `/delete-meta` L2030-2038) touch ONLY media/sidecar/thumb — LEAVE ALONE.
- `delete-project` L714 (whole folder) — unchanged.

**SHA-256 idiom (repo-native):** `routes/downloadManager.js:516` stream +
`crypto.createHash('sha256')` (crypto already a dep). Reuse the pattern:
`computeFileSha256(path) → hex`.

**Atomic writers:** `updateProjectJson(jsonPath, updater)` L57 and
`updateItemMeta(metaPath, updater)` L157 — per-file queued atomic writes; use for
migration sidecar rewrites (CLAUDE.md mandates `updateProjectJson` for project.json).

**Projects page:** `js/shell/projectUI.js` — context menu at L433-459
(`MpiContextMenu.show`, items array L438-443). `MpiOkCancel` + `MpiContextMenu`
already imported. Add `{ key: 'cleanup', icon: 'sparkle', label: 'Cleanup assets…' }`
+ `_showCleanupConfirm(project)` (model: `_showDeleteConfirm` L244).

**Reuse dialog:** `js/components/Compounds/MpiReusePromptDialog/MpiReusePromptDialog.js`
— PARTS array L9-14, `imageAvailability` gate L67-106. Add video/audio =
extend PARTS + `_normalizeIncludes` L16-23 + parallel `videoAvailability`/
`audioAvailability` gates. CSS grid auto-flows 6 checkboxes (no CSS change).
Mount sites: `MpiGalleryBlock.js:1052` (dual-source), `MpiGroupHistoryBlock.js:900`
(single-source). Apply path: `_applyPromptReuse` L1129 / L972.

**Reuse read:** `js/utils/promptReuse.js` — `_materializedPreviewAssetMediaItems`
L88 hard-codes the per-item path → DELETE (sidecar `filePath` is authoritative,
`_mediaItemsFromPreviewAssets` L57 already reads it). MPI-225 gate L151-161 must
extend to video/audio. Add `_opAcceptsVideoInput`/`_opAcceptsAudioInput` +
`payloadHasReusableVideos`/`payloadHasReusableAudio`.

**Ops with video input:** extend, interpolate, videoUpscale, resizeVideo. **Audio
input:** t2v_ms, i2v_ms (LTX only, capability-gated → `payloadHasReusableAudio`
naturally false for non-LTX). (`js/data/commandRegistry.js`.)

### SCOPE BOUNDARY — latents

`.latents/<itemId>.latent` (+ `.audio.latent`) are STAGE-2 support assets for a
preview card's fast-path Finish, NOT reuse-injectable media, and are
non-deterministic (no dedup benefit). **Latents stay in `.latents/`, NOT
content-addressed.** Their delete-on-card-delete (L861-866) is arguably correct
(deleting a preview frees its latent). This card does NOT move latents into the
SHA store. If the team later wants latent permanence, that is a separate card.
Phase 1 will CONFIRM this boundary is safe (does any reuse path read a latent as
an injectable? investigation says no) before finalizing — but default is: latents
untouched.

## Completed

- [ ] Nothing yet.

## Remaining Work

Phases are sequential where later work depends on the store existing; the reuse
UI expansion (Phase 5) is independent of the store and could run in parallel, but
is kept sequential so it can rely on the video/audio gate helpers Phase 4 adds.

## Phase 1: Server content-addressed store helpers + write-site conversion

- [ ] Add `computeFileSha256(path)` + a `placeContentAsset(bytesOrPath, ext, mediaDir)`
      helper in `routes/projects.js`: hashes content, targets
      `Media/.preview-assets/<sha256><ext>`, writes only if absent (dedup), returns
      the flat abs path + `/project-file?path=<abs>` URL. Reuse the
      `downloadManager.js:516` crypto-stream idiom.
      **Verify:** unit-style Node check (`tests/*.cjs`) — place same bytes twice →
      one file on disk, identical returned path; different bytes → two files.
- [ ] Convert snapshot write sites (`materializePreviewAssets` L366-397,
      `materializeGenerationFrameSnapshots` L449-461) to use `placeContentAsset`.
      Stamp `previewAssets.snapshots[].{filename,relativePath,filePath}` +
      `generationSettings.mediaItems[]/frozenParams.mediaItems[].url/filePath` with
      the SHA path. Remove per-item `ensureDir(snapshotDir)`.
      **Verify:** run a real i2v gen (or a save-generation harness on :3999 per
      `tool_test_new_route_without_restart`), assert the sidecar's snapshot filePath
      is a `<sha256>.<ext>` under flat `.preview-assets/` and the file exists.
- [ ] Convert `/extend-video` (`videoConcat.js:313-327`) to the same helper.
      **Verify:** grep confirms no remaining `.preview-assets/<...>/` per-item path
      writes; extend-video sidecar carries flat SHA refs.
- [ ] Close the `replaceItemId` Finish gap: on preview→final replace, run frame
      snapshots through `placeContentAsset` so the final card carries stable SHA
      refs (free when bytes identical — dedup no-ops).
      **Verify:** Finish a preview→final, confirm final sidecar
      `generationSettings.mediaItems` points at a flat SHA file that exists.

## Phase 2: Neutralize auto-delete of the asset store

- [ ] Remove the `.preview-assets/<itemId>/` folder delete at
      `routes/projects.js:868-872` (card-delete). Card delete keeps removing
      media file + sidecar + thumb ONLY.
      **Verify:** delete a card whose frame is content-addressed; assert the SHA
      file under `.preview-assets/` still exists on disk after delete.
- [ ] Confirm latent scope boundary (Phase 1 note): leave L861-866 as-is unless
      Phase 1 proved a reuse path reads a latent (it does not). Document the
      decision inline.
      **Verify:** re-read; no reuse read path depends on `.latents/` files.

## Phase 3: Migration on project load

- [ ] Add a one-time migration (run during project load / reconcile — align with
      `projectReconciler.js` hydrate): scan `Media/.preview-assets/<itemId>/`
      folders, hash each asset, move/dedup into the flat store, rewrite every
      sidecar's `previewAssets.snapshots[].filePath`,
      `generationSettings.mediaItems[]`, and `frozenParams.mediaItems[]` via
      `updateItemMeta`; remove the now-empty per-item folders. Idempotent (skip if
      already flat). Guard against partial runs.
      **Verify:** point at a COPY of the real Chroma project (has per-item folders);
      run migration; assert all sidecar refs resolve to existing flat SHA files,
      duplicate identical frames collapsed to one file, Reuse still resolves the
      frame, and re-running the migration is a no-op.

## Phase 4: Reuse read — content-addressed paths + video/audio gates

- [ ] `js/utils/promptReuse.js`: delete `_materializedPreviewAssetMediaItems`
      (L88) and its use in `_previewAssetMediaItems` (rely on sidecar
      `previewAssets.snapshots[].filePath`, which migration made flat). Preserve
      the MPI-225 image gate.
      **Verify:** reuse an i2v item post-migration → start-frame chip loads from the
      flat SHA path; a t2i item still greys "Use Images" (MPI-225 intact).
- [ ] Add `_opAcceptsVideoInput`/`_opAcceptsAudioInput` (parallel to
      `_opAcceptsImageInput` L52) and exported `payloadHasReusableVideos`/
      `payloadHasReusableAudio` (parallel to `payloadHasReusableImages` L207).
      Extend the MPI-225 gate in `buildPromptReusePayload` L151-161 to also
      op-gate saved VIDEO and AUDIO media (update the "never op-gated" comment).
      **Verify:** guard test — extend/interpolate item → hasReusableVideo true;
      LTX i2v-with-audio → hasReusableAudio true; t2i → all three false.

## Phase 5: Reuse dialog — Use Video + Use Audio toggles

- [ ] `MpiReusePromptDialog.js`: add `{key:'video',label:'Use Video'}` +
      `{key:'audio',label:'Use Audio'}` to PARTS (L9-14); extend
      `_normalizeIncludes` (L16-23); capture video/audio checkbox instances; add
      `_syncVideoAvailability`/`_syncAudioAvailability` (parallel to
      `_syncImagesAvailability` L67-106) reading `videoAvailability`/
      `audioAvailability` props; call them on mount + source `select`.
      **Verify:** dialog renders 6 checkboxes in the 2-col grid; toggles disable
      when the source lacks that media type.
- [ ] `js/components/types.js`: document `videoAvailability`/`audioAvailability`
      props on `MpiReusePromptDialogProps` (and backfill the missing
      `imageAvailability` typedef while there).
      **Verify:** types.js has both new props.
- [ ] Both mount sites (`MpiGalleryBlock.js:1052`, `MpiGroupHistoryBlock.js:900`):
      pass `videoAvailability`/`audioAvailability` (from the new payload
      predicates); in `_applyPromptReuse` (L1129 / L972) add
      `if (use.video && payloadHasReusableVideos(payload))` and
      `if (use.audio && payloadHasReusableAudio(payload))` branches — filter the
      already-resolved `resolvePromptReuseMediaItems` output by mediaType per flag
      (do NOT re-fetch), inject via `injectMedia({url,mediaType,role})`.
      **Verify (user-ux):** in the app, reuse from an extend/interpolate item → Use
      Video available + injects the video chip; reuse from an LTX audio i2v → Use
      Audio available + injects the audio chip; reuse from a plain image op → both
      greyed.

## Phase 6: Cleanup command + soft-fail downgrade

- [ ] New route `POST /project/cleanup-assets` in `routes/projects.js`: given a
      project folderPath, delete the entire flat `Media/.preview-assets/` (and,
      decide per Phase-2 boundary, latents) contents. Keep media/sidecars.
      **Verify:** call route on a test project → `.preview-assets/` emptied, history
      media + sidecars intact.
- [ ] `js/shell/projectUI.js`: add the "Cleanup assets…" context-menu item
      (L438-443) + `_showCleanupConfirm(project)` using MpiOkCancel (model:
      `_showDeleteConfirm` L244) → on OK call the route.
      **Verify (user-ux):** right-click a project → Cleanup → confirm dialog → OK →
      assets removed; Cancel → nothing.
- [ ] Post-cleanup reuse degradation: when a reuse resolves to a now-missing
      asset, show a `ui:warning` TOAST "Cannot reuse — prompt assets no longer
      exist" (not the error dialog). DOWNGRADE the existing MPI-225 soft-fail
      (`js/services/comfyController.js` deleted-frame catch) from `ui:error` to
      `ui:warning`.
      **Verify (user-ux):** Cleanup a project, then reuse an affected item →
      warning toast, no error dialog, no crash.

## Parallel Batch

None. The phases share `routes/projects.js` heavily (write sites, delete sites,
cleanup route all in one file) and the reuse chain is a dependency line
(store → migration → read → UI). Splitting would create overlapping ownership of
`routes/projects.js` and `promptReuse.js`, so sequential phases are safer. Within
a phase, tasks are small and ordered.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Phases 1-4 and 6-route are `auto` (Node harness/guard tests + disk assertions).
Phases 5 and 6-UI are **user-ux** — the reuse Video/Audio toggles and the Cleanup
flow must be seen in the running Electron app. `mpi-continue` should stop for the
user on Phase 5 and Phase 6.

End-to-end acceptance:
1. Generate 3 i2v from the SAME start-frame → ONE SHA file on disk (dedup proven).
2. Delete any of those cards → the SHA frame file survives; reuse from a surviving
   card still injects the frame (no 404, structurally).
3. Reuse from extend/interpolate → Use Video works; LTX audio i2v → Use Audio
   works; plain image op → both greyed; t2i → Use Images greyed (MPI-225 intact).
4. Migrate the real Chroma project (on a copy) → all refs resolve, duplicates
   collapsed, reuse works, re-run is a no-op.
5. Projects page → Cleanup → confirm → assets wiped, history intact; subsequent
   reuse of an affected item → warning toast, never an error dialog.

## Preservation Notes

- Durable knowledge home: `docs/project-integrity.md` § preview-assets (§121-125)
  — UPDATE to describe the content-addressed flat store, the permanence guarantee
  (only manual Cleanup deletes), and the migration. `docs/ui-gotchas.md` already
  owns the reuse/MpiToast lessons — add the "reuse assets are permanent + Cleanup
  is the only GC" note. `docs/data.md` §reuse (L72) references the per-item
  `.preview-assets/<itemId>/` path — update to the flat SHA scheme.
- Both engines: `placeContentAsset` runs server-side on the LOCAL Express (assets
  always land locally, per agent-1) so it covers local AND remote gens uniformly —
  but note it in the close-out (`feedback_check_both_engine_paths`).
- MPI-225 fixes (`_opScopedMediaItems`, promptReuse read-heal) are PRESERVED and
  extended here — do not revert them.
- MPI-226 (loop-won't-stop + silent save-loss) stays SEPARATE — the save-race
  could still strand things; note the relationship but do not fold in.
- Update `js/components/types.js` (`MpiReusePromptDialogProps`) — the
  `imageAvailability` typedef is currently missing (added in MPI-212, never
  documented); backfill it alongside the new video/audio props.
