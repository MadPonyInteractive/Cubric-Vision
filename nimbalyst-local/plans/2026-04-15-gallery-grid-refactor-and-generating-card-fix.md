# Plan: MpiGalleryGrid Refactor + Generating Card Visibility Fix

**Status**: Ready to Execute
**Priority**: Highest (blocks app)
**Date Created**: 2026-04-15
**Target Outcome**: MpiGalleryGrid becomes a Compound; generating card visible during generation

---

## CONTEXT & PROBLEM STATEMENT

### The Bug
When justified layout was introduced (commit `5108f04`), the generating card stopped appearing during generation. The card is created, marked as "generating", but renders invisible/empty in the grid.

**Root Cause**: The generating card is now processed through `_rerenderJustified()` which:
- Filters/sorts all groups (including placeholder)
- Calculates justified layout dimensions for cards with visible thumbnails
- Creates rows with fixed heights (200px)
- Overwrites wrapper dimensions and classes
- The card ends up invisible due to layout conflicts and size mismatches

### Architectural Issue
**MpiGalleryBlock (Block) imports MpiGalleryGrid (Block)** — violates 3-tier hierarchy:
- Primitives → Compounds → Blocks
- Blocks should only import Primitives & Compounds, never other Blocks

### Solution Overview
1. **Make MpiGalleryGrid a Compound** by removing non-Primitive imports
2. **Move component mounting to MpiGalleryBlock** (MpiGroupCard, MpiSelectionBar ownership)
3. **Isolate generating card** from justified layout flow
4. **Clean architecture** = Compound reusable for future popup gallery

---

## ARCHITECTURAL DECISIONS

### Decision 1: MpiSelectionBar Usage
**Finding**: MpiSelectionBar is used by BOTH MpiGalleryGrid and MpiGroupHistoryBlock.

**Decision**: MpiSelectionBar stays a Compound, imported by both blocks independently.
- This is correct pattern: Compounds are reusable across Blocks
- No architectural violation
- Each block mounts its own instance

### Decision 2: MpiGroupCard Usage
**Finding**: MpiGroupCard is ONLY used in MpiGalleryGrid's `_makeCard()` function.

**Decision**: Move MpiGroupCard mounting logic to MpiGalleryBlock.
- MpiGalleryBlock becomes responsible for creating/mounting cards
- MpiGalleryGrid becomes a pure layout renderer
- Reduces MpiGalleryGrid's component dependencies to Primitives only

### Decision 3: MpiGalleryGrid Compound Responsibility
**New Role**: Pure layout & display component
- **Receives**: group data, selected IDs, filtering/sorting state (via props)
- **Renders**: justified layout rows, size slider, info button, selection bar slot
- **Does NOT**: create MpiGroupCard instances (parent does)
- **Does NOT**: manage card-specific events (parent handles)
- **Emits**: grid-level events (open-group, compare, delete, download, gc-*, selection-start/end)

### Decision 4: Generating Card Handling
**New Approach**: Separate dedicated method, isolated from normal grid flow
- MpiGalleryBlock calls `grid.el.setGeneratingCard(tempId, width, height)` instead of `setGroups()`
- Generating card rendered in separate area (preserved, not part of justified layout)
- `updatePreview(tempId, url)` updates card in-place
- `finalizeCard()` or `removeGeneratingCard()` removes it and re-renders normal grid

---

## FILES TO MODIFY

| File | Changes | Type |
|------|---------|------|
| `MpiGalleryBlock.js` | Import MpiGroupCard; move card mounting logic; manage generating card | Major |
| `MpiGalleryGrid.js` | Remove MpiGroupCard import; refactor to accept parent-created card elements; add setGeneratingCard() method | Major |
| `MpiGalleryGrid.css` | Add styles for generating card display area (if needed) | Minor |
| `MpiGroupCard.js` | No changes (card logic is fine) | None |
| `MpiSelectionBar.js` | No changes | None |
| Component rules | Update `.claude/rules/component-mounts.md` | Documentation |

---

## STEP-BY-STEP IMPLEMENTATION

### PHASE 1: PREPARE & UNDERSTAND (15 min)

#### Step 1.1: Review current data flow
```bash
# Read these files completely to understand the flow:
1. js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js (full file)
2. js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js (full file)
3. js/components/Compounds/MpiGroupCard/MpiGroupCard.js (focus: _render, setGenerating, etc.)
```

**Expected Understanding**:
- How `_groups` state flows through MpiGalleryBlock → MpiGalleryGrid
- How `setGroups()` triggers `_rerenderJustified()`
- How `_makeCard()` creates cards and sets up event listeners
- How selection mode works (enter/exit, selection tracking)
- How generating card is currently created and updated

#### Step 1.2: Identify event listeners on cards
In MpiGalleryGrid, locate all `card.on()` calls in `_makeCard()`:
- `card.on('open', ...)`
- `card.on('select', ...)`
- `card.on('media-missing', ...)`
- `card.on('reuse', ...)`
- `card.on('favourite', ...)`

**Note these down** — MpiGalleryBlock will need to attach these, or a callback mechanism will be created.

### PHASE 2: REFACTOR MpiGalleryBlock (45 min)

#### Step 2.1: Add MpiGroupCard import
```javascript
import { MpiGroupCard } from '../../Compounds/MpiGroupCard/MpiGroupCard.js';
```

#### Step 2.2: Extract `_makeCard()` function from MpiGalleryGrid
Copy the entire `_makeCard()` function from MpiGalleryGrid.js to MpiGalleryBlock.js setup().

**Adapt it**:
- Change references to `_selectedIds` → use MpiGalleryBlock's equivalent (or pass via callback)
- Change `emit()` calls to trigger appropriate MpiGalleryBlock logic
- Keep the card event listener attachments

#### Step 2.3: Move selection mode management
Extract from MpiGalleryGrid:
- `_enterSelectionMode()` logic
- `_exitSelectionMode()` logic
- Selection bar interaction (cancel, compare, download, delete)

Move to MpiGalleryBlock or keep as a helper that MpiGalleryBlock coordinates.

**Key decision**: Should MpiGalleryBlock or MpiGalleryGrid manage "is in selection mode"?
- **Recommendation**: MpiGalleryBlock owns this state, passes to MpiGalleryGrid as prop
- Cleaner: one source of truth for selection state

#### Step 2.4: Add generating card state to MpiGalleryBlock
```javascript
let _generatingCardId = null;
let _generatingCardElement = null;  // the card instance

// Or track it in _cardMap:
// _cardMap.set(tempId, { card, el, isGenerating: true })
```

#### Step 2.5: Refactor generating card handler
**Current code** (in promptBox 'run' event):
```javascript
const placeholderGroup = { ... };
grid.el.setGroups([placeholderGroup, ...currentGroups]);
exec.onPreview = (url) => grid.el.updatePreview(tempId, url);
```

**Change to**:
```javascript
// Create placeholder group (keep as-is)
const placeholderGroup = { ... };

// Mount the card NOW, before calling grid methods
const generatingCardWrapper = document.createElement('div');
const generatingCard = MpiGroupCard.mount(generatingCardWrapper, { group: placeholderGroup });
generatingCard.el.setGenerating(null);
_generatingCardElement = generatingCard;
_generatingCardId = tempId;

// Tell grid to show this card in the generating area
grid.el.setGeneratingCard(generatingCardWrapper, placeholderGroup.width, placeholderGroup.height);

// Update grid with normal groups (no placeholder)
grid.el.setGroups(currentGroups);

// Preview updates
exec.onPreview = (url) => _generatingCardElement?.el.updatePreview(url);
```

#### Step 2.6: Update generation completion handlers
```javascript
exec.onComplete = async (urls) => {
    // ... existing logic ...

    // Remove generating card
    grid.el.clearGeneratingCard();
    _generatingCardElement = null;
    _generatingCardId = null;

    // Add final group and re-render
    grid.el.setGroups([group, ...currentGroups]);
};

exec.onError = (err) => {
    // Remove generating card
    grid.el.clearGeneratingCard();
    _generatingCardElement = null;
    _generatingCardId = null;

    // Re-render without placeholder
    grid.el.setGroups(currentGroups);
};
```

### PHASE 3: REFACTOR MpiGalleryGrid → Compound (60 min)

#### Step 3.1: Remove non-Primitive imports
**Delete these imports**:
```javascript
import { MpiGroupCard } from '../../Compounds/MpiGroupCard/MpiGroupCard.js';
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
```

**Keep these**:
```javascript
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
```

#### Step 3.2: Remove `_makeCard()` function
Delete the entire function (~70 lines).

#### Step 3.3: Refactor `_rerenderJustified()`
**Current approach**: Creates cards AND sets up event listeners in `_makeCard()`

**New approach**: Parent passes pre-mounted card elements

**Option A (Simpler for now)**: Keep card mounting in MpiGalleryGrid, but don't attach event listeners
```javascript
// In _rerenderJustified, after creating row:
rowItems.forEach(({ id, targetWidth }) => {
    const group = display.find(g => g.id === id);

    // Parent responsibility: create wrapper
    // We: just use it for layout
    const wrapper = ce('div', { className: 'mpi-gallery-grid__card-wrap' });

    // TEMP: Mount card here (MpiGalleryBlock will do this later)
    // For now, keep the mount but remove event listeners
    const card = MpiGroupCard.mount(wrapper, {
        group,
        selectionMode: _selectionMode,
        selected: _selectedIds.has(group.id),
    });

    wrapper.className = 'mpi-gallery-grid__row-wrap';
    wrapper.style.width = `${targetWidth}px`;
    rowEl.appendChild(wrapper);
    _cardMap.set(id, { card, el: wrapper });
});
```

**OR Option B (Cleaner, requires more refactoring)**: Accept pre-created elements
```javascript
// _rerenderJustified accepts a cardFactory callback:
function _rerenderJustified(cardFactory) {
    // ...
    rowItems.forEach(({ id, targetWidth }) => {
        const group = display.find(g => g.id === id);
        const { card, wrapper } = cardFactory(group);  // Parent creates

        wrapper.className = 'mpi-gallery-grid__row-wrap';
        wrapper.style.width = `${targetWidth}px`;
        rowEl.appendChild(wrapper);
        _cardMap.set(id, { card, el: wrapper });
    });
}
```

**Recommendation**: Use Option A for now (simpler, less refactoring). MpiGalleryBlock can move card mounting in a future refactor.

#### Step 3.4: Remove selection mode management from MpiGalleryGrid
These functions should either:
- Move to MpiGalleryBlock, OR
- Stay in MpiGalleryGrid but be called by MpiGalleryBlock via prop/method

**Simplest approach**: Keep `_enterSelectionMode()` / `_exitSelectionMode()` in MpiGalleryGrid (they're UI state), but have MpiGalleryBlock trigger them:
```javascript
el.enterSelectionMode = () => _enterSelectionMode();
el.exitSelectionMode = () => _exitSelectionMode();
```

MpiGalleryBlock calls these as needed.

#### Step 3.5: Add new public API methods for generating card

**Add to MpiGalleryGrid's public API**:

```javascript
/**
 * Display a generating card in a dedicated area above the normal grid.
 * @param {HTMLElement} wrapper - pre-mounted card wrapper
 * @param {number} width - card width in px
 * @param {number} height - card height in px
 */
el.setGeneratingCard = (wrapper, width, height) => {
    const generatingSlot = el.querySelector('.mpi-gallery-grid__generating-slot')
        || _ensureGeneratingSlot();

    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    generatingSlot.innerHTML = '';
    generatingSlot.appendChild(wrapper);
};

/**
 * Remove the generating card and restore normal grid.
 */
el.clearGeneratingCard = () => {
    const generatingSlot = el.querySelector('.mpi-gallery-grid__generating-slot');
    if (generatingSlot) generatingSlot.innerHTML = '';
};

function _ensureGeneratingSlot() {
    let slot = el.querySelector('.mpi-gallery-grid__generating-slot');
    if (!slot) {
        slot = ce('div', { className: 'mpi-gallery-grid__generating-slot' });
        // Insert after grid header, before main grid
        const grid = el.querySelector('.mpi-gallery-grid__grid');
        grid.parentNode.insertBefore(slot, grid);
    }
    return slot;
}
```

#### Step 3.6: Update template (if needed)
Check if `.mpi-gallery-grid__generating-slot` exists in template. If not, add it:
```html
<div class="mpi-gallery-grid__tabs">...</div>
<div class="mpi-gallery-grid__generating-slot"></div>  <!-- ADD THIS -->
<div class="mpi-gallery-grid__grid"></div>
<div class="mpi-gallery-grid__footer">...</div>
```

#### Step 3.7: Update updatePreview() method
Should work as-is, but verify it handles the generating card:
```javascript
el.updatePreview = (tempId, previewUrl) => {
    // First check if it's in the generating slot
    const generatingSlot = el.querySelector('.mpi-gallery-grid__generating-slot');
    if (generatingSlot) {
        const card = generatingSlot.querySelector('.mpi-group-card');
        if (card && card.el && tempId === _currentGeneratingId) {
            return card.el.updatePreview(previewUrl);
        }
    }

    // Then check regular grid
    _cardMap.get(tempId)?.card.el.updatePreview(previewUrl);
};
```

### PHASE 4: ADD STYLES (10 min)

#### Step 4.1: Add generating slot CSS
In `MpiGalleryGrid.css`:
```css
.mpi-gallery-grid__generating-slot {
    display: flex;
    justify-content: flex-start;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border-soft);
    background: color-mix(in srgb, var(--surface-1) 98%, var(--neon-electric) 2%);
    min-height: 300px;  /* or adjust to card height */
}

.mpi-gallery-grid__generating-slot .mpi-gallery-grid__card-wrap {
    /* Ensure card renders with explicit dimensions */
    flex-shrink: 0;
}
```

### PHASE 5: UPDATE DOCUMENTATION (10 min)

#### Step 5.1: Update component-mounts.md
Change:
```
## MpiGalleryBlock
- `MpiGalleryGrid`   props: `{ groups: ItemGroup[] }`   slot: top-level workspace container
```

To:
```
## MpiGalleryBlock
- `MpiGalleryGrid`   props: `{ groups: ItemGroup[] }`   slot: top-level workspace container — **Now a Compound**
- `MpiGroupCard`     props: `{ group, selectionMode, selected }`   mounted in MpiGalleryBlock setup; one per ItemGroup
- `MpiSelectionBar`  props: `{ count: 0 }`   slot: footer; managed by MpiGalleryBlock
```

#### Step 5.2: Update MpiGalleryGrid comment
Change docstring:
```javascript
/**
 * MpiGalleryGrid — Compound: adaptive grid of ItemGroup cards with justified layout.
 * Pure display component — does NOT create components or manage complex state.
 *
 * Parent (MpiGalleryBlock) responsibility:
 *   - Create and mount MpiGroupCard instances
 *   - Manage selection state and mode
 *   - Handle card events (open, select, delete, etc.)
 *   - Call grid methods to update display
 *
 * Grid responsibility:
 *   - Render cards in justified layout
 *   - Handle size slider and info toggle
 *   - Manage grid scroll/overflow
 *   - Emit grid-level events (compare, download, etc.)
 */
```

---

## TESTING STRATEGY

### Test 1: Generate an Image
1. Open MpiAiSuite
2. Navigate to Gallery workspace
3. Select a model (e.g., Flux)
4. Enter a prompt
5. Click Generate
6. **VERIFY**: Generating card appears immediately with spinner
7. **VERIFY**: Latent preview updates appear
8. **VERIFY**: Card disappears when generation completes
9. **VERIFY**: New image appears in gallery

### Test 2: Multiple Generations
1. Start generation
2. Before it completes, start another generation
3. **VERIFY**: Previous generating card is cleared
4. **VERIFY**: New generating card appears
5. Complete both generations
6. **VERIFY**: Both images in gallery

### Test 3: Selection Mode
1. Generate an image
2. While generating card is visible, check a box on another card
3. **VERIFY**: Selection bar appears
4. **VERIFY**: Generating card remains visible above selection bar
5. Complete generation
6. **VERIFY**: New card joins the selected cards

### Test 4: Filter/Sort Changes
1. Start generation
2. While generating card is visible, change filter (images/videos)
3. **VERIFY**: Generating card remains visible
4. Change sort (newest/oldest)
5. **VERIFY**: Generating card remains visible
6. Complete generation

### Test 5: Size Slider
1. Start generation
2. While generating card is visible, adjust size slider
3. **VERIFY**: Generating card size changes appropriately
4. **VERIFY**: Grid re-renders correctly

### Test 6: Selection Bar Functions
1. Select multiple cards
2. Click Compare/Download/Delete buttons
3. **VERIFY**: Functionality still works correctly

### Test 7: Playwright Automated Test
Create a browser test that:
```javascript
// 1. Navigate to gallery
// 2. Start generation
// 3. Take screenshot immediately
// 4. Verify .mpi-group-card--generating is visible
// 5. Verify .mpi-group-card__spinner is visible
// 6. Verify opacity is 1 (not 0)
// 7. Wait for preview update
// 8. Verify .mpi-group-card__preview-img has a src
// 9. Complete generation and verify final card appears
```

---

## VERIFICATION CHECKLIST

Before marking complete:

- [ ] MpiGalleryGrid imports ONLY Primitives and utilities (no Compounds)
- [ ] MpiGalleryBlock imports MpiGroupCard
- [ ] Generating card is created and displayed BEFORE `setGroups()` is called
- [ ] Generating card is NOT included in `_rerenderJustified()` calculations
- [ ] Generating card survives filter/sort/size changes
- [ ] `updatePreview()` correctly updates the generating card
- [ ] Completion handler removes generating card and updates grid
- [ ] Error handler removes generating card and restores grid
- [ ] All 7 tests above pass
- [ ] No console errors
- [ ] No regressions in selection mode, comparison, download, delete
- [ ] Component-mounts.md is updated

---

## COMMON PITFALLS TO AVOID

1. **Don't mix generateCard with setGroups()**
   - ❌ `grid.el.setGroups([placeholderGroup, ...currentGroups])`
   - ✅ `grid.el.setGeneratingCard(wrapper, w, h); grid.el.setGroups(currentGroups)`

2. **Don't let _rerenderJustified recreate the generating card**
   - Generating slot should be OUTSIDE the main grid
   - Grid re-renders don't touch the generating slot

3. **Don't forget to clean up the generating card**
   - In `exec.onComplete` and `exec.onError`, call `grid.el.clearGeneratingCard()`
   - Otherwise, old card stays visible when new generation starts

4. **Don't override card dimensions in justified layout**
   - Wrapper dimensions set in `setGeneratingCard()` should NOT be overwritten
   - Keep explicit pixel widths/heights; don't let layout logic change them

5. **Don't attach event listeners twice**
   - If card is created in MpiGalleryBlock, don't attach listeners again in MpiGalleryGrid
   - Single source of truth for each listener

---

## SUCCESS CRITERIA

✅ **Generating card is visible** during generation with spinner
✅ **Latent previews update** in real-time
✅ **Card disappears** on completion without visual artifacts
✅ **Multiple generations** work correctly in sequence
✅ **MpiGalleryGrid is a Compound** (Primitive imports only)
✅ **No Block→Block imports**
✅ **Tests pass** (manual + Playwright)
✅ **No regressions** in existing gallery functionality

---

## ESTIMATED TIME

- Phase 1 (Prepare): 15 min
- Phase 2 (Refactor Block): 45 min
- Phase 3 (Refactor Grid): 60 min
- Phase 4 (Styles): 10 min
- Phase 5 (Docs): 10 min
- Testing: 30 min
- **Total: ~2.5-3 hours**

---

## NOTES FOR EXECUTOR

- This plan is detailed but can be executed incrementally
- Test after each phase if possible
- If blocked, refer back to the context sections
- The root cause analysis is in the CONTEXT & PROBLEM STATEMENT
- Ask questions in the conversation if anything is unclear
- Playwright browser testing is critical — visual inspection confirms the fix

---

**Created by**: Claude Code agent
**Context preserved**: ✓ Full architectural analysis included
**Ready to execute**: ✓ Yes
