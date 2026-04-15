# HANDOFF: Gallery Grid Refactor + Generating Card Fix

**Date**: 2026-04-15
**For**: Next agent/window execution
**Status**: Ready to hand off

---

## QUICK SUMMARY

**Problem**: Generating card disappears during image generation (bug blocking the app)

**Solution**:
1. Refactor MpiGalleryGrid from Block → Compound (improves architecture)
2. Isolate generating card from justified layout flow (fixes visibility)
3. Move MpiGroupCard mounting to MpiGalleryBlock (cleaner separation)

**Outcome**: App unblocked, clean architecture, reusable for future popup gallery

---

## FILES & LOCATION

**Executable Plan**:
```
C:\AI\Mpi\MpiAiSuite\nimbalyst-local\plans\2026-04-15-gallery-grid-refactor-and-generating-card-fix.md
```

**This Handoff**:
```
C:\AI\Mpi\MpiAiSuite\nimbalyst-local\plans\HANDOFF-gallery-grid-refactor.md
```

---

## CRITICAL REVIEW NOTES (Read Before Starting)

The plan is ~90% complete and executable, but has **3 clarification points** that the next agent should resolve:

### ⚠️ Issue 1: MpiSelectionBar Ownership

**Current State**: Plan says MpiSelectionBar should be imported by both MpiGalleryBlock and MpiGroupHistoryBlock independently (Decision 1).

**Problem**: Phase 3 removes MpiSelectionBar from MpiGalleryGrid but doesn't explicitly add it to MpiGalleryBlock.

**What to do**: Before Phase 2, decide:
- Should MpiGalleryBlock import AND mount MpiSelectionBar?
- Or does MpiGalleryBlock receive it as a passed-in element?

**Recommended approach**: MpiGalleryBlock should import and mount it (keeps ownership clear).

**Action**: Add to Phase 2, Step 2.1:
```javascript
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
```

Then in setup, mount it:
```javascript
const selectionBar = MpiSelectionBar.mount(el.querySelector('#selection-bar-slot'), { count: 0 });
```

---

### ⚠️ Issue 2: Card Event Listeners Location

**Current State**: Step 2.2 says event listeners need to be moved from MpiGalleryGrid → MpiGalleryBlock, but doesn't specify HOW.

**Problem**: Should they be:
- In a helper function like `_makeCard()` that stays in MpiGalleryBlock?
- Inline in the mounting code?
- In a separate listener-attachment function?

**Recommended approach**: Keep a `_makeCard()` helper in MpiGalleryBlock that creates wrapper + mounts card + attaches listeners. This matches current structure.

**Action**: When extracting `_makeCard()` from MpiGalleryGrid, keep it intact. Don't strip out the event listener attachment.

---

### ⚠️ Issue 3: updatePreview() Helper Variable

**Current State**: Step 3.7 references `_currentGeneratingId` variable that doesn't exist:
```javascript
if (card && card.el && tempId === _currentGeneratingId) {
```

**Problem**: This variable needs to be defined somewhere.

**Recommended approach**: This should be a state variable in MpiGalleryBlock (not MpiGalleryGrid).

**Action**: In MpiGalleryBlock, add:
```javascript
let _generatingCardId = null;  // Track which card is currently generating

// In updatePreview handler:
el.updatePreview = (tempId, previewUrl) => {
    if (tempId === _generatingCardId) {
        _generatingCardElement?.el.updatePreview(previewUrl);
    }
    _cardMap.get(tempId)?.card.el.updatePreview(previewUrl);
};
```

---

## EXECUTION CHECKLIST

Before starting each phase, reference the plan file:

- [ ] **Phase 1** (15 min): Read files, understand data flow
- [ ] **Phase 2** (45 min): Refactor MpiGalleryBlock
  - [ ] Resolve Issue 1: MpiSelectionBar import
  - [ ] Resolve Issue 2: Card listener attachment strategy
- [ ] **Phase 3** (60 min): Refactor MpiGalleryGrid → Compound
  - [ ] Resolve Issue 3: `_generatingCardId` tracking
- [ ] **Phase 4** (10 min): Add CSS for generating slot
- [ ] **Phase 5** (10 min): Update documentation
- [ ] **Testing** (30 min): Run 7 manual tests + Playwright
- [ ] **Verification**: Check all items in verification checklist

---

## KEY CONTEXT (Copy-Paste Ready)

### The Bug
Justified layout (commit 5108f04) broke the generating card by:
- Processing it through `_rerenderJustified()`
- Overwriting its dimensions with justified layout calculations
- Fixing row heights to 200px
- Result: Card renders invisible/empty

### The Root Cause
Generating card should NOT go through normal grid layout. It needs:
- Separate display area (not part of justified layout rows)
- Explicit dimensions set by MpiGalleryBlock
- `updatePreview()` to update in-place
- Removal without re-rendering the entire grid

### The Architecture Fix
```
Before:  MpiGalleryBlock → MpiGalleryGrid (Block imports Block) ❌
After:   MpiGalleryBlock → MpiGalleryGrid (Block imports Compound) ✅
```

MpiGalleryGrid becomes a Compound by:
- Removing MpiGroupCard import → parent creates cards
- Removing MpiSelectionBar import → parent owns selection bar
- Keeping only Primitives (MpiProgressBar, MpiButton)

---

## IMPORTANT: USE THE PLAN FILE

The detailed plan has:
- 5 phases with step-by-step instructions
- Code snippets ready to use
- 7 concrete test cases
- Verification checklist
- Common pitfalls to avoid

**Don't reinvent** — follow the plan exactly. If something is unclear, reference this handoff first, then ask for clarification.

---

## WHEN TO STOP & ASK

Stop execution if:
- ❌ A step doesn't make sense after re-reading it
- ❌ A test fails (don't skip, investigate)
- ❌ A file structure doesn't match expectations (the codebase may have changed)
- ❌ Any of the 3 issues above need different resolution

**Ask before guessing** — this is critical infrastructure.

---

## SUCCESS CRITERIA

When done, you should see:

✅ Generating card visible with spinner during generation
✅ Latent previews update in real-time
✅ Card disappears on completion
✅ All 7 tests pass
✅ No console errors
✅ MpiGalleryGrid imports only Primitives
✅ No Block→Block imports in architecture

---

## FILES MODIFIED

- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` (major changes)
- `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js` (major refactor)
- `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.css` (add generating slot styles)
- `.claude/rules/component-mounts.md` (documentation update)

**No changes to**:
- MpiGroupCard.js (card logic is fine)
- MpiSelectionBar.js (stays as Compound)

---

## NEXT STEPS FOR NEXT AGENT

1. **Read this handoff** (you're doing it)
2. **Read the full plan** (linked above)
3. **Start Phase 1** — review current code
4. **Resolve the 3 issues** (follow recommendations above)
5. **Execute Phases 2-5** step-by-step
6. **Run tests** — verify everything works
7. **Commit changes** with clear message about what was refactored and why

---

**Ready to hand off to another agent/window.**

Created: 2026-04-15
Status: Ready for execution
