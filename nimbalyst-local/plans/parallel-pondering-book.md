# Plan: MpiGalleryGrid Refactor (Gallery Grid → Compound, isGenerating flow)

## Context

MpiGalleryBlock (Block) currently imports MpiGalleryGrid (Block) — a Block→Block violation.
The previous agent partially started the refactor but left MpiGalleryGrid still importing
MpiGroupCard and MpiSelectionBar (both Compounds), and the generating card flow still uses
the old setGeneratingCard/clearGeneratingCard API instead of the planned isGenerating flag approach.

This plan completes the refactor so:
- MpiGalleryGrid only imports Primitives (MpiProgressBar, MpiButton) → classified as Compound
- Card rendering is merged inline (no MpiGroupCard component mount)
- Selection bar is mounted by MpiGalleryBlock, not MpiGalleryGrid
- Generating card flows through `setGroups()` with `isGenerating: true` flag
- MpiGroupCard is deleted entirely

---

## Critical Files

| File | Action |
|------|--------|
| `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js` | Major refactor |
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | Refactor generation + selection bar |
| `js/components/Compounds/MpiGroupCard/MpiGroupCard.js` | DELETE |
| `js/components/Compounds/MpiGroupCard/MpiGroupCard.css` | DELETE |
| `js/shell/preloadStyles.js` | Move MpiGalleryGrid.css to Compounds section, remove MpiGroupCard.css |
| `.claude/rules/component-mounts.md` | Update MpiGalleryGrid and MpiGalleryBlock sections |

---

## Phase 1 — Clean MpiGalleryGrid (remove Compound imports)

**File:** `MpiGalleryGrid.js`

1. Remove imports:
   ```js
   import { MpiGroupCard } from '../../Compounds/MpiGroupCard/MpiGroupCard.js';
   import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
   ```

2. Remove from setup function:
   - `const _selectedIds = new Set();`
   - `let _selectionMode = false;`
   - `const selectionBar = MpiSelectionBar.mount(...)`
   - `selectionBar.on('cancel', ...)`, `selectionBar.on('compare', ...)`, etc.
   - `_enterSelectionMode()` and `_exitSelectionMode()` functions
   - `_getSelectedGroups()` function
   - `_makeCard()` function entirely (~70 lines)

3. Keep: `_selectedIds` and `_selectionMode` as internal state — grid still owns selection so it can emit the right events. Inline the enter/exit logic (simplified) without the old selectionBar calls.

4. After cleanup, grid still needs to emit: `'selection-start'`, `'selection-end'`, `'selection-change' { count }` so MpiGalleryBlock can drive the mounted selection bar.

5. Remove the old public methods: `el.setGeneratingCard()`, `el.clearGeneratingCard()` — replaced by `isGenerating` flag logic in `_rerenderJustified()`.

6. Add new public methods:
   - `el.getSelectedGroups()` → returns `_groups.filter(g => _selectedIds.has(g.id))`
   - `el.clearSelection()` → calls internal _exitSelectionMode equivalent

---

## Phase 2 — Merge card rendering inline into MpiGalleryGrid

**File:** `MpiGalleryGrid.js`

### 2.1 — Card DOM helper
Add `_createCardEl(group)` that builds the card DOM directly (no MpiGroupCard.mount):

```js
function _createCardEl(group) {
    const card = ce('div', { className: 'mpi-group-card' });
    card.innerHTML = `
        <div class="mpi-group-card__media">
            <img class="mpi-group-card__thumb" alt="" draggable="true">
            <div class="mpi-group-card__preview">
                <div class="mpi-group-card__spinner"></div>
                <img class="mpi-group-card__preview-img" alt="">
            </div>
        </div>
        <div class="mpi-group-card__fav-wrap"></div>
        <div class="mpi-group-card__reuse-wrap"></div>
        <div class="mpi-group-card__select-wrap">
            <input type="checkbox" class="mpi-group-card__checkbox" aria-label="Select group">
        </div>
        <div class="mpi-group-card__footer">
            <span class="mpi-group-card__name"></span>
            <span class="mpi-group-card__badge"></span>
            <span class="mpi-group-card__type"></span>
        </div>
    `;
    // Mount MpiButton for fav and reuse (Primitives ✓)
    // Populate thumb, name, badge, type from group
    // Attach click/checkbox listeners → emit 'open-group', 'card-select', etc.
    return card;
}
```

Copy the initialization logic from `MpiGroupCard.js:_render()` for setting thumb src, name, badge, type, dragstart.

Mount MpiButton for fav and reuse buttons using `MpiButton.mount()` (Primitive — allowed).

### 2.2 — Update `_rerenderJustified()`
Separate generating groups from normal groups before layout:

```js
const generatingGroup = display.find(g => g.isGenerating);
const normalGroups    = display.filter(g => !g.isGenerating);

// Render generating slot
const genSlot = el.querySelector('.mpi-gallery-grid__generating-slot');
if (generatingGroup) {
    _renderGeneratingCard(generatingGroup, genSlot);
} else {
    genSlot.innerHTML = '';
    genSlot.classList.remove('mpi-gallery-grid__generating-slot--visible');
}

// Justified layout uses only normalGroups
const items = normalGroups.map(g => ({ id: g.id, targetWidth: _cardWidth }));
const rows = packItemsIntoRows(items, containerWidth, GAP, _cardWidth);
// ... build rows using _createCardEl(group)
```

### 2.3 — Generating slot renderer
```js
function _renderGeneratingCard(group, slot) {
    const wrapper = ce('div', { className: 'mpi-gallery-grid__card-wrap' });
    const card    = _createCardEl(group);
    const displayW = group.width  || _cardWidth;
    const displayH = group.height || _cardWidth;
    wrapper.style.width  = `${displayW}px`;
    wrapper.style.height = `${displayH}px`;
    card.classList.add('mpi-group-card--generating');
    card.querySelector('.mpi-group-card__preview')?.classList.add('mpi-group-card__preview--visible');
    wrapper.appendChild(card);
    slot.innerHTML = '';
    slot.appendChild(wrapper);
    slot.classList.add('mpi-gallery-grid__generating-slot--visible');
    _cardMap.set(group.id, { card, el: wrapper });
}
```

### 2.4 — Update `el.updatePreview()`
Replace the old `.card.el.updatePreview()` call with direct DOM access:
```js
el.updatePreview = (tempId, previewUrl) => {
    const entry = _cardMap.get(tempId);
    if (!entry) return;
    const previewImg = entry.card.querySelector('.mpi-group-card__preview-img');
    const spinner    = entry.card.querySelector('.mpi-group-card__spinner');
    if (previewImg) previewImg.src = previewUrl;
    if (spinner)    spinner.style.display = 'none';
};
```

### 2.5 — Selection state in card rendering
In `_createCardEl()` event listeners:
- checkbox change → update `_selectedIds`, if first selection emit `'selection-start'`, always emit `'selection-change' { count: _selectedIds.size }`, if count reaches 0 emit `'selection-end'`
- card click (not generating, not in selectionMode) → emit `'open-group' { group }`
- card click in selectionMode → toggle checkbox, propagate as above

Grid's `el.clearSelection()`:
```js
el.clearSelection = () => {
    _selectedIds.clear();
    _selectionMode = false;
    _cardMap.forEach(({ card }) => {
        card.classList.remove('mpi-group-card--selected', 'mpi-group-card--selection-mode');
        const cb = card.querySelector('.mpi-group-card__checkbox');
        if (cb) cb.checked = false;
    });
    emit('selection-end');
};
```

---

## Phase 3 — Update MpiGalleryBlock

**File:** `MpiGalleryBlock.js`

### 3.1 — Remove dead code from block
Delete these (now owned by grid):
- `const _cardMap = new Map()`
- `const _selectedIds = new Set()`
- `let _selectionMode = false`
- `let _generatingCardId = null`
- `let _generatingCardElement = null`
- `let _selectionBar = null`
- `function _makeCard(group) { ... }` (entire function, ~50 lines)
- `function _getSelectedGroups() { ... }`
- `function _enterSelectionMode() { ... }`
- `function _exitSelectionMode() { ... }`

Remove import of MpiGroupCard (line 15) — no longer used.

### 3.2 — Mount selection bar into grid's slot
After `const grid = MpiGalleryGrid.mount(el, { groups });`:

```js
const selectionBarSlot = grid.el.querySelector('.mpi-gallery-grid__selectionbar-slot');
const selectionBar     = MpiSelectionBar.mount(selectionBarSlot, { count: 0 });

grid.on('selection-start', () => {
    selectionBarSlot.style.display = '';
    grid.el.classList.add('mpi-gallery-grid--selecting');
    PromptBoxService.hide();
});
grid.on('selection-end', () => {
    selectionBarSlot.style.display = 'none';
    grid.el.classList.remove('mpi-gallery-grid--selecting');
    PromptBoxService.show();
});
grid.on('selection-change', ({ count }) => selectionBar.el.setCount(count));

selectionBar.on('cancel',   () => grid.el.clearSelection());
selectionBar.on('compare',  () => {
    const selected = grid.el.getSelectedGroups();
    if (selected.length !== 2) return;
    const itemA = getSelectedItem(selected[0]);
    const itemB = getSelectedItem(selected[1]);
    if (!itemA || !itemB) return;
    _compareOverlay.el.open(itemA, itemB);
});
selectionBar.on('download', () => {
    // Move download logic here (inline from current grid.on('download') handler)
});
selectionBar.on('delete', () => {
    _pendingDeleteGroups = grid.el.getSelectedGroups();
    _deleteDialog.el.show();
});
```

Remove the old `grid.on('compare', ...)`, `grid.on('download', ...)`, `grid.on('delete', ...)` listeners (now handled via selectionBar above).

Keep: `grid.on('selection-start')` / `grid.on('selection-end')` are now used for the new handlers above. Remove the old ones: `grid.on('selection-start', () => PromptBoxService.hide())` and `grid.on('selection-end', () => PromptBoxService.show())`.

### 3.3 — New generation flow (setGroups with isGenerating flag)
Replace old `grid.el.setGeneratingCard()` / `grid.el.clearGeneratingCard()` approach:

```js
promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
    if (!activeModel) return;
    const tempId       = crypto.randomUUID();
    const cardType     = activeModel.mediaType;
    const currentGroups = state.currentProject?.itemGroups || [];

    const placeholderGroup = {
        id: tempId, type: cardType, name: 'Generating...',
        history: [], selectedIndex: 0,
        width:  injectionParams.Width  || 288,
        height: injectionParams.Height || 288,
        isGenerating: true,   // ← grid detects this flag
    };

    grid.el.setGroups([placeholderGroup, ...currentGroups]);
    StatusBar.progress.start('Generating...');

    _activeExec = runCommand({ operation, modelId: activeModel.id, positive, negative, mediaItems, injectionParams });
    const exec = _activeExec;

    exec.onPreview  = (url) => grid.el.updatePreview(tempId, url);
    exec.onProgress = (value) => StatusBar.progress.update(value);

    exec.onComplete = async (urls) => {
        _activeExec = null;
        PromptBoxService.component?.setGenerating(false);
        if (!urls.length) {
            StatusBar.progress.cancel();
            grid.el.setGroups(currentGroups); // remove placeholder
            return;
        }
        // ... save-generation fetch (unchanged) ...
        let group = createItemGroup(cardType, { name: cardName });
        group = appendToHistory(group, item);
        if (state.currentProject) {
            state.currentProject = addGroupToProject(state.currentProject, group);
            _persistGroups();
        }
        StatusBar.progress.complete('Image generated!');
        grid.el.setGroups([group, ...currentGroups]); // replaces placeholder
    };

    exec.onError = (err) => {
        _activeExec = null;
        clientLogger.error('MpiGalleryBlock', 'Generation error:', err);
        PromptBoxService.component?.setGenerating(false);
        StatusBar.progress.cancel();
        grid.el.setGroups(currentGroups); // remove placeholder
    };
});
```

### 3.4 — Update delete handler
Replace `grid.el.removeCard(group.id)` calls with a single `grid.el.setGroups(state.currentProject.itemGroups)` after all deletions are processed. Simpler and avoids stale state.

---

## Phase 4 — Delete MpiGroupCard

1. Delete `js/components/Compounds/MpiGroupCard/MpiGroupCard.js`
2. Delete `js/components/Compounds/MpiGroupCard/MpiGroupCard.css`
3. In `preloadStyles.js`: remove line `'js/components/Compounds/MpiGroupCard/MpiGroupCard.css'`
4. In `preloadStyles.js`: move `'js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.css'` from `// Blocks` to `// Compounds` section (reclassification)
5. Remove `import { MpiGroupCard }` from MpiGalleryBlock.js

---

## Phase 5 — Update component-mounts.md

Update `MpiGalleryGrid.js` section:
```
## MpiGalleryGrid.js (Compound — Primitive mounts only, direct DOM card rendering)

**Primitives mounted:**
- MpiProgressBar (size slider) — props: { min:1, max:5, step:1, value:3, interactive:true, wheel:true, info:'Size: {value}' }
- MpiButton (info toggle) — props: { icon:'info', size:'sm', variant:'ghost', toggleable:true }
- MpiButton (fav) per card — props: { icon:'heartOutline', iconActive:'heart', toggleable:true, size:'sm', variant:'ghost' }
- MpiButton (reuse) per card — props: { icon:'refresh_stroke', size:'sm', variant:'ghost' }

**Card rendering:** inline DOM (merged from deleted MpiGroupCard) — one per ItemGroup
**Generating slot:** group with isGenerating:true rendered in .mpi-gallery-grid__generating-slot; isolated from justified layout rows
**Selection state:** owned internally by grid; exposes el.getSelectedGroups() and el.clearSelection()
**Events emitted:** 'open-group', 'gc-group', 'gc-remove', 'favourite', 'reuse', 'selection-start', 'selection-end', 'selection-change { count }'
```

Update `MpiGalleryBlock` section:
- Replace MpiGroupCard generating-card entry with new isGenerating flow description
- Add MpiSelectionBar entry (now mounted in MpiGalleryBlock, not grid)

---

## Verification Checklist

- [ ] MpiGroupCard.js and .css deleted, no references remain
- [ ] MpiGalleryGrid imports only: ComponentFactory, MpiProgressBar, MpiButton, ce/qs, projectModel, state, Events, justifiedLayout
- [ ] MpiGalleryBlock no longer imports MpiGroupCard
- [ ] Generating card appears with spinner during generation
- [ ] Latent previews update via `updatePreview()` on the generating card
- [ ] Generating card disappears on completion/error; final image appears
- [ ] Selection mode works: checkbox triggers bar, compare/download/delete work
- [ ] Selection bar shows/hides PromptBox correctly
- [ ] No console errors
- [ ] `resizeRowImages()` still works (selector `.mpi-group-card__thumb` unchanged)
- [ ] preloadStyles.js updated (MpiGroupCard.css removed, MpiGalleryGrid.css moved to Compounds)
- [ ] component-mounts.md updated
