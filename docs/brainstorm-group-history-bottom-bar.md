# Brainstorm: Group History Block — Bottom Bar Re-integration

## Context

The refactor at commit `ba1bca86` moved the old Workspace pattern into a Block component and extracted the PromptBox to a shell-level singleton (`PromptBoxService`). This broke all coordination between the PromptBox and the various action toolbars: the selection bar, canvas tool bars (crop/mask/auto-mask), and the compare overlay.

**Expected behavior:** All toolbars appear at the **bottom of the page**, replacing the PromptBox when active. Only one toolbar is visible at a time. When all toolbars are dismissed, the PromptBox comes back.

---

## What Is Broken (fully diagnosed)

### Bug 1 — Selection bar is in the wrong place
`MpiSelectionBar` is mounted inside `MpiHistoryList` (right panel). It must be in `#bottom-slot` of `MpiGroupHistoryBlock`, replacing the PromptBox.

### Bug 2 — Deselecting all cards doesn't restore the PromptBox
In `MpiHistoryList._toggleSelection()` lines 163–165, when `_selection.size` drops to 0, `_exitSelectMode()` is called and the function **returns early** — no `'selection-exited'` event is emitted. The block never calls `PromptBoxService.show()`.

### Bug 3 — Download button does nothing
`MpiSelectionBar` emits `'download'` but `MpiHistoryList` has no handler and emits nothing. The block has no download logic. The fix uses the same `<a download>` pattern as `MpiGalleryBlock.js:91–114`.

### Bug 4 — Compare overlay persists after cancel/deselect
`MpiCanvasViewer.loadCompare()` calls `canvas.loadComparisonImage()` but there is no public `el.clearCompare()` method. Setting `canvas.isComparisonMode = false` (via `ComparisonManager`) is the internal exit mechanism.

### Bug 5 — Canvas tool toolbars render in the wrong place; PromptBox not hidden
The crop/mask/automask bars are mounted inside `MpiCanvasViewer`'s `#crop-bar` (center column). They should be in `#bottom-slot` of the block. Currently `mode-changed` in the block only toggles a CSS class on the empty `#bottom-slot` and never calls `PromptBoxService.hide()/show()`.

### Bug 6 — Auto-mask toolbar never shows (mode string mismatch)
`MpiHistoryTools` registers the tool with `mode: 'autoMaskImg'` (from the command registry key). The block calls `canvasViewer.el.enterMode('autoMaskImg')`. But `MpiCanvasViewer._enterMode()` checks `if (mode === 'automask')` — a different string.

---

## Decisions (confirmed with user)

| Decision | Answer |
|---|---|
| Conflict: canvas tool active + cards selected | Activating a canvas tool **exits selection** first (one active state at a time) |
| Bottom bar during compare | **Selection bar stays** (user can press Cancel which exits both compare and selection) |
| Download action | **`<a download>` approach** (same pattern as `MpiGalleryBlock.js:91–114`) |
| Canvas compare exit API | Needs to be **added** to `MpiCanvasViewer` (`el.clearCompare()` → internally `canvas.isComparisonMode = false`) |

---

## Architectural Plan

### Core principle: "Bottom Bar Protocol" — one coordinator, one slot

`MpiGroupHistoryBlock` is the single coordinator for the bottom bar. A private `_bottomBar` state tracks what is shown: `'promptbox' | 'selection' | 'canvas-tool'`. Only one thing is visible at a time.

---

### Changes by file

#### `js/components/Compounds/MpiHistoryList/MpiHistoryList.js`
1. **Remove** `MpiSelectionBar` mounting and all its event wiring
2. **Remove** `#selbar-slot` div from template (and its CSS class)
3. **Fix** `_toggleSelection`: after `_exitSelectMode()` when size === 0, emit `'selection-exited'` before returning
4. **Keep** emitting: `'selection-changed'`, `'selection-exited'`, `'compare-requested'`, `'delete-requested'`

#### `js/components/Compounds/MpiCanvasViewer/MpiCanvasViewer.js`
1. **Accept** optional prop `barContainer: HTMLElement`. If provided, mount `cropBarSlot`, `maskBarSlot`, `autoMaskBarSlot` into it instead of the internal `#crop-bar`
2. **Add** `el.clearCompare()` public method: `canvas.isComparisonMode = false`
3. **Fix** auto-mask mode alias: map `'autoMaskImg'` → `'automask'` in `_enterMode()` (or at the `el.enterMode` entry point)
4. **Keep** `#crop-bar` in template as empty fallback for standalone use

#### `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
1. **Mount** `MpiSelectionBar` into `#bottom-slot`
2. **Pass** `el.querySelector('#bottom-slot')` as `barContainer` prop to `MpiCanvasViewer`
3. **Remove** the `bottomSlot.classList` toggling from `mode-changed` handler
4. **Implement** `_setBottomBar(state)` coordinator:
   - `'promptbox'` → `PromptBoxService.show()`, hide selection bar
   - `'selection'` → `PromptBoxService.hide()`, show selection bar
   - `'canvas-tool'` → `PromptBoxService.hide()` (canvas bar already visible in `#bottom-slot`)
5. **Wire** `historyList.on('selection-changed')`: exit canvas mode first → `_setBottomBar('selection')`
6. **Wire** `historyList.on('selection-exited')`: `canvasViewer.el.clearCompare()` → `_setBottomBar('promptbox')`
7. **Wire** `canvasViewer.on('mode-changed', { mode })`:
   - mode ≠ `'none'` → `_setBottomBar('canvas-tool')`
   - mode === `'none'` → `_setBottomBar('promptbox')`
8. **Wire** `selectionBar.on('compare')`: `canvasViewer.el.loadCompare(...)` (selection bar stays, per decision)
9. **Wire** `selectionBar.on('download')`: `<a download>` pattern from `MpiGalleryBlock.js:91–114`
10. **Wire** `selectionBar.on('cancel')`: `historyList.el.exitSelectMode()` + `canvasViewer.el.clearCompare()` + `_setBottomBar('promptbox')`
11. **Translate** auto-mask mode: `'autoMaskImg'` → `'automask'` in the `historyTools.on('activate')` handler

---

### Bottom bar interaction matrix

| Trigger | Result |
|---|---|
| Select 1+ cards | Exit canvas mode → selection bar shows, PromptBox hidden |
| Activate crop/mask/automask | Exit selection → canvas bar shows, PromptBox hidden |
| Cancel/exit canvas tool | PromptBox comes back |
| Deselect all cards | `'selection-exited'` emitted → clear compare → PromptBox comes back |
| Cancel button in selection bar | Clear compare + exit select mode → PromptBox comes back |
| Compare (2 selected) | Canvas loads compare overlay, **selection bar stays** |
| Cancel while comparing | Clear compare + exit selection → PromptBox comes back |

---

## Files to Modify (3 total)

- `js/components/Compounds/MpiHistoryList/MpiHistoryList.js`
- `js/components/Compounds/MpiCanvasViewer/MpiCanvasViewer.js`
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
