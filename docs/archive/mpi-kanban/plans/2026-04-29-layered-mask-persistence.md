# Layered Mask Persistence + Detail Op Crash Fix

## Context

**Bug:** Detail op crash in History workspace.
`MaskManager.js:119 Uncaught TypeError: Cannot read properties of null (reading 'width')`
Repro: paint mask → swap to PromptBox → run Detail. `swapToPreview` destroys live `MpiCanvas`. `MpiGroupHistoryBlock` later calls `viewer.el.getCurrentMaskDataURL()` which reads from destroyed `maskCanvas`. Mask never reaches ComfyUI; workflow does not run.

**UX gaps:**
- Mask gone on tool re-entry (mask → prompt → mask wipes paint)
- Auto-mask deselect clobbers manual paint
- Eraser cannot subtract auto-detected regions cleanly

## Approach

Replace single `maskCanvas` with **3-layer model**:

| Layer | Source | Storage |
|-------|--------|---------|
| `manualLayer` | brush strokes | TEMP file PNG, per (project, group, item) |
| `subtractLayer` | eraser strokes | TEMP file PNG, per (project, group, item) |
| `autoPickMasks` | server response, `Map<pickIndex, Canvas>` | RAM |

**Composite formula:**
```
display = (manualLayer ∪ ⋃ autoPickMasks[i] for i in selectedPicks) AND NOT subtractLayer
```

**Brush semantics:**
- Brush at P → `manualLayer[P]=white`, `subtractLayer[P]=black`
- Eraser at P → `manualLayer[P]=black`, `subtractLayer[P]=white`

**ComfyUI protocol change:** `runAutoMask` returns ordered list of masks via `onMasks(maskUrls[])` instead of single combined `onMask(maskUrl)`. Length = `picks.size`. Empty detection list → toast.

**TEMP folder:** `<os.tmpdir>/cubric-<sessionId>/<projectId>/<groupId>/<itemId>/manual.png|subtract.png`. Generated per app boot. Cleaned on quit. Stale dirs pruned on next boot.

## Critical Files

- `js/components/Primitives/MpiCanvas/managers/MaskManager.js` — current single-canvas mask manager
- `js/components/Primitives/MpiCanvas/MpiCanvas.js` — surfaces MaskManager API
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` — owns swap, mode state, auto-mask exec
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — calls `getCurrentMaskDataURL` on PromptBox `run`
- `js/services/commandExecutor.js` (or wherever `runAutoMask` lives) — server protocol
- `main.js` — Electron lifecycle, IPC main
- New: `js/services/maskTempStore.js` — frontend API
- New: backend IPC route for TEMP fs ops
- ComfyUI workflow JSON for auto-detect — separate edit (handled by user)

## Out Of Scope

- Hide mask in crop / upscale / interpolate tool modes (separate todo, mask currently leaks visually).
- App-restart persistence (rejected — TEMP only).
- Project meta integration (rejected — masks are session-scoped).

## To-Dos

### [x] 1. Layered MaskManager + MpiCanvas API surface

Refactor `MaskManager.js` from single `maskCanvas` to three off-screen canvases (`manualCanvas`, `subtractCanvas`, plus a derived `displayCanvas` for live overlay rendering). Composite formula: `display = (manual ∪ ⋃autoPickMasks) AND NOT subtract`. Auto-pick masks held in `Map<pickIndex, Canvas>`, set via `setAutoPickMasks(map)` / `setSelectedAutoPicks(set)`.

API additions:
- `setSelectedAutoPicks(Set<number>)` — triggers composite redraw
- `setAutoPickMasks(Map<number, ImageBitmap|Canvas>)` — replaces map, triggers redraw
- `clearAutoPicks()` — empties map
- `getManualURL()` / `getSubtractURL()` — for TEMP file writes (B/W PNG)
- `setManualFromDataURL(dataUrl)` / `setSubtractFromDataURL(dataUrl)` — restore from TEMP files
- `getURL(bg, fg)` — flatten composite to B/W PNG (existing signature, behavior changes)
- `clear()` — wipe all three layers + auto picks

Brush stroke handler writes to manual + clears subtract at touched pixels. Eraser writes to subtract + clears manual at touched pixels. `destroy()` zeros all three canvases, nulls refs.

`MpiCanvas.js` exposes new methods through delegation list (lines 578-581). Keep `getMaskDataURL` returning composite for ComfyUI export parity.

**Verify:** Open browser dev tools console. Paint a mask in History mask mode. Run in console: `document.querySelector('canvas').__mpiViewer__?.canvas?.mask?.getManualURL()` (or attach a temp `window.__maskDebug` hook in MaskManager). Confirm returns a non-empty B/W PNG dataURL. Also confirm `getURL('black','white')` returns same composite shape. Erase a portion. Confirm `getSubtractURL()` returns dataURL with white pixels at erased locations and `getURL('black','white')` shows the erased region as black.

---

### [x] 2. Backend IPC route + main.js session lifecycle

Add Electron main-process session ID + TEMP folder management.

In `main.js`:
- On boot: generate `sessionId = randomUUID()`. Store in main-process scope.
- On boot: read `app.getPath('temp')`, list entries matching `cubric-*`. Delete any not equal to `cubric-<sessionId>` (stale crash dirs).
- Register IPC handlers:
  - `mask-temp:get-session-id` → returns `sessionId`
  - `mask-temp:read` (projectId, groupId, itemId) → `{ manual?: string, subtract?: string }` (file paths or base64 dataURLs — pick base64 dataURL for symmetry with write)
  - `mask-temp:write-manual` (projectId, groupId, itemId, dataURL) → atomic write `.tmp` then rename
  - `mask-temp:write-subtract` (projectId, groupId, itemId, dataURL) → same
  - `mask-temp:delete` (projectId, groupId, itemId) → remove dir
  - `mask-temp:cleanup-session` → recursive delete current session dir (called manually for testing)
- On `before-quit`: recursive delete `cubric-<sessionId>` dir.

Path resolution: `path.join(app.getPath('temp'), 'cubric-' + sessionId, projectId, groupId, itemId, 'manual.png' | 'subtract.png')`. Sanitize ids — reject path traversal (no `..`, no path separators). Reject if any id missing.

Logging via existing `routes/logger.js`.

**Verify:** Start app. Check `logs/app.log` for boot line "[MaskTempStore] session=<uuid> tempDir=<path>". From DevTools console: `await window.electronAPI.invoke('mask-temp:write-manual', 'p1', 'g1', 'i1', 'data:image/png;base64,iVBORw0KG...')` → `{ ok: true }`. Then `await window.electronAPI.invoke('mask-temp:read', 'p1', 'g1', 'i1')` → returns `{ manual: 'data:image/png;...' }`. Inspect TEMP folder on disk: `<os tmp>/cubric-<sessionId>/p1/g1/i1/manual.png` exists. Quit app. Confirm `cubric-<sessionId>` folder removed.

---

### [x] 3. Frontend maskTempStore service

Create `js/services/maskTempStore.js`:
```
export const maskTempStore = {
  async read(projectId, groupId, itemId)               → { manual?, subtract? }
  async writeManual(projectId, groupId, itemId, url)
  async writeSubtract(projectId, groupId, itemId, url)
  async delete(projectId, groupId, itemId)
};
```

Wraps IPC calls from to-do 2. Returns `null` for missing files. Logs errors via `js/services/clientLogger.js`. No caching — small writes infrequent.

Browser fallback (no Electron): no-op writes, no-op reads return `null`. Project ships browser-dev only, mask persistence not needed there. Log a warn once on first call.

**Verify:** From DevTools console run:
```js
import('/js/services/maskTempStore.js').then(async ({ maskTempStore }) => {
  await maskTempStore.writeManual('p1','g1','i1','data:image/png;base64,iVBORw0KG...');
  console.log('READ:', await maskTempStore.read('p1','g1','i1'));
  await maskTempStore.delete('p1','g1','i1');
  console.log('DELETED, READ:', await maskTempStore.read('p1','g1','i1'));
});
```
Confirm first READ returns `{ manual: 'data:image/png;...' }`, second READ returns `null` for both fields.

---

### [x] 4. Viewer wiring: swap, mode entry, getCurrentMaskDataURL, loadEntry

Rewire `MpiCanvasViewer.js` to use layered model + TEMP store. Fixes the Detail crash as a side effect.

- Remove in-memory `_maskStore` Map. Replace with `_previewMaskCache` (single string) for active preview swap.
- `swapToPreview` (line 559): capture composite dataURL via `_cv.el.getMaskDataURL('black','white')`. Persist manual+subtract layers to TEMP via `maskTempStore.writeManual/writeSubtract` for `_currentItem.id`. Set `_previewMaskCache`. Then destroy live canvas, mount preview overlay with composite. No reads from destroyed canvas afterwards.
- `swapToCanvas` (line 580): clear `_previewMaskCache`. Remount fresh `MpiCanvas`. Restore manual+subtract from TEMP for current item via `setManualFromDataURL` / `setSubtractFromDataURL`. Auto picks already empty (RAM-only, lost on swap).
- `loadEntry` (line 347): on entry switch, persist current item's manual+subtract to TEMP (if `_hasMask`), then load new item's manual+subtract from TEMP. Compute `_hasMask` from composite pixel-scan post-restore.
- `enterMode('mask')` and `enterMode('automask')`: ensure layers restored — `swapToCanvas` already covers if coming from preview, but tool re-entry without swap must call `_restoreLayersFromTemp(itemId)`. Promote to helper.
- `getCurrentMaskDataURL` (line 420): if `_previewInst` truthy → return `_previewMaskCache ?? null`. Else if `canvas?.maskCanvas` (or new equivalent) alive → return composite via `canvas.getMaskDataURL('black','white')`. Else null.
- `hasMask` (line 428): preview mode → `!!_previewMaskCache`. Live mode → composite pixel-scan (existing `hasMaskContent` adapted for new composite canvas).
- Block-level guard `MpiGroupHistoryBlock.js` line 432-434: keep null-safe `?.` calls. Should not crash anymore but defense-in-depth.

**Verify:**
- Paint mask in History mask mode. Switch to Detail (PromptBox). Click Run. Open dev tools console: no `Cannot read properties of null` error. Watch network/IPC for ComfyUI request — confirm it includes a non-empty mask PNG.
- After run, switch back to mask mode. Confirm painted mask still visible on canvas.
- Switch history entry, switch back. Confirm mask still visible.
- Add a `console.log('[Viewer] swapToPreview cache size:', _previewMaskCache?.length || 0);` temporarily inside swapToPreview. Trigger swap. Confirm cache size > 0.

---

### [x] 5. Auto-mask per-pick masks + executor protocol change

Update `runAutoMask` (in `js/services/commandExecutor.js` or equivalent) to call `onMasks(maskUrls[])` after server response. List length matches `picks.size`, ordered by pick index insertion.

In `MpiCanvasViewer.js` `_runAutoMaskWorkflow` (line 189):
- Replace `_autoMaskExec.onMask` with `_autoMaskExec.onMasks = async (maskUrls) => { ... }`.
- Validate: if `_autoMaskPicks.size === 0` → ignore call (skip server call upstream too, see below).
- Validate: if `maskUrls.length !== _autoMaskPicks.size` → log warn, clear auto picks map.
- Else: convert each maskUrl via `_maskUrlToTransparentDataUrl` → ImageBitmap. Build `Map<pickIndex, ImageBitmap>` zipped with sorted picks. Call `canvas.setAutoPickMasks(map)` + `canvas.setSelectedAutoPicks(_autoMaskPicks)`.

`autoMaskThumbs` `change` handler (line 150):
- `picks.size === 0` → DO NOT call `clearMask()`. Just `canvas.clearAutoPicks()` + `canvas.setSelectedAutoPicks(new Set())`. Manual + subtract layers preserved.
- `picks.size > 0` → call `_runAutoMaskWorkflow(false)` for fresh server compute (current behavior, just protocol changes).

`_exitAutoMaskMode(apply)` (line 222):
- `apply=false` → `canvas.clearAutoPicks()`. Do NOT clear manual+subtract.
- `apply=true` → keep auto picks until tool exit; `_hasMask` recomputed from composite.

`MpiCanvas.compositeMaskDataURL` (line 539): now redundant for auto-mask path (auto picks bypass it). Keep API for any other callers but auto-mask no longer uses it.

ComfyUI workflow JSON edit (handled by user): ensure mask output node emits ordered list with length = selected picks.

**Verify:**
- Paint manual mask. Enter auto-mask mode. Add `console.log('[AutoMask] onMasks length:', maskUrls.length, 'picks:', _autoMaskPicks.size);` in the new `onMasks` handler. Pick first thumb. Console logs `length: 1, picks: 1`. Display shows manual paint UNION first detection.
- Pick second thumb. Console logs `length: 2`. Display shows manual + both detections.
- Deselect first thumb. Console logs `length: 1`. Display shows manual + second detection only. **Confirm manual paint still present.**
- Deselect last thumb. Display shows manual paint alone. **Confirm manual NOT cleared.**
- Erase across an auto-detected region. Re-select that pick. Erased portion stays hidden (subtract layer wins).

---

### [x] 6. Empty-detection toast

In `_runAutoMaskWorkflow` (line 189), the `onDetected = (urls) => {...}` handler at line 199:
- If `urls.length === 0` → emit toast "Nothing detected" via existing toast/notification infra. Do NOT proceed to mask compute.
- Search `Events.emit('toast'`, `clientLogger`, or existing notification pattern. Use whichever the rest of the app uses for user-facing transient messages.

**Verify:** Use a blank/empty image (or one the YOLO model definitely fails on). Enter auto-mask mode. Run detection. Confirm a toast/notification appears with text "Nothing detected". Confirm thumb strip stays empty. Confirm no console warnings about mismatched mask list lengths (mask compute skipped).

---

### [x] 7. clearMask + history-entry switch + tool teardown purge

- `clearMask` (line 462): wipe `manualLayer` + `subtractLayer` + clear auto picks. Call `maskTempStore.delete(projectId, groupId, _currentItem.id)`. Set `_hasMask = false`. Emit `mask-clear`.
- `loadEntry` (line 347-353): persist current item's layers to TEMP if `_hasMask`. Then load new item's layers from TEMP.
- Viewer `el.destroy` (line 626): existing flow OK — no TEMP cleanup needed (handled by `before-quit` in main).
- Block `generation:complete` (line 308): `_canvasHasMask = false` is block-level UI gate, NOT a wipe. Confirm mask survives generation. Already true today; keep.

**Verify:**
- Paint mask. Click Clear (whatever UI exposes `clearMask`). Confirm mask gone visually. From console check `await window.electronAPI.invoke('mask-temp:read', projectId, groupId, itemId)` → `null` for both fields.
- Paint mask on entry A. Switch to entry B (no mask). Switch back to A. Mask present. From console check entry A's TEMP file exists.
- Run Detail. Confirm mask SURVIVES generation completion.
- Quit app. Confirm `<os.tmpdir>/cubric-<sessionId>` removed. Reopen app. Confirm prior masks gone (expected — session-scoped).

---

## Verification End-To-End

After all to-dos:

1. Detail crash fix: paint → swap to PromptBox → run Detail → no error → mask injected.
2. Mask survives: paint → switch tool → return → mask present.
3. Mask survives entry switch in same session.
4. Manual + auto blend works (no clobber).
5. Eraser subtracts both manual + auto.
6. Empty detection shows toast.
7. App close clears TEMP.
8. Stale TEMP from crashed prior session pruned on boot.
