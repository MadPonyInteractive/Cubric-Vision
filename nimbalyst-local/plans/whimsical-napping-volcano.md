# Fix: Generating Card Not Visible During Generation

## Context
When a user triggers a generation, a "Generating..." card should appear in the gallery immediately and update with latent previews. It only appears when generation completes.

This bug was introduced by commit `5108f04` ("implemented justified layout") which changed `addGeneratingCard` to prepend to a separate `.mpi-gallery-grid__generating-slot` div instead of the grid. The slot had no CSS, making it 0px tall.

## Root Cause (confirmed via Playwright)
Playwright confirmed:
- Old code (committed): `generatingSlot.prepend(wrapper)` — slot has no CSS rules → 0px height → card invisible
- My fix (`grid.prepend(wrapper)`): card IS prepended and IS visible in DOM at 288×288px
- BUT `finalizeCard` calls `grid.innerHTML = ''` (line 158 in `_rerenderJustified`) which WIPES the entire grid including the prepended card, then rebuilds rows from `_groups`. The generating card was never added to `_groups`, so it disappears from the rebuilt grid.

## Fix

**`finalizeCard` must NOT clear the grid.** The generating card is already showing in the grid. We only need to: remove the generating card DOM element, update `_groups`, and let the next natural `_rerenderJustified` call (e.g., from `state:changed` when `addGroupToProject` fires) rebuild the rows correctly.

**File:** `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`

Change `finalizeCard` from:
```javascript
el.finalizeCard = (tempId, group) => {
    const entry = _cardMap.get(tempId);
    if (!entry) return;
    entry.el.remove();
    _cardMap.delete(tempId);
    _groups = _groups.filter(g => g.id !== tempId);
    _groups.unshift(group);
    _rerenderJustified();
};
```

To:
```javascript
el.finalizeCard = (tempId, group) => {
    const entry = _cardMap.get(tempId);
    if (!entry) return;
    entry.el.remove();
    _cardMap.delete(tempId);
    // Remove temp group from _groups (if it was ever added), add final group
    _groups = _groups.filter(g => g.id !== tempId);
    _groups.unshift(group);
    // Do NOT call _rerenderJustified() — the generating card was prepended to
    // grid directly (not in _groups) and is already showing at the correct position.
    // The state:changed event from addGroupToProject will trigger a natural
    // rebuild on the next interaction.
};
```

**Note:** `addGeneratingCard` in the current working code already prepends to `grid` with explicit dimensions (288×288 from `_cardWidth`):
```javascript
grid.prepend(wrapper); // inside .mpi-gallery-grid__grid — new generations at top
wrapper.style.width  = `${displayW}px`;
wrapper.style.height = `${displayH}px`;
```

The caller in `MpiGalleryBlock.js` already passes dimensions from `injectionParams`.

## Verification
1. Open gallery workspace
2. Start a generation — "Generating..." card appears immediately inside the grid (in first row)
3. Latent preview blob URLs update the card during generation
4. When generation completes, the generating card is removed, final card remains visible in grid
5. Subsequent generations: repeat — each new generating card prepends to grid and replaces correctly
