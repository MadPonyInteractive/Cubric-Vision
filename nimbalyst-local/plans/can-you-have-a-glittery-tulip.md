# Plan: Fix Component/Event Rules Discrepancies

## Context
Audit revealed rules/docs don't match actual code. AI following rules would miss events, generate incomplete handlers. Need corrections for accuracy.

## Discrepancies to Fix

### 1. `MpiGalleryGrid` missing events (MEDIUM)
Add to `components.md` MpiGalleryGrid EMITS section:
- `favourite { group, favourite: boolean }`
- `reuse { positive, negative }`
- `selection-start {}`
- `selection-end {}`
- `select { group, selected: boolean }`

### 2. `MpiPromptBox` missing dual-channel media event (MEDIUM)
Add to `components.md` MpiPromptBox EMITS section:
- `media-imported { url, filename, mediaType, source: 'file' }` — instance event
Also document `media:imported` on Events bus (dual emission pattern)

### 3. `MpiModelsModal` `download:failed` incomplete (LOW)
Remove `ui:error` from `components.md` — code doesn't emit it, only calls `awaitReSync()`.

### 4. `docs/events.md` `tool:running` missing `type` field (LOW)
Add `{ tool: string, type: string }` to `tool:running` row in events table.

### 5. `MpiToolbar` save/delete conditional mounting (LOW)
Note in `components.md` that save/delete EMITS only appear when `props.comps` is falsy.

### 6. `models:checked` and `models:all-installed` undocumented (LOW)
Either add to MpiGroupHistoryBlock LISTENS section in `components.md`, or note in `docs/events.md` as cross-component events.

### 7. Duplicate MpiGalleryBlock workspace description (LOW)
Remove duplicate section in `components.md` "Workspaces (cross-cutting)" — lines 294-300 repeat earlier description.

## Files to Modify
- `js/components/factory.js` — item A (HIGH)
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` — items B, C, D, E (HIGH/MEDIUM)
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — items F, G, H (HIGH)
- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` — items I, J (HIGH/MEDIUM)
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — item K (reuse utility)
- `.claude/rules/components.md` — items 1, 2, 3, 5, 6, 7
- `docs/events.md` — item 4

## Code Fixes (Priority Order)

### A. `js/components/factory.js` — `destroy` must call `el.destroy` (HIGH)
**Lines 115-120:** Factory destroy doesn't call `el.destroy` — all component cleanup code is dead.
Fix: invoke `el.destroy()` if it exists before DOM removal.

### B. `MpiModelsModal.js` — Use `_unsubs` array consistently (HIGH)
Lines 83, 460-463: Already has `_unsubs` but factory won't call destroy. After fix A, this will work — but also add missing subscriptions to `_unsubs`.

### C. `MpiModelsModal.js` — `download:started` handler duplicates `_computeModelStats` (MEDIUM)
Lines 387-395: Inline code re-implements `_computeModelStats`. Should call the function.

### D. `MpiModelsModal.js` — Near-duplicate card rendering blocks (MEDIUM)
Lines 175-261 (installed) and 278-348 (uninstalled) share duplicated logic. Extract `_renderCard(model, isInstalled)` helper.

### E. `MpiModelsModal.js` — Dead `try/catch` in destroy (LOW)
Lines 161-163: Unnecessary try/catch around type-checked destroy.

### F. `MpiPromptBox.js` — Replace MutationObserver cleanup with `_unsubs` pattern (HIGH)
Lines 369-376: MutationObserver polling entire body subtree is expensive. Replace with standard `_unsubs` array + destroy call.

### G. `MpiPromptBox.js` — Dead props `LeftA` / `rightA` (LOW)
Lines 525-526: Unused, undocumented props. Remove or document.

### H. `MpiPromptBox.js` — `media-change` not in MpiEventMap (LOW)
Component emits `media-change` but it's not documented.

### I. `MpiGalleryGrid.js` — Add `el.destroy` with cleanup (HIGH)
Lines 430-444: No cleanup defined. Add `_unsubs` array and `el.destroy` method.

### J. `MpiGalleryGrid.js` — O(n²) lookup in hot path (MEDIUM)
Line 371: `allGroups.find(g => g.id === id)` inside render loop. Build `Map` before loop.

### K. `MpiPromptBox.js` — Use existing `getExtension` / `isImageFile` utilities (LOW)
Lines 183, 270-273: Inline logic duplicates `js/utils/file.js` utilities.

## Documentation Fixes (After Code Fixes)

### 1. `MpiGalleryGrid` missing events (MEDIUM)
### 2. `MpiPromptBox` missing `media-imported` dual-channel event (MEDIUM)
### 3. `MpiModelsModal` `download:failed` emits no `ui:error` (LOW)
### 4. `docs/events.md` `tool:running` missing `type` field (LOW)
### 5. `MpiToolbar` save/delete conditional mounting (LOW)
### 6. `models:checked` / `models:all-installed` undocumented (LOW)
### 7. Duplicate MpiGalleryBlock description (LOW)

## Verification
1. Read modified sections
2. Confirm factory now calls `el.destroy`
3. Confirm all components with `_unsubs` properly register all subscriptions
4. Confirm all listed events match actual code emitters