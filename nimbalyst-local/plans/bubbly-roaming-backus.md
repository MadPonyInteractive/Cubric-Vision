# Plan: Dead Code Cleanup in MpiGalleryBlock.js

## Context

The previous session fixed the generating card visibility bug by creating the card in `MpiGalleryBlock` and routing it through a new isolated `setGeneratingCard()` API on `MpiGalleryGrid`. The fix works.

However, the session also added a half-finished refactor (moving card creation and selection management to `MpiGalleryBlock`) that was abandoned before completion. This dead code was committed alongside the fix. It needs to be removed before it causes confusion or runtime errors.

**The problem in detail:**
- `_makeCard()`, `_enterSelectionMode()`, `_exitSelectionMode()`, `_getSelectedGroups()` — declared but never called
- `_cardMap`, `_selectedIds`, `_selectionMode`, `_selectionBar` — declared but never read or written
- `_exitSelectionMode()` references `selectionBar` (undefined in this file) — latent `ReferenceError` if the dead code is ever wired up
- `MpiSelectionBar` and `getAvailableCommands` — imported but never used

## File to Modify

- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`

## Steps

### Step 1: Remove unused imports

Remove these two import lines:
```js
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
import { getAvailableCommands } from '../../../data/commandRegistry.js';
```

Keep `ce` — it is used in the `promptBox.on('run')` handler to create the generating card wrapper.

### Step 2: Remove the dead "Card and Selection Management" block

Remove the entire section added between the `grid.on('favourite', ...)` handler and the `// ── Download` section. Specifically remove:

- The `// ── Card and Selection Management` comment header
- `const _cardMap = new Map();`
- `const _selectedIds = new Set();`
- `let _selectionMode = false;`
- The selection bar comment and `let _selectionBar = null;`
- `function _getSelectedGroups()` (entire function)
- `function _enterSelectionMode()` (entire function)
- `function _exitSelectionMode()` (entire function)
- `function _makeCard(group)` (entire function, ~45 lines)

**Keep:**
- `// Generating card state` comment
- `let _generatingCardId = null;`
- `let _generatingCardElement = null;`

These two are actively used in the `promptBox.on('run')` handler.

### Step 3: Verify

Search for these identifiers — each must appear **0 times** after cleanup:
- `MpiSelectionBar`
- `getAvailableCommands`
- `_cardMap`
- `_selectedIds`
- `_selectionMode`
- `_selectionBar`
- `_getSelectedGroups`
- `_enterSelectionMode`
- `_exitSelectionMode`
- `_makeCard`

Search for these — each must still appear:
- `ce` (in the generating card wrapper creation)
- `_generatingCardId`
- `_generatingCardElement`
- `MpiGroupCard`

## Verification

Load the app, go to the Gallery workspace, generate an image. Confirm:
- Generating card appears with spinner while generating
- Latent previews update in real-time
- Card clears on completion, final card appears in grid
- Selection mode (clicking checkbox on a gallery card) still works
