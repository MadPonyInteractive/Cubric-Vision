# HANDOFF: MpiGalleryGrid Refactor & Generating Card Visibility Fix — FINAL

**Date**: 2026-04-15 (Updated after clarification)
**Priority**: HIGHEST (blocks app)
**Status**: Ready for fresh context execution

---

## THE CLARIFIED VISION

After extensive discussion, here's the final architecture:

### What We're Doing

1. **Delete MpiGroupCard.js entirely** — card rendering logic merges INTO MpiGalleryGrid
2. **MpiGalleryGrid becomes a Compound** (only imports Primitives: MpiProgressBar, MpiButton)
3. **MpiGalleryGrid handles card display** (grid layout + individual card rendering)
4. **MpiGalleryBlock imports MpiGalleryGrid as a Compound** (solves Block→Block violation)
5. **Generating card flows through `setGroups()` with `isGenerating` flag** (Option B)

### Result Architecture

```
MpiGalleryBlock (Block)
  ├─ imports: MpiGalleryGrid (Compound) ✓
  ├─ imports: MpiSelectionBar (Compound) ✓
  └─ manages: generation state, selection state, selection bar logic

MpiGalleryGrid (Compound)
  ├─ imports: MpiProgressBar (Primitive) ✓
  ├─ imports: MpiButton (Primitive) ✓
  └─ renders: grid layout + card display (card logic merged from deleted MpiGroupCard)

MpiGroupCard → DELETED ❌
```

---

## THE GENERATING CARD FLOW (Option B: Data-Driven)

**Flow:**
```
PromptBox 'run' event
  ↓
MpiGalleryBlock listens, creates placeholder group with isGenerating: true
  ↓
MpiGalleryBlock calls grid.el.setGroups([placeholderGroup, ...currentGroups])
  ↓
MpiGalleryGrid detects isGenerating flag, renders in generating slot (isolated)
  ↓
As previews arrive: MpiGalleryBlock calls grid.el.updatePreview(tempId, url)
  ↓
On completion: MpiGalleryBlock calls grid.el.setGroups(currentGroups)
```

**Placeholder group structure:**
```javascript
{
    id: tempId,
    type: 'image',
    name: 'Generating...',
    history: [],
    selectedIndex: 0,
    width: 1024,  // or injectionParams.Width
    height: 1024, // or injectionParams.Height
    isGenerating: true,  // ← FLAG for grid to detect
}
```

---

## CURRENT STATE OF WORK

The previous agent **partially started the refactoring**:

✅ **What was done:**
- MpiGalleryBlock now imports MpiGroupCard and MpiSelectionBar
- MpiGalleryBlock has `_makeCard()` function extracted
- MpiGalleryBlock has `_generatingCardId` and `_generatingCardElement` state
- MpiGalleryBlock has `_selectionMode`, `_selectedIds` state
- CSS for generating slot was added (`.mpi-gallery-grid__generating-slot`)
- component-mounts.md was partially updated

❌ **What's INCOMPLETE/WRONG:**
- **MpiGalleryGrid STILL imports MpiGroupCard** (line 2) — should be DELETED
- **MpiGalleryGrid STILL imports MpiSelectionBar** (line 3) — should be DELETED
- **MpiGalleryGrid STILL has duplicate `_makeCard()` function** — should be removed from grid
- **MpiGalleryGrid STILL has `_selectedIds`, `_selectionMode`** — should be removed from grid
- **MpiGroupCard.js still exists** — needs to be DELETED
- **Grid doesn't detect `isGenerating` flag** — needs implementation

---

## FILES TO MODIFY/DELETE

| File | Action | Status |
|------|--------|--------|
| `MpiGalleryBlock.js` | Refactor to integrate card mounting, generate card via setGroups | Partially done |
| `MpiGalleryGrid.js` | Remove Compound imports, remove duplicate `_makeCard`, add `isGenerating` detection | NOT started |
| `MpiGroupCard.js` | DELETE entirely | NOT started |
| `MpiGalleryGrid.css` | Keep (generating slot styles already added) | ✓ Done |
| `component-mounts.md` | Update to reflect new architecture | Partially done |

---

## STEP-BY-STEP IMPLEMENTATION

### PHASE 1: Clean Up MpiGalleryGrid (20 min)

#### Step 1.1: Remove Compound imports
**File**: `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`

**Remove these lines:**
```javascript
import { MpiGroupCard } from '../../Compounds/MpiGroupCard/MpiGroupCard.js';
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
```

Keep only:
```javascript
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
```

#### Step 1.2: Remove duplicate state from MpiGalleryGrid
Remove these variables from the setup function:
```javascript
const _selectedIds = new Set();  // ← Remove
let _selectionMode = false;      // ← Remove
let _selectionBar = null;        // ← Remove
```

These are now in MpiGalleryBlock only.

#### Step 1.3: Remove duplicate functions from MpiGalleryGrid
Delete these functions entirely:
- `_getSelectedGroups()`
- `_enterSelectionMode()`
- `_exitSelectionMode()`
- `_makeCard()` (the entire ~70 line function)

**All these now live in MpiGalleryBlock.**

#### Step 1.4: Remove MpiSelectionBar mounting from MpiGalleryGrid
Find and delete:
```javascript
const selectionBar = MpiSelectionBar.mount(selectionSlot, { count: 0 });
```

And remove its event listeners.

**Note**: The `selectionSlot` div in the template can stay (for MpiGalleryBlock to mount into if needed).

---

### PHASE 2: Refactor MpiGalleryGrid Card Rendering (40 min)

#### Step 2.1: Update template (if needed)
Verify template has:
```html
<div class="mpi-gallery-grid__generating-slot"></div>
<div class="mpi-gallery-grid__grid"></div>
```

The generating slot should be BEFORE the grid (for visual hierarchy).

#### Step 2.2: Merge MpiGroupCard template into MpiGalleryGrid
**What this means:** The individual card's HTML/CSS structure from MpiGroupCard becomes part of how MpiGalleryGrid renders each card.

**Reference**: MpiGroupCard template is:
```html
<div class="mpi-group-card">
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
        <input type="checkbox" class="mpi-group-card__checkbox">
    </div>
    <div class="mpi-group-card__footer">
        <span class="mpi-group-card__name"></span>
        <span class="mpi-group-card__badge"></span>
        <span class="mpi-group-card__type"></span>
    </div>
</div>
```

In MpiGalleryGrid's `_rerenderJustified()`, when creating cards, use this template structure instead of calling `MpiGroupCard.mount()`.

#### Step 2.3: Implement card rendering logic in MpiGalleryGrid
Create a helper function in MpiGalleryGrid that:
1. Creates the card element (from merged MpiGroupCard template)
2. Sets card properties (image, name, etc.)
3. Sets card state if generating (`setGenerating()` logic)
4. Attaches event listeners (click, drag, etc.)

**Reference**: Look at MpiGroupCard's `_render()` function and `_applyGenerating()` for the logic.

#### Step 2.4: Add `isGenerating` flag detection
In `_rerenderJustified()`, when processing groups:

```javascript
rows.forEach(({ items: rowItems }) => {
    rowItems.forEach(({ id, targetWidth }) => {
        const group = display.find(g => g.id === id);

        if (group.isGenerating) {
            // Render in generating slot (not normal grid)
            _renderGeneratingCard(group);
        } else {
            // Render in normal grid row
            const { card, wrapper } = _makeCard(group);
            // ... append to row
        }
    });
});

function _renderGeneratingCard(group) {
    const generatingSlot = el.querySelector('.mpi-gallery-grid__generating-slot');
    const wrapper = ce('div', { className: 'mpi-gallery-grid__card-wrap' });

    // Create and render card (use merged MpiGroupCard logic)
    const card = _createCardElement(group);
    wrapper.appendChild(card);

    // Set generating state
    card.classList.add('mpi-group-card--generating');
    card.querySelector('.mpi-group-card__preview')?.classList.add('mpi-group-card__preview--visible');

    generatingSlot.innerHTML = '';
    generatingSlot.appendChild(wrapper);
    generatingSlot.classList.add('mpi-gallery-grid__generating-slot--visible');

    _cardMap.set(group.id, { card, el: wrapper });
}
```

#### Step 2.5: Update `updatePreview()` method
```javascript
el.updatePreview = (tempId, previewUrl) => {
    const entry = _cardMap.get(tempId);
    if (!entry) return;

    const previewImg = entry.card.querySelector('.mpi-group-card__preview-img');
    const spinner = entry.card.querySelector('.mpi-group-card__spinner');

    if (previewImg) previewImg.src = previewUrl;
    if (spinner) spinner.style.display = 'none';
};
```

---

### PHASE 3: Update MpiGalleryBlock (30 min)

#### Step 3.1: Remove old generating card logic
Delete the old code that used `addGeneratingCard()`, `finalizeCard()`, etc.

#### Step 3.2: Implement new generatecard flow via setGroups
In the `promptBox.on('run', ...)` handler:

```javascript
promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
    if (!activeModel) return;

    const tempId = crypto.randomUUID();
    const cardType = activeModel.mediaType;

    // Capture current groups BEFORE creating placeholder
    const currentGroups = state.currentProject?.itemGroups || [];

    // Create placeholder group with isGenerating flag
    const placeholderGroup = {
        id: tempId,
        type: cardType,
        name: 'Generating...',
        history: [],
        selectedIndex: 0,
        width: injectionParams.Width || _cardWidth,
        height: injectionParams.Height || _cardWidth,
        isGenerating: true,  // ← FLAG for grid to detect
    };

    // Tell grid: display this group + all current groups
    grid.el.setGroups([placeholderGroup, ...currentGroups]);

    // Track generating card state
    _generatingCardId = tempId;
    StatusBar.progress.start('Generating...');

    // ... rest of generation logic (unchanged)
    _activeExec = runCommand({ ... });

    _activeExec.onPreview = (url) => grid.el.updatePreview(tempId, url);

    _activeExec.onComplete = async (urls) => {
        _activeExec = null;
        PromptBoxService.component?.setGenerating(false);

        if (!urls.length) {
            StatusBar.progress.cancel();
            grid.el.setGroups(currentGroups);  // Remove placeholder
            return;
        }

        // ... save generation logic ...

        const group = createItemGroup(cardType, { name: cardName });
        group = appendToHistory(group, item);

        if (state.currentProject) {
            state.currentProject = addGroupToProject(state.currentProject, group);
            _persistGroups();
        }

        StatusBar.progress.complete('Image generated!');
        grid.el.setGroups([group, ...currentGroups]);  // Replace placeholder with final
    };

    _activeExec.onError = (err) => {
        _activeExec = null;
        clientLogger.error('MpiGalleryBlock', 'Generation error:', err);
        PromptBoxService.component?.setGenerating(false);
        StatusBar.progress.cancel();
        grid.el.setGroups(currentGroups);  // Remove placeholder
    };
});
```

#### Step 3.3: Ensure selection bar is mounted and managed
Make sure MpiGalleryBlock imports and mounts MpiSelectionBar, with logic to hide prompt box when entering selection mode.

---

### PHASE 4: Delete MpiGroupCard (5 min)

**Delete file:**
```
js/components/Compounds/MpiGroupCard/MpiGroupCard.js
js/components/Compounds/MpiGroupCard/MpiGroupCard.css
```

**Remove registration from preloadStyles.js if present.**

---

### PHASE 5: Update Documentation (10 min)

**Update `.claude/rules/component-mounts.md`:**

Change the MpiGalleryGrid section from:
```
## MpiGalleryGrid.js (internal mounts)
- `MpiProgressBar` ...
- `MpiSelectionBar` ...
- `MpiGroupCard` ...
```

To:
```
## MpiGalleryGrid.js (internal rendering, no sub-component mounts)

MpiGalleryGrid is now a Compound that handles both:
1. **Grid layout** (justified layout, rows, sizing)
2. **Card display** (merged from deleted MpiGroupCard)

**Primitives mounted:**
- `MpiProgressBar` (size slider) — props: `{ min:1, max:5, ... }`
- `MpiButton` (info toggle) — props: `{ icon:'info', ... }`

**Card rendering:**
- Cards are now rendered as DOM elements, not components
- Card logic (generating state, preview, etc.) integrated directly
- Generating cards detected by `isGenerating` flag and rendered in `.mpi-gallery-grid__generating-slot`
```

---

## TESTING STRATEGY

### Test 1: Generate Image
1. Open gallery
2. Select model, enter prompt
3. Click Generate
4. **Verify**: Generating card appears with spinner
5. **Verify**: Latent previews update
6. **Verify**: Card disappears on completion, final image appears

### Test 2: Multiple Generations
1. Start generation
2. Before completion, start another
3. **Verify**: Previous card cleared, new one appears
4. **Verify**: Both images appear when done

### Test 3: Selection Mode During Generation
1. Start generation
2. While generating, select another card
3. **Verify**: Selection bar appears
4. **Verify**: Generating card still visible
5. Complete generation
6. **Verify**: New card joins selection

### Test 4: Filter/Sort Changes During Generation
1. Start generation
2. Change filter or sort
3. **Verify**: Generating card persists (not affected by justified layout changes)

### Test 5: Error Handling
1. Start generation
2. Force error (disconnect from ComfyUI, etc.)
3. **Verify**: Generating card removed
4. **Verify**: Error message shown
5. **Verify**: Grid restored to current groups

---

## VERIFICATION CHECKLIST

Before marking complete:

- [ ] MpiGroupCard.js is deleted
- [ ] MpiGalleryGrid imports ONLY Primitives (MpiProgressBar, MpiButton)
- [ ] MpiGalleryBlock imports MpiGalleryGrid as Compound
- [ ] Card rendering logic merged into MpiGalleryGrid
- [ ] `isGenerating` flag detection implemented
- [ ] Generating slot shows/hides correctly
- [ ] `updatePreview()` works for generating card
- [ ] `setGroups()` handles placeholder groups correctly
- [ ] Selection mode works during generation
- [ ] No console errors
- [ ] All 5 tests pass
- [ ] component-mounts.md updated
- [ ] MpiGalleryGrid is a valid Compound (Primitive imports only)

---

## KEY FILES TO READ BEFORE STARTING

1. `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — understand current structure (already partially refactored)
2. `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js` — understand grid rendering
3. `js/components/Compounds/MpiGroupCard/MpiGroupCard.js` — understand card logic to merge
4. `js/components/Compounds/MpiGroupCard/MpiGroupCard.css` — card styles (reference only)

---

## COMMON PITFALLS

1. **Don't leave duplicate `_makeCard()` in grid** — must be removed
2. **Don't forget to delete MpiGroupCard.js** — it won't exist after refactor
3. **Don't mix generating card with normal grid rows** — keep them separate in template
4. **Don't break `updatePreview()` for normal grid cards** — must work for both
5. **Don't forget `isGenerating` flag detection** — this is what makes the flow work

---

## SUCCESS CRITERIA

✅ Generating card is visible during generation with spinner
✅ Latent previews update in real-time
✅ Card disappears on completion without artifacts
✅ Multiple generations work sequentially
✅ Selection mode works during generation
✅ Filter/sort changes don't affect generating card
✅ MpiGalleryGrid is a Compound (only Primitive imports)
✅ No Block→Block imports
✅ All tests pass
✅ No console errors

---

## ESTIMATED TIME

- Phase 1 (Clean MpiGalleryGrid): 20 min
- Phase 2 (Card rendering refactor): 40 min
- Phase 3 (Update MpiGalleryBlock): 30 min
- Phase 4 (Delete MpiGroupCard): 5 min
- Phase 5 (Docs): 10 min
- Testing: 30 min

**Total: ~2 hours**

---

**Ready to execute. No additional context needed.**
