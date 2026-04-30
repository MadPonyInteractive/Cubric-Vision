# Mask Persistence + Layered Mask Architecture

## Context

Two problems:

**Bug:** Detail op crash in History workspace.  
`MaskManager.js:119 Uncaught TypeError: Cannot read properties of null (reading 'width')`  
Trigger: paint mask → swap to PromptBox → run Detail. `swapToPreview` destroys live `MpiCanvas`, but `MpiGroupHistoryBlock` later calls `viewer.el.getCurrentMaskDataURL()` which reads from destroyed `maskCanvas`. Mask never reaches ComfyUI; workflow doesn't run.

**UX gap:** Mask gone on tool re-entry. Manual paint clobbered by auto-mask deselect. No way to combine manual paint with auto-detected regions, no way to subtract auto regions with eraser without losing them on re-detection.

## Solution Outline

Replace single `maskCanvas` with **3-layer model** + composite render. Persist manual+subtract layers to OS TEMP folder per-session (not project meta). Auto-pick masks live in RAM, keyed by pick index, returned by ComfyUI as ordered list.

## Layer Model

| Layer | Source | Storage |
|-------|--------|---------|
| `manualLayer` | brush strokes | TEMP file PNG |
| `subtractLayer` | eraser strokes | TEMP file PNG |
| `autoPickMasks` | server response, `Map<pickIndex, Canvas>` | RAM |

**Composite formula:**
```
display = (manualLayer ∪ ⋃ autoPickMasks[i] for i in selectedPicks) AND NOT subtractLayer
```

**Brush semantics:**
- Brush at P → `manualLayer[P]=white`, `subtractLayer[P]=black`
- Eraser at P → `manualLayer[P]=black`, `subtractLayer[P]=white`

Brush always reveals, eraser always hides. Both clear opposite layer at touched pixels. Eraser works on auto regions because subtract layer overrides composite.

## ComfyUI Protocol Change

**Today:** `runAutoMask` returns single combined mask via `onMask(maskUrl)`.

**New:** Returns ordered list via `onMasks(maskUrls[])`. Length = `picks.size`. Index aligned to pick order. Detection-run empty → toast "Nothing detected", thumbs empty, no mask compute.

**App-side rules:**
- `picks.size === 0` → skip server call entirely, clear auto layer
- `masks.length !== picks.size` → ignore, log warn, clear auto layer
- Match → build `Map<pickIndex, Canvas>` by zipping picks set (sorted by insertion order) with masks list
- Detection list empty → toast, no further action

Workflow edit handled by user separately.

## TEMP File Layout

```
<os.tmpdir>/cubric-<sessionId>/<projectId>/<groupId>/<itemId>/
    manual.png
    subtract.png
```

- `sessionId` = uuid generated on app boot, stored in main process.
- Cleanup: app exit hook in `main.js` → recursive delete `cubric-<sessionId>`.
- Stale prune on boot: delete any `cubric-*` dirs not matching current session.
- Write trigger: `commitMask` / `_exitMode` exiting mask mode / `swapToPreview`. Not per-stroke.

## Files To Modify

### Core canvas

- **`js/components/Primitives/MpiCanvas/managers/MaskManager.js`**  
  Replace single `maskCanvas` with `manualCanvas` + `subtractCanvas` + composite renderer. Existing API (`paint`, `erase`, `getURL`, `setMaskDataURL`, `clear`) routes to layers. `getURL(bg, fg)` flattens composite to B/W PNG. Add `getManualURL()` / `getSubtractURL()` for TEMP file writes. Add `setLayers({manual, subtract})` for restore.

- **`js/components/Primitives/MpiCanvas/MpiCanvas.js`**  
  Surface methods: `setManualMaskDataURL`, `setSubtractMaskDataURL`, `getManualMaskDataURL`, `getSubtractMaskDataURL`. Existing `getMaskDataURL` returns composite. Update API list lines 578-581.

### Viewer

- **`js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js`**
  - Replace `_maskStore: Map<idx, dataUrl>` with `_maskFileStore` (TEMP-backed, async API, per-itemId).
  - `swapToPreview` (line 559): cache composite dataURL into `_previewMaskCache` before destroy. Persist manual+subtract to TEMP file. No mask reads from destroyed canvas.
  - `swapToCanvas` (line 580): restore manual+subtract from TEMP file, recompute composite.
  - `loadEntry` (line 347): persist current entry's layers, load new entry's layers.
  - `enterMode('mask')` and `enterMode('automask')`: trigger layer restore (currently free-fall — no restore wired).
  - `getCurrentMaskDataURL` (line 420): return `_previewMaskCache` when in preview mode, else flatten live composite.
  - `hasMask` (line 428): preview mode → `!!_previewMaskCache`. Live → pixel-scan composite.
  - `clearMask` (line 462): wipe both layers + delete TEMP files + clear auto picks.
  - `_runAutoMaskWorkflow` (line 189): replace `onMask` with `onMasks(urls[])`. Build `_autoPickMasks` map. Trigger composite redraw. Empty detection → toast.
  - Auto-mask `change` handler (line 150): no longer call `clearMask` on `picks.size === 0`. Keep manual layer. Just clear auto picks map and redraw composite.

### Block

- **`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`**  
  Lines 431-436: optional null-safe wrap. Falls out free since viewer's `getCurrentMaskDataURL` won't crash anymore.

### New files

- **`js/services/maskTempStore.js`** — frontend API:
  ```
  read(projectId, groupId, itemId)            → {manual?, subtract?} dataURLs
  writeManual(projectId, groupId, itemId, dataURL)
  writeSubtract(projectId, groupId, itemId, dataURL)
  delete(projectId, groupId, itemId)
  ```
  Calls IPC route. Debounces nothing (writes only on tool exit, infrequent).

- **Backend IPC route** — `routes/maskTempStore.js` or extend existing fs route:
  - `mask-temp:read`, `mask-temp:write`, `mask-temp:delete`, `mask-temp:cleanup-session`.
  - Atomic writes via `.tmp` rename.
  - Path resolution: `app.getPath('temp')` + `cubric-<sessionId>` + structured subdirs.

- **`main.js`** addition:
  - On boot: generate sessionId (uuid), expose to renderer via IPC `app:get-session-id`.
  - On boot: prune stale `cubric-*` dirs not matching current session.
  - On `before-quit`: recursive delete `cubric-<sessionId>`.

### Workflow / executor

- **`js/services/commandExecutor.js`** (or wherever `runAutoMask` lives):
  - Replace `onMask(maskUrl)` with `onMasks(maskUrls[])`.
  - Workflow-side: emit list of B/W mask images, length = selected picks.

## Toast Wiring

Detection run with empty list → use existing toast service. Search `clientLogger`/`Events.emit('toast'`)/notification API. Add briefly in `_runAutoMaskWorkflow` `onDetected` handler when `urls.length === 0`.

## Out Of Scope (Phase 2)

- Hide mask in crop / upscale / interpolate tool modes. Currently visible — confirmed today. Separate todo.
- App-restart persistence. Explicitly rejected.

## Verification

1. **Bug fix:** paint mask → switch to PromptBox → run Detail → no console error → ComfyUI receives composite mask → workflow runs.
2. **Mask persistence on tool re-entry:** paint mask → exit mask tool → re-enter mask tool → mask present.
3. **History entry switch:** paint mask on entry A → switch to entry B → switch back → mask present on A.
4. **App close:** paint mask → close app → reopen → mask gone (TEMP cleared on quit).
5. **Stale cleanup:** kill app from task manager → reopen → prior session TEMP dir cleaned.
6. **Manual + auto blend:** paint mask → enter automask → select pick → display = union → deselect pick → display = manual only (manual not wiped).
7. **Eraser on auto:** select pick → erase across detected region → display loses that region. Re-select pick → erased region stays hidden (subtract layer wins).
8. **No detections:** run auto-detect on blank image → toast "Nothing detected" → thumbs empty.
9. **Re-detection:** select picks A, B → re-run detection → fresh thumbs, prior auto pick masks dropped, manual+subtract preserved.
10. **ComfyUI export parity:** captured composite from live canvas matches mask injected into Detail workflow. Compare hashes if possible.

## Critical Files Reference

- `js/components/Primitives/MpiCanvas/managers/MaskManager.js` (lines 100-120 destroy/getURL)
- `js/components/Primitives/MpiCanvas/MpiCanvas.js` (lines 210-218 destroy, 531 getMaskDataURL, 578-581 API list)
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` (lines 137-244 auto-mask, 347-400 loadEntry, 420-433 mask getters, 462 clearMask, 556-620 swap logic)
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` (lines 431-436 run handler)
- `main.js` (session lifecycle hooks)
