# Plan: Group History Block — Bottom Bar Re-integration
*Created: 2026-04-14*

**Goal:** Fix the 6 broken bottom-bar behaviours in the Group History workspace so that `MpiSelectionBar` and the canvas tool bars all appear in `#bottom-slot`, the PromptBox is shown/hidden correctly, and all interaction-state transitions work end-to-end.

**Source spec:** `docs/brainstorm-group-history-bottom-bar.md`

**Files touched (3 total):**
- `js/components/Compounds/MpiHistoryList/MpiHistoryList.js`
- `js/components/Compounds/MpiCanvasViewer/MpiCanvasViewer.js`
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`

---

## To-Dos

- [x] 1. **`MpiHistoryList.js` — Strip bar ownership + fix `selection-exited` bug**

  Remove `import { MpiSelectionBar }` and the `selectionBar` mount + all three `selectionBar.on(...)` wires (compare, delete, cancel). Remove `<div id="selbar-slot">` from the template. Remove `#selbar-slot` show/hide calls from `_enterSelectMode` / `_exitSelectMode`. Remove `selectionBar.el.setCount(...)` from `_toggleSelection`.

  Fix the early-return bug in `_toggleSelection`: after `_exitSelectMode()` when `_selection.size === 0`, emit `'selection-exited'` **before** returning:
  ```js
  } else if (_selection.size === 0 && _selectMode) {
      _exitSelectMode();
      emit('selection-exited', {});   // ← was missing
      return;
  }
  ```

  **Verify:** Open the Group History workspace. Check a card checkbox → `selection-changed` fires (confirm in console). Uncheck the last checked card → `selection-exited` fires. No JS errors.

---

- [x] 2. **`MpiCanvasViewer.js` — Add `el.clearCompare()` + fix `autoMaskImg` mode alias**

  Add `el.clearCompare()` public method:
  ```js
  el.clearCompare = () => {
      canvas.isComparisonMode = false;
      _comparingActive = false;
  };
  ```

  Fix the auto-mask mode alias in `el.enterMode` — map `'autoMaskImg'` → `'automask'` at the entry point so internal `_enterMode` always receives the canonical string:
  ```js
  el.enterMode = (mode) => {
      const canonical = mode === 'autoMaskImg' ? 'automask' : mode;
      if (canonical === 'none') { _exitMode(); return; }
      _enterMode(canonical);
  };
  ```

  **Verify:** With two images loaded in compare mode, call `canvasViewer.el.clearCompare()` from console — overlay clears. Call `canvasViewer.el.enterMode('autoMaskImg')` — auto-mask bar appears. No JS errors.

---

- [x] 3. **`MpiCanvasViewer.js` + `MpiGroupHistoryBlock.js` — Structural setup: mount bar in `#bottom-slot`, wire `barContainer`, implement `_setBottomBar()`**

  **In `MpiCanvasViewer.js`:** Accept optional `barContainer` prop. At top of `setup`: `const barContainer = props.barContainer ?? el.querySelector('#crop-bar')`. Replace all three `el.querySelector('#crop-bar').appendChild(...)` calls (for `cropBarSlot`, `maskBarSlot`, `autoMaskBarSlot`) with `barContainer.appendChild(...)`.

  **In `MpiGroupHistoryBlock.js`:** Add `import { MpiSelectionBar }` at the top. Before mounting `canvasViewer`, mount `selectionBar` into `#bottom-slot` (hidden by default) and pass `#bottom-slot` as `barContainer` to `canvasViewer`:
  ```js
  const bottomSlot = el.querySelector('#bottom-slot');

  const selectionBar = MpiSelectionBar.mount(bottomSlot, { count: 0 });
  selectionBar.el.hide();

  const canvasViewer = MpiCanvasViewer.mount(el.querySelector('#centre-slot'), {
      initialImageUrl: _resolveUrl(_group.history[_currentIdx]?.filePath),
      initialIdx: _currentIdx,
      barContainer: bottomSlot,
  });
  ```

  Implement `_setBottomBar(barState)` coordinator:
  ```js
  function _setBottomBar(barState) {
      if (barState === 'promptbox') {
          PromptBoxService.show();
          selectionBar.el.hide();
      } else if (barState === 'selection') {
          PromptBoxService.hide();
          selectionBar.el.show();
      } else if (barState === 'canvas-tool') {
          PromptBoxService.hide();
          selectionBar.el.hide();
      }
  }
  ```

  **Verify:** Open Group History. The PromptBox is visible. Activate the Crop tool → crop action bar appears inside `#bottom-slot` (not inside the canvas area). Activate the Mask tool → mask bar appears in `#bottom-slot`. No JS errors.

---

- [x] 4. **`MpiGroupHistoryBlock.js` — Wire all selection bar events**

  Add `let _currentSelectionIndices = [];` near the top of `setup`.

  Replace `historyList.on('selection-changed')`:
  ```js
  historyList.on('selection-changed', ({ indices }) => {
      _currentSelectionIndices = indices;
      canvasViewer.el.exitMode();
      selectionBar.el.setCount(indices.length);
      _setBottomBar('selection');
  });
  ```

  Replace `historyList.on('selection-exited')`:
  ```js
  historyList.on('selection-exited', () => {
      canvasViewer.el.clearCompare();
      _setBottomBar('promptbox');
  });
  ```

  Wire `selectionBar.on('compare')`:
  ```js
  selectionBar.on('compare', () => {
      if (_currentSelectionIndices.length !== 2) return;
      const [idxA, idxB] = _currentSelectionIndices;
      canvasViewer.el.loadCompare(_group.history[idxA], _group.history[idxB]);
  });
  ```

  Wire `selectionBar.on('download')` — `<a download>` pattern from `MpiGalleryBlock.js:91–114`:
  ```js
  selectionBar.on('download', () => {
      const project = state.currentProject;
      if (!project) return;
      for (const idx of _currentSelectionIndices) {
          const item = _group.history[idx];
          if (!item?.filePath) continue;
          let filename = null;
          try {
              const match = item.filePath.match(/[?&]path=([^&]+)/);
              if (match) filename = decodeURIComponent(match[1]).replace(/\\/g, '/').split('/').pop();
          } catch (_) { continue; }
          if (!filename) continue;
          const url = `/project-media/${project.id}/download/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}`;
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      }
  });
  ```

  Wire `selectionBar.on('cancel')`:
  ```js
  selectionBar.on('cancel', () => {
      historyList.el.exitSelectMode();
      canvasViewer.el.clearCompare();
      _setBottomBar('promptbox');
  });
  ```

  Wire `selectionBar.on('delete')`:
  ```js
  selectionBar.on('delete', () => {
      if (!_currentSelectionIndices.length) return;
      historyList.el.exitSelectMode();
      const sorted = [..._currentSelectionIndices].sort((a, b) => b - a);
      for (const idx of sorted) {
          _group = removeHistoryEntry(_group, idx);
      }
      _currentIdx = _group.selectedIndex;
      _persistGroup();
      historyList.el.removeEntries(_currentSelectionIndices);
      if (_group.history[_currentIdx]) {
          canvasViewer.el.loadEntry(_group.history[_currentIdx], _currentIdx);
      }
  });
  ```

  Remove the now-dead `historyList.on('compare-requested')` and `historyList.on('delete-requested')` handlers.

  **Verify:** Select 1 card → selection bar appears, PromptBox hidden. Select 2 → Compare button enables. Click Compare → compare overlay loads, selection bar stays. Click Cancel → PromptBox restored. Select cards → click Download → files download. Select cards → click Delete → entries removed, PromptBox restored.

---

- [x] 5. **`MpiGroupHistoryBlock.js` — Wire canvas tool flow via `_setBottomBar`**

  Replace the `canvasViewer.on('mode-changed')` handler — remove the `bottomSlot.classList` toggling and call `_setBottomBar` instead:
  ```js
  canvasViewer.on('mode-changed', ({ mode }) => {
      historyTools.el.syncMode(mode);
      if (mode === 'none') {
          _setBottomBar('promptbox');
      } else {
          _setBottomBar('canvas-tool');
      }
  });
  ```

  Confirm `historyTools.on('activate')` still just calls `canvasViewer.el.enterMode(mode)` unchanged — the `'autoMaskImg'` → `'automask'` alias is handled inside `el.enterMode` (step 2).

  **Verify:** Activate Crop tool → crop bar visible in `#bottom-slot`, PromptBox hidden. Press Cancel in crop bar → PromptBox restored. Activate AutoMask tool (`autoMaskImg` mode) → auto-mask bar visible, PromptBox hidden. Cancel → PromptBox restored.

---

## Interaction Matrix (verification checklist)

| Scenario | Expected result |
|---|---|
| Check a card checkbox | Selection bar appears, PromptBox hidden |
| Uncheck last card | `selection-exited` emitted → compare cleared → PromptBox back |
| Click Cancel in selection bar | Same as above |
| Activate Crop/Mask/AutoMask tool | Canvas bar appears in `#bottom-slot`, PromptBox hidden |
| Exit canvas tool (cancel in bar) | `mode-changed { mode: 'none' }` → PromptBox back |
| Select 2 cards, click Compare | Compare overlay loads; selection bar stays |
| Cancel while comparing | compare cleared, selection exited, PromptBox back |
| Click Download | Files download via `<a download>` |
| Click Delete | Entries removed, PromptBox restored |
| AutoMask tool activates | `'autoMaskImg'` maps to `'automask'` inside `el.enterMode` |
