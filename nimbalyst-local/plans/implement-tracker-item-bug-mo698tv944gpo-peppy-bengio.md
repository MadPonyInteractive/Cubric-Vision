# Fix: Generation preview + placeholder lost on navigation

Tracker: `bug_mo698tv944gpol`

## Context

Starting a generation on the GroupHistory page and navigating to Gallery (or reverse) causes the latent preview and placeholder card to disappear until the generation completes. The ComfyUI backend keeps running, but the UI has no way to rehydrate because all generation state lives in component-local closures that are destroyed on navigation.

The fix introduces a session-scoped `activeGenerations` registry. It owns the exec handle, the most recent preview blob URL, and the placeholder group shape. Blocks subscribe on mount (rehydrating from the cached preview) and unsubscribe on destroy without cancelling the exec. Persistency is session-only — no disk storage.

## Root cause (summary)

- `generationService.startGeneration()` returns an `exec` stored in component-local `_activeExec` / `_activeGen`.
- Preview URL lives only inside `MpiCanvasViewer` scope (blob URL).
- Gallery placeholder group (`isGenerating: true`) is held in the grid component's local array, not anywhere global.
- Navigation calls `instance.destroy()` → closures released → exec keeps running but emits into the void.

## Design

New singleton service `js/services/activeGenerations.js` tracks active generations in a Map keyed by `id` — supports 1..N concurrent entries so future batch generation (up to 4 parallel) works without a second refactor. `generationService` routes all exec callbacks through it. Blocks subscribe to registry events and query on mount for any matching active entries to rehydrate.

**Batch-readiness note:** the registry is multi-entry from day one. Today only one generation runs at a time because `ComfyUIController.runWorkflow` is serialized upstream — that constraint lives in the backend/executor layer, not here. When batch generation lands, it will add a queue/parallel-exec layer in `comfyController` / `commandExecutor`; the registry shape, events, and block rehydration code stay identical. Each parallel exec gets its own registry entry with its own `tempId` / `groupId` and its own blob URL cache.

Registry entry shape:
```js
{
  id,                  // uuid
  scope,               // 'gallery' | 'groupHistory'
  groupId,             // for groupHistory (null for gallery)
  tempId,              // for gallery placeholder (null for groupHistory)
  operation, modelId,
  status,              // 'running' | 'complete' | 'error' | 'cancelled'
  latestPreviewUrl,    // last blob URL (cached so late-arriving blocks show it)
  placeholderGroup,    // gallery only — the placeholder group descriptor
  exec,                // exec handle from runCommand
}
```

Registry Events (via `js/events.js`):
- `generation:started` `{ id, scope, groupId, tempId, placeholderGroup }`
- `generation:preview` `{ id, url }`
- `generation:progress` `{ id, value }`
- `generation:complete` `{ id, item, group }`
- `generation:error` `{ id }`
- `generation:cancelled` `{ id }`

Public API (multi-entry, batch-ready):
- `start({ scope, groupId, tempId, operation, modelId, placeholderGroup, exec })` → `{ id }`
- `get(id)` → entry or null
- `list()` → `Array<Entry>` (all current entries)
- `listFor(scope, groupId|null)` → `Array<Entry>` (filtered; gallery ignores groupId)
- `setPreview(id, url)`, `setStatus(id, status)`
- `end(id, { revokePreview: bool })`
- `cancel(id)` / `cancelAll()` — future batch convenience

Rationale: keeps transient generation UI state out of `state.currentProject` (which is persistent) and off component closures.

## Decisions

- **Rehydrated preview UX:** show last cached preview immediately on mount; next frame replaces it. Cached blob held until generation ends.
- **Placeholder source:** rehydrate from registry (no changes to `state.currentProject`).
- **Cancel on navigation:** no. Exec continues; final item still lands via existing `generationService.onComplete` → `addGroup`/`updateGroup`.

## Files to modify

### NEW — `js/services/activeGenerations.js`
Singleton module. Internal `Map<id, Entry>` holds all active generations. Emits Events bus events listed above. `end()` revokes preview blob URL only if caller requests (default: yes) — callers that handed the URL to a completed canvas should pass `revokePreview: false`. No hard cap on entries; callers (future batch coordinator) enforce the 4-concurrent policy when they submit execs.

### `js/services/generationService.js` (lines 49–148)
- Import `activeGenerations` and pass `scope` via new `opts` field: `opts.scope`, `opts.groupId`, `opts.tempId`, `opts.placeholderGroup`.
- After creating `exec` (line 57), call `activeGenerations.start({ scope, groupId, tempId, operation, modelId, placeholderGroup, exec })` → capture `id`.
- `exec.onPreview` → `activeGenerations.setPreview(id, url)` which stores + emits `generation:preview`. Still call caller's `callbacks.onPreview?.(url)` for direct first-hop delivery.
- `exec.onComplete` flow (lines 71–139): after existing `addGroup`/`updateGroup`, call `activeGenerations.end(id)` and emit `generation:complete` with `{ item, group }`.
- `exec.onError` (line 141): `activeGenerations.end(id)` + emit `generation:error`.
- Keep existing `callbacks.*` so current direct listeners still work; registry events are additive.

### `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
- In `_runGenerate` (line 276+): pass `{ scope: 'groupHistory', groupId: _group.id }` to `startGeneration` in the `opts` object (currently `{ existingGroup: _group }` — extend).
- Track the set of entry IDs this block cares about: `const _myGenIds = new Set()`. Populate from `activeGenerations.listFor('groupHistory', _group.id)` on mount and on each `generation:started` event whose entry matches `_group.id`.
- After mount (after line 174), add rehydration:
  - For each entry in `activeGenerations.listFor('groupHistory', _group.id)` with `status === 'running'`:
    - `_myGenIds.add(entry.id)`
    - `canvasViewer.el.setGenerating(true)`
    - If `entry.latestPreviewUrl`, call the same preview handler used in `onPreview` (loadEntry with preview URL).
- Subscribe to registry events (push to `_unsubs`):
  - `Events.on('generation:started', ({ id, scope, groupId }) => { if (scope==='groupHistory' && groupId===_group.id) { _myGenIds.add(id); /* reflect running UI */ } })`
  - `Events.on('generation:preview', ({ id, url }) => { if (_myGenIds.has(id)) /* same as current onPreview */ })`
  - `Events.on('generation:complete', ({ id, item, group }) => { if (_myGenIds.has(id)) { _myGenIds.delete(id); /* same as current onComplete */ } })`
  - Same filter for `generation:error` / `generation:cancelled`.
- `destroy` (line 501): already unsubs via `_unsubs`. Do NOT cancel exec.

### `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` (lines 318–365)
- In `pb.on('run')`: build `placeholderGroup` (unchanged), then pass `{ scope: 'gallery', tempId, placeholderGroup }` through `startGeneration` opts.
- Track `_myGenIds = new Set()` — all gallery-scoped entry IDs. Populate from `activeGenerations.listFor('gallery', null)` on mount and on `generation:started` with `scope==='gallery'`.
- After mount, add rehydration (before `grid.el.setGroups([...])` initial render):
  - `const runningGallery = activeGenerations.listFor('gallery', null).filter(e => e.status === 'running');`
  - Prepend **all** `runningGallery.map(e => e.placeholderGroup)` to the groups passed to `grid.el.setGroups(...)` (order newest-first is fine — iteration order of the registry Map).
  - For each entry with `latestPreviewUrl`: call `grid.el.updatePreview(entry.tempId, entry.latestPreviewUrl)` after the initial `setGroups`.
  - Seed `_myGenIds` with each entry's id.
- Subscribe to registry events; filter by `_myGenIds.has(id)`. On `generation:started` with `scope==='gallery'`, add placeholder card via `grid.el.setGroups([entry.placeholderGroup, ...currentGroups])` and add id to `_myGenIds`. Preview/complete/error mirror current inline callbacks, but keyed by the event's `id` → look up `entry.tempId`.
- On `pb.on('cancel')`: without a way to know *which* generation the user means, for now cancel the most-recently-started gallery entry: `const last = activeGenerations.listFor('gallery', null).at(-1); last?.exec.cancel(); activeGenerations.end(last.id);`. When batch UI lands, cancel-per-card replaces this.
- `destroy`: unsubs only; no cancel.

## Verification

1. Start app; open a project with at least one group.
2. **Case A:** Go to GroupHistory → click Run → while preview is updating, navigate to Gallery → immediately navigate back to GroupHistory. Expected: canvas shows the last cached preview right away; next frame updates as ComfyUI emits it; generation completes and item appends to history list.
3. **Case B:** Go to Gallery → click Run (placeholder card appears with "Generating...") → navigate to GroupHistory → back to Gallery. Expected: placeholder still at head of grid with last cached preview; completion replaces placeholder with final card.
4. **Cross-page completion:** start on GroupHistory, navigate to Gallery before completion, wait for completion while on Gallery. Expected: `state.currentProject.itemGroups` updates via existing `updateGroup`; no double-append. On returning to GroupHistory, `_group` already has the new item.
5. **Cancel mid-navigation:** start, navigate, cancel via PromptBox on new page (if visible) — verify registry clears and no ghost placeholder remains.
6. **Error:** force a workflow error (e.g., uninstall required model), start, navigate, return — placeholder should clear, no stale preview.

## Files (absolute paths)

- NEW: `C:\AI\Mpi\MpiAiSuite\js\services\activeGenerations.js`
- `C:\AI\Mpi\MpiAiSuite\js\services\generationService.js`
- `C:\AI\Mpi\MpiAiSuite\js\components\Blocks\MpiGroupHistoryBlock\MpiGroupHistoryBlock.js`
- `C:\AI\Mpi\MpiAiSuite\js\components\Blocks\MpiGalleryBlock\MpiGalleryBlock.js`

## Completion

Mark tracker `bug_mo698tv944gpol` as `done` via `tracker_update` after manual verification of Cases A and B.
