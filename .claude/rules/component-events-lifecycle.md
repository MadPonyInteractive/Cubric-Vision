## Sub-Agent Briefing
> Use this file when working with generation lifecycle: Active Generation Registry, commandExecutor, StatusBar.
> Per-component event wiring lives in `component-events-primitives.md`, `component-events-organisms.md`, `component-events-blocks.md`.

---

## Active Generation Registry (`js/services/activeGenerations.js`)

Session-scoped singleton. Survives navigation. Keyed by uuid; multi-entry (batch-ready).

**Purpose:** keeps exec handles, preview blob URLs, and placeholder group descriptors alive across page navigation so blocks can rehydrate on mount.

**Events emitted (via Events bus):**
| Event | Payload | When |
|---|---|---|
| `generation:started` | `{ id, scope, groupId, tempId, placeholderGroup, extraTempIds, extraPlaceholders, replaceItemId }` | `activeGenerations.start()` called |
| `generation:preview` | `{ id, url }` | `activeGenerations.setPreview()` — preview broadcast to all N placeholders (same latent, ComfyUI emits one) |
| `generation:complete` | `{ id, item, group, tempId?, extraTempIds? }` | `generationService` emits after project mutation + `end()` |
| `generation:error` | `{ id, tempId?, extraTempIds? }` | `generationService` emits after `end()` |
| `generation:cancelled` | `{ id, tempId?, extraTempIds? }` | `generationService` or `activeGenerations.cancel()` emits after `end()` |

**API:** `start({ scope, groupId, tempId, operation, modelId, placeholderGroup, extraTempIds, extraPlaceholders, exec })` → `{ id }` · `get(id)` · `list()` · `listFor(scope, groupId|null)` · `setPreview(id, url)` · `setPromptId(id, promptId)` · `end(id, { revokePreview })` · `cancel(id)` · `cancelAll()`

**Batch semantics:** `extraTempIds` + `extraPlaceholders` describe N-1 sibling placeholder cards for a batch > 1. Gallery renders all N up front, broadcasts preview to all, removes all on complete/error/cancelled, then `setGroups()` with the N real groups already in `state.currentProject.itemGroups` (generationService calls `addGroup` N times before emit).

**Scope values:** `'gallery'` | `'groupHistory'`

**Rehydration pattern (on block mount):**
1. Call `activeGenerations.listFor(scope, groupId)` filtered by `status === 'running'`
2. Seed local `_myGenIds` Set
3. Apply cached preview via `placeholderGroup.latestPreviewUrl` (already set on placeholder; grid reads it in `setGenerating()`)
4. Subscribe to `generation:*` events filtered by `_myGenIds`; unsubscribe in `destroy()` — **do NOT cancel exec on destroy**

---

## Generation Lifecycle (commandExecutor & StatusBar)

**commandExecutor.js**
- Analyzes workflow JSON to detect loader nodes (CheckpointLoaderSimple, UNETLoader, LoraLoaderModelOnly, etc. by class_type)
- Emits `tool:loading-model` when a loader node starts executing (VRAM load phase)
- Emits `tool:sampling-start` only when sampling/generation actually begins. Do not treat node execution alone as sampling; some sampler/upscale nodes report a model-initialization phase first.
- For ComfyUI terminal phases, `/comfy/events/stream` bridges `Model Initializing ...` to `tool:loading-model` and `Model Initialization complete!` to `tool:sampling-start`.
- `tool:loading-model` carries `{ tool: 'groupHistory' }`. `tool:sampling-start` carries `{ tool: 'groupHistory', operation: string }` — `operation` is the commandRegistry key (e.g. `upscale`, `detail`, `t2v_ms`) so StatusBar can resolve a per-op verb via `getCommandProgressLabel(operation)`.

**StatusBar (js/shell/statusBar.js)**
- Listens to `tool:running` → prepares active state without starting elapsed timer
- Listens to `tool:loading-model` → calls `updateLabel('Loading model...')`
- Listens to `tool:sampling-start` → calls `updateLabel(getCommandProgressLabel(operation))` (e.g. `Generating`, `Upscaling`, `Detailing`) and starts elapsed timer. New ops add a `progressLabel` field in `commandRegistry.js` if the default `'Generating'` does not fit.
- Listens to `tool:cancelled` → calls `cancel()`
- Listens to `tool:idle` → calls `complete('Generation finished')` (fires success toast) for all groupHistory ops, including `resize` / `resizeVideo`. The earlier resize-specific silent gate was removed; the block emits no bespoke toast and StatusBar owns the only completion signal.
- Listens to `state.generationQueueCount` → appends pending Cue depth to the active label only, e.g. `GENERATING (2 queued)`

**Pattern notes:**
- Blocks emit `tool:running` at generation start (in promptBox 'run' handler)
- Cue mode progress is per active generation, not aggregate across the whole queue. `generationService` defers the next Cue dispatch until the current lifecycle has emitted `tool:idle`; StatusBar ignores stale completion timers if a new active run starts.
- commandExecutor emits `tool:loading-model` / `tool:sampling-start` based on WS messages plus backend ComfyUI phase output for model-initialization-sensitive nodes
- StatusBar owns all progress UI logic; blocks don't call StatusBar methods directly (except `progress.update()` for KSampler progress)
- Generation timing saved to item sidecar starts at `tool:sampling-start`; backend receives `generationMs` field in save-generation POST body
