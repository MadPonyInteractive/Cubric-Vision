# Fix: Generating Card Not Visible During Generation — HAND-OFF DOCUMENT

## Summary of the Problem

The "Generating..." card never appears visually during a generation. The grid shows a blank/empty space where the card should be. Once generation completes, the final card appears normally. No spinner, no latent previews are ever visible.

## Files Involved

| File | Role |
|------|------|
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | Orchestrator — owns generation lifecycle, creates placeholder group |
| `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js` | Display — renders groups via `_rerenderJustified`, creates cards via `_makeCard` |
| `js/components/Compounds/MpiGroupCard/MpiGroupCard.js` | Card primitive — handles `setGenerating`, `updatePreview`, spinner visibility |
| `js/components/Compounds/MpiGroupCard/MpiGroupCard.css` | CSS for generating state (`.mpi-group-card--generating`, `.mpi-group-card__preview--visible`) |

## What Was Changed

### 1. MpiGalleryBlock.js — `promptBox.on('run')` handler

**Before:** Used `addGeneratingCard()` / `finalizeCard()` / `removeGeneratingCard()` on the grid, which bypassed `setGroups` and the normal render pipeline.

**After:** Uses `setGroups()` exclusively — same pattern as `media:imported`:

```
run start  → grid.el.setGroups([placeholderGroup, ...currentGroups])
run success → grid.el.setGroups([group, ...currentGroups])
run error   → grid.el.setGroups(currentGroups)
run empty   → grid.el.setGroups(currentGroups)
```

The placeholder group now includes stored dimensions:
```js
const placeholderGroup = {
    id: tempId,
    type: cardType,
    name: 'Generating...',
    history: [],
    selectedIndex: 0,
    // Store output dimensions so MpiGalleryGrid can size the wrapper correctly
    width:  injectionParams.Width  || _cardWidth,
    height: injectionParams.Height || _cardWidth,
};
```

### 2. MpiGalleryGrid.js — Three methods removed + one auto-detection added

**Removed:**
- `addGeneratingCard(tempId, type, overrides)` — bypassed `setGroups`
- `removeGeneratingCard(tempId)` — errors now use `setGroups(currentGroups)`
- `finalizeCard(tempId, group)` — completion now uses `setGroups`

**Removed from template:** `.mpi-gallery-grid__generating-slot` div and its `const generatingSlot` variable.

**Added in `_makeCard`:**
```js
if (group.name === 'Generating...' && group.history?.length === 0) {
    const displayW = group.width  || _cardWidth;
    const displayH = group.height || _cardWidth;
    wrapper.style.width  = `${displayW}px`;
    wrapper.style.height = `${displayH}px`;
    card.el.setGenerating(null);
}
```

**Key:** This mirrors what the old `addGeneratingCard` did — set explicit pixel dimensions on the wrapper BEFORE calling `setGenerating(null)`.

## Root Cause Hypothesis (UNVERIFIED — Generation is too fast to inspect)

The debug log confirmed:
- Wrapper dimensions ARE set (1024x1024)
- `mpi-group-card--generating` class IS applied to the card
- `mpi-group-card__preview--visible` SHOULD be applied by `_applyGenerating(true)`

**However**, the card renders empty. The CSS rules for generating state are:

```css
/* MpiGroupCard.css */
.mpi-group-card__preview {
    position: absolute; inset: 0;
    opacity: 0;  /* ← starts invisible */
    pointer-events: none;
    transition: opacity 0.2s ease;
}
.mpi-group-card__preview--visible {
    opacity: 1;  /* ← setGenerating makes this visible */
    pointer-events: auto;
}
.mpi-group-card__spinner {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    width: 2rem; height: 2rem;
    border: 3px solid rgba(255,255,255,0.15);
    border-top-color: var(--neon-electric, #7df);
    border-radius: 50%;
    animation: mpi-card-spin 0.75s linear infinite;
}
.mpi-group-card--generating .mpi-group-card__thumb {
    visibility: hidden;  /* ← thumb hidden in generating state */
}
```

## Questions That Need Answers

1. **Is `mpi-group-card__preview--visible` actually being applied to the preview element?**
   - Debug showed `mpi-group-card--generating` on card classes
   - But did `preview.classList.toggle('mpi-group-card__preview--visible', true)` actually run?

2. **Is the `.mpi-group-card__preview` element found correctly?**
   - `MpiGroupCard.mount(wrapper, { group })` mounts into `wrapper`
   - `el` in MpiGroupCard's setup IS the wrapper (`.mpi-gallery-grid__card-wrap`)
   - `el.querySelector('.mpi-group-card__preview')` should find it
   - But maybe the selector is wrong relative to where the card mounts

3. **Is the card actually rendering in the DOM at all?**
   - The wrapper has 1024x1024px dimensions — does the DOM element actually have those?
   - Is there a `display: none` or `visibility: hidden` on a parent element?

4. **What does the actual DOM structure look like for the generating card?**
   - Does `.mpi-gallery-grid__card-wrap` exist?
   - Does `.mpi-group-card` exist inside it?
   - Does `.mpi-group-card__media` exist?
   - Does `.mpi-group-card__preview` exist?

## Debugging Plan for Fresh Session

1. **Add a way to pause generation** — e.g., add a `window.__pauseGeneration = true` flag that pauses before ComfyUI execution so you have time to inspect
2. **Or: Check immediately after run starts** using a longer debug log chain:
   ```js
   // In MpiGalleryBlock run handler, after setGroups:
   console.log('[DEBUG] grid.el._groups:', JSON.stringify(grid.el._groups?.map(g => ({id:g.id,name:g.name}))));
   ```
   ```js
   // In MpiGalleryGrid _rerenderJustified, after building a row:
   console.log('[DEBUG] row card count:', rowEl.children.length);
   rowEl.querySelectorAll('.mpi-group-card').forEach((c,i) => {
       console.log(`[DEBUG] card[${i}] classes:`, c.className, 'preview visible:', c.querySelector('.mpi-group-card__preview')?.classList.contains('mpi-group-card__preview--visible'), 'spinner display:', c.querySelector('.mpi-group-card__spinner')?.style.display);
   });
   ```
3. **Or: Use playwright to navigate, trigger generation, and immediately snapshot** before completion

## Original Plan File

`C:/AI/Mpi/MpiAiSuite/nimbalyst-local/plans/hidden-wandering-storm.md`

## Tags

`bug-fix`, `gallery`, `generating-card`, `unverified`
