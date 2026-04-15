# Fix: Generating Card Not Visible During or After Generation

## Context

The "Generating..." card never appears. User confirmed: "grid unchanged" — no visible card, no spinner. The grid works for `media:imported` via `setGroups`, but the generation flow uses a separate `addGeneratingCard`/`finalizeCard` API that bypasses the grid's normal render cycle.

**MpiGalleryBlock** is the orchestrator — owns all business logic, calls `setGroups` for cards.
**MpiGalleryGrid** is a pure display component — renders whatever groups it receives via `setGroups()`.

The fix belongs in MpiGalleryBlock, mirroring exactly how `media:imported` works (lines 241-248).

## Root Cause

1. `promptBox.on('run')` in MpiGalleryBlock uses `addGeneratingCard` which prepends directly to the grid DOM, bypassing `_groups` and `_rerenderJustified`. The 16ms debounce wipes it before paint.
2. `finalizeCard` updates `_groups` but doesn't call `_rerenderJustified`, so the grid never rebuilds.
3. Both methods should use `setGroups` — the same pattern that works for `media:imported`.

## Fix Plan

**Files:** `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` and `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`

### MpiGalleryBlock changes

**`promptBox.on('run')`** — store current groups and use `setGroups` throughout the generation lifecycle:

```javascript
promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
    if (!activeModel) return;

    const tempId   = crypto.randomUUID();
    const cardType = activeModel.mediaType;

    // Capture current groups BEFORE adding the generating card
    const currentGroups = state.currentProject?.itemGroups || [];

    // Create placeholder group for generating state
    const placeholderGroup = {
        id: tempId,
        type: cardType,
        name: 'Generating...',
        history: [],
        selectedIndex: 0,
    };

    // Show generating card via setGroups — same pattern as media:imported
    grid.el.setGroups([placeholderGroup, ...currentGroups]);
    StatusBar.progress.start('Generating...');

    _activeExec = runCommand({ ... });
    const exec = _activeExec;

    exec.onPreview  = (url) => grid.el.updatePreview(tempId, url);
    exec.onProgress = (value) => StatusBar.progress.update(value);

    exec.onComplete = async (urls) => {
        _activeExec = null;
        PromptBoxService.component?.setGenerating(false);

        if (!urls.length) {
            StatusBar.progress.cancel();
            // Remove generating card: re-render with original groups
            grid.el.setGroups(currentGroups);
            return;
        }

        // ... save-generation fetch (unchanged) ...

        const item = createImageItem({ filePath, modelId: activeModel.id, operation, prompt: positive, negativePrompt: negative });
        let group = createItemGroup(cardType, { name: cardName });
        group = appendToHistory(group, item);

        if (state.currentProject) {
            state.currentProject = addGroupToProject(state.currentProject, group);
            _persistGroups();
        }

        StatusBar.progress.complete('Image generated!');
        // Replace generating card with final card: re-render with final group prepended
        grid.el.setGroups([group, ...currentGroups]);
    };

    exec.onError = (err) => {
        _activeExec = null;
        clientLogger.error('MpiGalleryBlock', 'Generation error:', err);
        PromptBoxService.component?.setGenerating(false);
        StatusBar.progress.cancel();
        // Remove generating card: re-render with original groups
        grid.el.setGroups(currentGroups);
    };
});
```

**Note:** `exec.onPreview` and `exec.onProgress` remain as-is — they update the existing generating card directly without needing a re-render.

### MpiGalleryGrid cleanup

Remove the three methods that become unnecessary:

- `el.addGeneratingCard` — no longer needed
- `el.finalizeCard` — no longer needed
- `el.removeGeneratingCard` — no longer needed (errors use `setGroups(currentGroups)` instead)

The `setGroups` method already handles everything correctly via `_rerenderJustified()`.

Also remove the `.mpi-gallery-grid__generating-slot` div from the template (dead code from the old approach) and the `generatingSlot` variable.

## Why This Works

| Event | Old behavior | New behavior |
|---|---|---|
| `run` starts | `addGeneratingCard` prepends to DOM, wiped by debounce | `setGroups([placeholder, ...currentGroups])` — grid rebuilds via `_rerenderJustified` immediately, card inside row |
| `onPreview` | Updates existing card | Unchanged — works the same |
| `run` completes | `finalizeCard` updates `_groups`, no re-render | `setGroups([finalGroup, ...currentGroups])` — grid rebuilds immediately |
| `run` errors | `removeGeneratingCard` removes from DOM | `setGroups(currentGroups)` — grid rebuilds without the placeholder |
| Navigate away/back | Final card persists (remount) | Same — card is in `state.currentProject.itemGroups` |

## Verification

1. Open gallery with existing cards
2. Start a t2i generation — "Generating..." card with spinner appears immediately in grid rows
3. Latent previews update the card (spinner → preview image)
4. Generation completes — generating card replaced by final card in-place
5. Generation error/cancel — generating card removed, grid returns to previous state
6. Navigate away and back — final card still present
