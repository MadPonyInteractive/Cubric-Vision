# MPI-227 Surface Map (4-agent investigation, 2026-07-08)

Condensed from 4 parallel read-only investigation agents. Full detail lives in
plan.md § "Key facts from investigation"; this is the raw reference.

## Write / materialize sites (agent 1)

11 write sites. All `routes/projects.js` unless noted:
- W1/W2 `_materializeLatent` L321-354 → `.latents/<itemId>.latent` + `.audio.latent`
  (local: fs.move from ComfyUI output; remote: streamDownload from Pod → local).
- W3/W4 `materializePreviewAssets` L366-382 → `.preview-assets/<itemId>/startFrame|endFrame.<ext>`
  via `copySnapshotSource` (fs.copy for /project-file, writeFile for data:, streamDownload for http).
- W5 frozenParams.mediaItems rewrite L386-397 (in-memory → sidecar).
- W6 `materializeGenerationFrameSnapshots` L449-461 → same snapshot dir, rewrites
  generationSettings.mediaItems.
- W7/W9/W10 save-generation media L1501 / thumb L1627 / sidecar L1644 (NOT preview-assets).
- W11 `/extend-video` `videoConcat.js:313-327`.

Snapshot object shape (sidecar `previewAssets.snapshots[]`):
`{ role, mediaType, originalUrl, filename, relativePath, filePath, status }`.
`filePath` = `/project-file?path=<abs>` (no &v=). Authoritative read path.

replaceItemId Finish (L1531 `if (!replaceItemId)`) SKIPS all materialization →
final card keeps preview-era mediaItems refs → dangling once preview deleted.

NO _uploadImage at materialize time — uploads happen at DISPATCH
(comfyController.js:1017-1044). Assets always land LOCALLY (both engines).

## Delete / GC sites (agent 2)

15 sites. NEUTRALIZE only 2:
- `routes/projects.js:868-872` — unconditional `.preview-assets/<itemId>/` folder
  delete on card-delete. THE BUG. Remove.
- L861-866 — latent delete on card-delete (SCOPE: leave — latents not reuse assets).

KEEP: media/sidecar/thumb delete on card-delete (L846-879); save-gen orphan GC
(L1664-1726, touches only .meta); reconciler /delete-meta (L2030-2038, only
sidecar+thumb); delete-project L714 (whole folder, explicit).

Projects page = `js/shell/projectUI.js`. Context menu L433-459 (`MpiContextMenu.show`,
items L438-443, onSelect L444). `MpiOkCancel`+`MpiContextMenu` imported. Add
`{key:'cleanup',icon:'sparkle',label:'Cleanup assets…'}` + `_showCleanupConfirm`
(model `_showDeleteConfirm` L244). MpiContextMenu item schema:
`{key,icon?,label,info?,disabled?,danger?,separator?,kbd?}`.

MpiOkCancel: fresh-mount per call. `MpiOkCancel.mount(el,{title,text,okLabel,
cancelLabel,checkbox?,icon?,iconTone?})`; `dialog.on('ok',({checkboxChecked})=>…)`;
`dialog.el.show()`.

## Reuse read (agent 3)

`js/utils/promptReuse.js`:
- `_opAcceptsImageInput` L52-55 (op image-slot gate; extend fallback reads
  generationSettings.operation).
- `_mediaItemsFromPreviewAssets` L57-71 (reads sidecar snapshots[].filePath).
- `_materializedPreviewAssetMediaItems` L88-111 — HARD-CODES
  `.preview-assets/<item.id>/startFrame.png` + /file-exists probe → DELETE for
  content-addressing (sidecar filePath is authoritative).
- `_previewAssetMediaItems` L113-118 (materialized > sidecar snapshot).
- buildPromptReusePayload L135-177; MPI-225 image gate L151-161 (must extend to video/audio).
- resolvePromptReuseMediaItems L188-196 (apply-time disk resolve).
- payloadHasReusableImages L207-210.

Chip injection: `injectMedia({url,mediaType,role})` MpiPromptBox L621 →
`_acceptsMediaType` → `_tryAddMedia` L293 (role-aware dedup) → role drives Comfy
node slot (Input_Start_Frame / Input_End_Frame / Input_Audio_File).

Ops w/ VIDEO input: extend, interpolate, videoUpscale, resizeVideo.
Ops w/ AUDIO input: t2v_ms, i2v_ms (LTX only, filterMediaInputsForModel gated).
→ payloadHasReusableAudio naturally false for non-LTX.
Video reuse needs NO disk-probe (video IS item.filePath).

## UI dialog + hashing (agent 4)

Dialog: `js/components/Compounds/MpiReusePromptDialog/MpiReusePromptDialog.js`.
PARTS L9-14 (checkbox roster) → add video/audio entries, loop auto-builds.
`_normalizeIncludes` L16-23. imageAvailability gate L67-106
(`_syncImagesAvailability` disables+unchecks when source lacks images). Apply:
`emit('apply',{includes,source})` L145-151 — caller does the work.
BEM `.mpi-reuse-prompt-dialog__checks` = 2-col grid, auto-flows 6.
Mounts: MpiGalleryBlock L1052 (dual-source), MpiGroupHistoryBlock L900 (single).
Apply: `_applyPromptReuse` — `if(use.images && payloadHasReusableImages)` →
clearMedia + resolvePromptReuseMediaItems + injectMedia loop (L1129 / L972).
resolvePromptReuseMediaItems ALREADY returns non-image media → filter by type.

SHA-256 idiom: `downloadManager.js:516` crypto.createHash('sha256') stream.
crypto already a dep. Pattern:
`function computeFileSha256(p){return new Promise((res,rej)=>{const h=crypto.createHash('sha256');const s=fs.createReadStream(p);s.on('data',c=>h.update(c));s.on('end',()=>res(h.digest('hex')));s.on('error',rej);});}`

Atomic writers: `updateProjectJson(jsonPath,updater)` L57 (per-path queue +
writeJsonAtomic); `updateItemMeta(metaPath,updater)` L157 (sidecar, ensureDir).
`/file-exists` L1979 (path→{exists}); `/project-file` L1323 (reads path only, v= inert).
`projectFileUrl(fp)` L181.
