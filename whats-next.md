```xml
<original_task>
Create a comprehensive implementation plan for the Download Manager feature (the highest priority backlog item). The spec is in `docs/superpowers/specs/2026-04-12-download-manager-design.md`. The plan must conform to the component system architecture (ComponentFactory, MpiProgressBar, Events bus), use existing patterns, and eliminate dead code.
</original_task>

<work_completed>

## Plans Created

**Primary plan (updated):** `docs/superpowers/plans/2026-04-12-download-manager.md`
- Covers Phase 1 (SHA256 data), Phase 2 (backend ResumableDownloader + endpoints), Phase 3 (frontend state + downloadService), Phase 4 (MpiInstalledDisplay + MpiModelsModal), Phase 5 (comfyNeedsRestart wiring), Phase 6 (dead code removal), Phase 7 (verification)
- Corrected to use MpiProgressBar (not raw div), Events bus throughout, shared dep partial state, explicit dead code removal, expanded verification

**Corrected/updated plan (plan mode temp):** `C:\Users\Fabio\.claude\plans\noble-singing-bachman.md`
- Same content as the above, written under plan mode constraints (only plan file editable)

## Corrections Applied to Plan

1. **MpiProgressBar used instead of custom progress bar** — `MpiInstalledDisplay` imports `MpiProgressBar` and mounts it with `interactive: false` for static progress display. No custom `.mpi-installed-display__progress-fill` created; MpiProgressBar's built-in `.mpi-progress__track-fill` handles the fill.

2. **Events bus** — All cross-component communication uses `Events.on()` / `Events.emit()`. No toast component exists; `Events.emit('ui:error', { title, message })` is the canonical pattern per `js/events.js` `MpiEventMap`.

3. **Shared dep progress — "partial" state for other models** — When Model A is downloading and Model B/C share a dep that's partially complete, Model B/C cards show `downloadState: 'partial'` with a progress bar driven by `state.downloadJobs`. Ref counts drive bar fill for non-active models.

4. **Dead code cleanup explicit as Phase 6** — `showDeleteModels` prop + `deleteModels` event removed from `MpiInstalledDisplay` entirely, from `MpiInstalledDisplayProps` in `types.js`, and from `MpiModelsModal` renderList.

5. **Old `streamDownload` in `routes/shared.js` untouched** — per spec: existing helper stays, new logic lives in `downloadManager.js`.

6. **Verification Step 8 added** — verifies shared dep progress appears on Model B card even when Model B hasn't been explicitly started.

## Key Files Analyzed

- `routes/shared.js` — streamDownload, runPipCommand, resolveComfyPath, getCustomRoot exports (all reused, not modified)
- `routes/comfy.js` — old blocking download route (lines 395–470) for removal; processState structure
- `js/state.js` — state Proxy pattern; three new keys needed: downloadJobs[], downloadQueueActive, comfyNeedsRestart
- `js/events.js` — EventBus class, cleanup pattern, MpiEventMap canonical names
- `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js` — template/setup, found showDeleteModels/deleteModels to remove
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` — _installModel (blocking, needs replacing), renderList
- `js/data/modelConstants/dependencies.js` — DEPS structure; sha256 field needs adding
- `.claude/rules/components.md` — 3-tier hierarchy, ComponentFactory.mount() behavior, mount target isolation
- `js/components/Primitives/MpiProgressBar/MpiProgressBar.js` — static bar via `interactive: false`

</work_completed>

<work_remaining>

## Not Yet Implemented

All implementation work remains. The plan is complete and ready for execution.

### Task 1 — SHA256 Data (data only, no code)
- Add `sha256: '...'` field to every entry in `js/data/modelConstants/dependencies.js`
- Git-clone deps (custom_nodes) use `sha256: null`
- Lookup via: `curl -sL "https://huggingface.co/<org>/<repo>/resolve/main/<file>" | sha256sum`

### Task 2 — Backend: routes/downloadManager.js (new file)
- Create full Express router: ResumableDownloader class, SSE broadcast, 6 endpoints
- `_activeDownloaders` Map for abort-on-cancel
- `_broadcast(event, data)` sends SSE payloads to all connected clients

### Task 3 — Backend: routes/comfy.js modifications
- Remove old `POST /comfy/models/download` handler (lines ~395–470)
- Add `comfyNeedsRestart: false` to `processState`
- Update `POST /comfy/start` to accept `isUserRestart` body param
- Add `POST /comfy/needs-restart` endpoint

### Task 4 — Frontend: js/state.js
- Add `downloadJobs: []`, `downloadQueueActive: false`, `comfyNeedsRestart: false` to `_state`

### Task 5 — Frontend: js/services/downloadService.js (new file)
- Singleton with `start`, `pause`, `resume`, `cancel` methods
- `_ensureSSE()` creates EventSource to `/comfy/downloads/stream`
- All SSE events forwarded to Events bus

### Task 6 — UI: MpiInstalledDisplay updates
- Import MpiProgressBar
- Add props: downloadState, progress, speed, canResume (types.js)
- Rewrite setup(): mount MpiProgressBar for active states; show/hide action buttons by downloadState; remove showDeleteModels
- Add CSS: .mpi-installed-display__progress-label, .mpi-installed-display__installing-label + keyframes

### Task 7 — UI: MpiModelsModal updates
- Import downloadService; rewrite _installModel to non-blocking
- Add download event subscriptions in _unsubs
- Update renderList to pass download props to every card; wire pause/resume/cancel/delete events
- Remove showDeleteModels from installed cards

### Task 8 — Wiring: js/shell.js auto-restart interceptor
- Add `tool:running` listener that intercepts generation when `state.comfyNeedsRestart` is true
- Stops ComfyUI, restarts with `isUserRestart: true`, polls for ready, re-emits queued tool:running

### Task 9 — Dead code removal
- Remove showDeleteModels, deleteModelsActive, deleteModels from types.js MpiInstalledDisplayProps
- Grep to confirm no remaining references

### Task 10 — Verification (testing)

</work_remaining>

<attempted_approaches>

## What Was Not Done

1. **No implementation started** — plan mode was active, only plan file was editable. Only the plan was written.
2. **No SHA256 values looked up** — Task 1 requires `curl | sha256sum` against each HuggingFace URL, not done.
3. **No execution** — User interrupted before approving the plan after corrections were applied.
4. **`/taches-cc-resources:whats-next` invoked** — to create handoff document.

## Alternative Approaches Considered

1. **Subagent-driven vs inline execution** — plan designed for subagent-driven (1 subagent per task) as recommended by superpowers:writing-plans skill. Inline execution (executing-plans skill) was the alternative.
2. **Custom progress bar vs MpiProgressBar** — corrected to use MpiProgressBar (interactive=false) per component system rules.
3. **Toast component** — no toast component exists. `Events.emit('ui:error', { title, message })` is the canonical pattern.

</attempted_approaches>

<critical_context>

## Architecture Decisions

1. **SSE chosen over polling** — Backend sends progress via SSE (`_broadcast`), frontend connects once via EventSource('/comfy/downloads/stream'). downloadService stores the `_eventSource` reference and never creates more than one.

2. **In-memory job storage** — Backend uses `_depJobs` (Map) and `_modelJobs` (Map) as in-memory store. Frontend persists to `state.downloadJobs` for navigation-survival in Electron.

3. **ResumableDownloader stores active downloader refs** — `_activeDownloaders` Map (depId → ResumableDownloader) enables `abort()` call when pausing or cancelling.

4. **Ref-counting for shared deps** — dep lives in `_depJobs` once, with `refCount` tracking how many model jobs depend on it. Cancel decrements refCount; if it hits 0, the dep download is aborted.

5. **Partial file + meta for resume** — Partial downloads stored as `{localPath}.partial` with metadata at `{localPath}.partial.meta`. On resume, meta is read to determine startByte for Range header.

6. **SHA256 verification before rename** — `await _verifySha256(partialPath, sha256Expected)` then `await fs.rename(partialPath, this.localPath)`. Failed verification removes the partial file (catch block).

7. **`comfyNeedsRestart` auto-restart, no manual button** — Spec says no manual Restart button. When `tool:running` fires and `state.comfyNeedsRestart` is true, shell intercepts, stops ComfyUI, restarts with isUserRestart, clears flag.

8. **Events bus over direct component calls** — All download state flows: Backend SSE → downloadService → Events.emit() → components via Events.on(). No component directly calls another component's methods.

## Key File Locations

- Backend: `routes/downloadManager.js` (new), `routes/comfy.js` (modify), `routes/shared.js` (NOT modified)
- Frontend: `js/services/downloadService.js` (new), `js/state.js` (modify)
- UI: `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js` (modify), `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` (modify), `js/components/types.js` (modify)
- CSS: `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css` (modify)

## Critical Rules From components.md

- **ComponentFactory.mount() does innerHTML replacement** — Always create a fresh `document.createElement('div')` as mount target, never mount into a container with existing children
- **Never import up** — Primitives import nothing; Compounds import Primitives only; Blocks import both
- **Setup must own all state/hotkeys/overlay mounting** — Callers must never import overlayManager, hotkeyManager, or Events to manage a component

## Spec Filepaths

- `docs/superpowers/specs/2026-04-12-download-manager-design.md` — the authoritative spec
- `docs/superpowers/plans/2026-04-12-download-manager.md` — authoritative plan (updated)

## Backlog Entry Reference

`.claude/rules/backlog.md` — "🔴 HIGHEST PRIORITY: Download Manager — Implementation Plan"

</critical_context>

<current_state>

## Plan Status

- **Spec:** `docs/superpowers/specs/2026-04-12-download-manager-design.md` — read and followed
- **Plan (updated):** `docs/superpowers/plans/2026-04-12-download-manager.md` — complete, all corrections applied
- **Backlog entry:** `.claude/rules/backlog.md` — "🔴 HIGHEST PRIORITY: Download Manager — Implementation Plan"

## What Needs to Happen Next

**The plan needs continued refinement, not execution.** The following gaps have been identified and should be addressed before execution:

1. **Route registration** — `routes/downloadManager.js` must be registered in the Express app. The plan creates the router but does not specify where/how to mount it in the main server file. Needs a step in Task 2.

2. **App shutdown cleanup** — Spec says "cancels all active downloads gracefully if the app is closed." No shutdown handler is specified. Should be added to Task 2 or 3.

3. **SSE reconnection** — If the SSE connection drops (network issue, ComfyUI restart), `downloadService._eventSource` will be stale. No reconnection logic is specified. Should be added to Task 5.

4. **Uninstall not in scope** — The "Uninstall" button in `MpiInstalledDisplay` currently shows "not implemented" error. Plan does not address whether to leave as-is or wire it up.

## Next Step

Refine the plan to address items 1–3 (route registration, graceful shutdown, SSE reconnection) then proceed to execution.

## No Implementation Has Started

All work is in planning phase. No code written, no files modified (beyond plan files), no SHA256 lookups done, no commits made.

</current_state>
```