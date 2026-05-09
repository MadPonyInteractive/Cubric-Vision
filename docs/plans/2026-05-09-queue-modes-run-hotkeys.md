# Queue Modes + Run Hotkeys

**Created:** 2026-05-09
**Kanban entry:** `Queue modes + run hotkeys`
**Tag:** [PLAN]
**Priority:** high

## Goal

Add three execution modes to PromptBox generation — **Single** (current), **Queue**, **Auto-loop** — with a separate Stop button surface for the new modes and `Ctrl+Enter` / `Ctrl+Alt+Enter` hotkeys matching ComfyUI convention.

This plan is a foundation: the next plan ("Video preview-gate core") will call into the queue API exposed here so the Continue-on-preview-card flow works while another job is running.

## Context summary (from investigation)

- **Run/Stop today:** single toggleable `MpiButton` in `MpiPromptBox.js:608-631` emits `'run'` / `'cancel'`. Local `isGenerating` flag, `el.setGenerating(bool)` API, listens for `'promptbox:generation-end'`.
- **Submission path:** `generationService.startGeneration` → `commandExecutor.runCommand` → `ComfyUIController.runWorkflow` → `POST http://127.0.0.1:8188/prompt`. No client-side serialization. Cancel = `POST /interrupt` (kills running prompt only).
- **ComfyUI native queue:** ComfyUI's own queue is FIFO. We **never read the `prompt_id`** returned by `POST /prompt`, so we can't target specific queued jobs for removal. We also never call `GET /queue` or `POST /queue` (delete). For this plan: capture `prompt_id` and use ComfyUI's native queue directly — no need to layer our own.
- **Tracking:** `js/services/activeGenerations.js` Map; events `generation:started`, `generation:complete`, `generation:error`, `generation:cancelled`.
- **State:** no `isGenerating` global key. Convention is per-project per-model settings via `modelSettings[modelId]` + 300ms debounce save.
- **Hotkeys:** `Hotkeys.bind(id, handler)` returns unbind. Registry in `js/managers/hotkeyRegistry.js`. `Ctrl+Enter` and `Ctrl+Alt+Enter` are both free. Modifier combos pass through textareas when `allowWhileTyping: true`.
- **Option pattern:** `MpiOptionSelector` variant `buttons` fits a three-state toggle. Persistence via `settings:model:update` event → `projectService` debounced save into `modelSettings[modelId]`.

## Architecture decisions

1. **Use ComfyUI's native queue.** Capture `prompt_id` from `POST /prompt` response and use `GET /queue` for depth + `POST /queue {delete:[id]}` for targeted removal. Avoids duplicating queue state in Node.
2. **Mode state:** session-only in `state.generationMode`, shared across models. Default `'single'`. Do not persist generation mode to `project.json`.
3. **Stop semantics by mode:**
   - Single: Stop = interrupt active job (current behavior).
   - Queue: Stop = interrupt active job. Queued jobs continue.
   - Auto-loop: Stop = end loop after current job completes naturally (no interrupt). Modifier-stop (e.g. Shift+click or second tap) = interrupt + end loop. Verify with user during execution if any other refinement needed.
4. **UI surface:** Single keeps current toggleable button. Queue + Auto-loop swap to a dual-button layout (Run + Stop both visible) inside the same `#bottom-right-slot`.
5. **Job identity carries forward:** `activeGenerations` registry gains `prompt_id` field so future plans (preview-gate) can correlate gallery cards to ComfyUI queue entries.

## To-dos

### 1. Capture `prompt_id` + add ComfyUI queue helpers in comfyController [x]

Edit `js/services/comfyController.js`:
- In `runWorkflow()` around `comfyController.js:365`, parse the JSON response from `POST /prompt` and return the `prompt_id`. Plumb it back to `commandExecutor.runCommand` and into `activeGenerations.register(...)` so each handle stores `promptId`.
- Add `getQueue()` → `GET /queue` returning `{ running: [...], pending: [...] }`.
- Add `deleteQueueItem(promptId)` → `POST /queue` with body `{ delete: [promptId] }`.
- Keep existing `interrupt()` untouched.

**Verify:** Open dev tools console, trigger one Run from PromptBox, then in console run `await window.ComfyController.getQueue()`. Confirm the running job's `prompt_id` matches the one logged from `runWorkflow`. Add a temporary `console.log('[queue] prompt_id', promptId)` in `runWorkflow` for verification — remove on green.

### 2. Add session `generationMode` + PROMPT_BOX_CONTROLS [x]

Edit `js/state.js`: add session-only `generationMode: 'single'`. Edit `js/components/Organisms/MpiPromptBox/PromptBoxControls.js`: add a new control entry `generationMode` with three options (`single`, `queue`, `autoloop`). On change, update `state.generationMode`; do not emit `settings:model:update` and do not write the mode to `project.json`. Register the control in the `components[]` arrays of t2i, i2i, t2v, i2v in the command registry.

**Verify:** Open PromptBox settings popup. Confirm a three-button mode toggle is visible. Click each and switch models → confirm the mode remains unchanged for the session. Confirm no `/update-project-settings` write contains `generationMode`.

### 3. PromptBox dual-button layout for Queue/Auto-loop modes [x]

Edit `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` around lines 604-631:
- When `generationMode === 'single'`: keep existing toggleable button (no change).
- When `generationMode === 'queue' || 'autoloop'`: render two separate `MpiButton`s in `#bottom-right-slot` — Run (always enabled, `play` icon) and Stop (enabled only while `isGenerating`, `stop` icon).
- Run click: emit `'run'` (same payload as today).
- Stop click: emit `'cancel'` with mode context: `{ mode: generationMode }`.
- `el.setGenerating(bool)` updates Stop's enabled state in the dual layout instead of toggling the icon.
- Subscribe to `state:changed` on `currentProject` (or a dedicated event from `settings:model:update`) to re-render the button cluster when mode changes mid-session.

**Verify:** Toggle each mode in the popup. Single = one button toggling play↔stop. Queue + Auto-loop = two side-by-side buttons; Stop greyed when idle, enabled while a job runs. No console errors when switching modes mid-generation.

### 4. Backend: queue-aware submission + cancel in commandExecutor + generationService [x]

Edit `js/services/commandExecutor.js` and `js/services/generationService.js`:
- Read `generationMode` from `state.generationMode` at submission time.
- Single (today's behavior preserved): if any active generation exists, reject the new Run with a toast "Generation in progress". (NOTE: today there's no rejection — this tightens Single mode; confirm with user during execution.) Cancel = `interrupt()` only.
- Queue: always accept. Submit immediately. Cancel = `interrupt()` only (kills running, queued jobs continue via ComfyUI's native queue).
- Auto-loop: track a `_loopHandle` per workflow. On `generation:complete`, if loop still active and not stopped, re-submit with same payload. Cancel = clear `_loopHandle` (so no re-submit) but do **not** interrupt the active job. Modifier-stop hard-cancel: emit `'cancel'` with `{ mode: 'autoloop', hard: true }` → interrupt + clear loop.
- Emit `state.generationQueueCount` updates as jobs queue/pop (poll `getQueue()` after submit + on `generation:complete` until ComfyUI reports zero pending). Add `generationQueueCount: 0` to `js/state.js`.

**Verify:** User verified Queue mode no longer creates duplicate/ghost cards; only the in-flight placeholder is visible, saved cards persist across navigation/deletes, Single mode still works, Loop can pick up prompt/model changes, and stopping Loop re-enables the mode radio. Seed is now saved on generated items for inspection. To-do 4 was marked complete only after this verification.

### 5. Hotkeys: register `generation.run` + `generation.stop` and bind in PromptBox [x]

Edit `js/managers/hotkeyRegistry.js`: add two entries
```js
{ id: 'generation.run',  key: 'control+enter',     type: KEY_TYPE.DOWN, category: 'generation', scopeLabel: 'Generation', description: 'Run / Enqueue', allowWhileTyping: true },
{ id: 'generation.stop', key: 'control+alt+enter', type: KEY_TYPE.DOWN, category: 'generation', scopeLabel: 'Generation', description: 'Stop',           allowWhileTyping: true },
```
Bind in `MpiPromptBox.js` `setup()`: `Hotkeys.bind('generation.run', () => { /* trigger same code path as Run click */ })` and matching `'generation.stop'` for cancel. Store both unbinds in `_unsubs` array; call them in `destroy()`. Verify bindings respect mode: hotkey Run in Single while generating → toast (rejected); in Queue → enqueues; in Auto-loop → starts loop.

**Verify:** Focus the prompt textarea, type something, hit `Ctrl+Enter` → generation starts. Hit `Ctrl+Alt+Enter` mid-generation → stop. Confirm `Enter` alone still inserts a newline (does not trigger Run). Help overlay (`MpiHelp`) automatically lists the new hotkeys via the registry — confirm they appear.

### 6. StatusBar queue depth indicator

Edit `js/shell/statusBar.js`: subscribe to `state.generationQueueCount` via `Events.onState('generationQueueCount', ...)`. When > 0 and a job is active, append ` (N queued)` to the active label. When count drops to 0, label reverts. No new component — extend the existing label render.

**Verify:** Queue mode, submit 3 prompts. Confirm StatusBar shows `Generating … (2 queued)` then `(1 queued)` then no suffix. Single mode + 1 prompt → no suffix ever appears.

### 7. Documentation + rule files sync

Update only what changed:
- `.claude/rules/component-events.md`: PromptBox now emits `'cancel'` with `{ mode, hard? }` payload (was empty `{}`). Document.
- `.claude/rules/component-state.md`: PromptBox now reads/writes session-only `state.generationMode`. StatusBar now reads `state.generationQueueCount`.
- `.claude/rules/components.md`: under Hotkeys section (or wherever generation hotkeys are documented), add `generation.run` and `generation.stop` registry ids.
- `docs/PROJECT.md`: short note in the relevant subsystem section pointing to this plan.

**Verify:** Look at the four edited docs — confirm each new fact is present and no unrelated content was modified.

## Plan Drift (2026-05-09 session)

### Architectural pivot: Cue mode now uses an in-app queue, NOT ComfyUI native queue

Original plan (decision 1) said "Use ComfyUI's native queue. Capture `prompt_id` from `POST /prompt` and use `GET /queue` for depth + `POST /queue {delete:[id]}` for targeted removal."

**Replaced with own-queue, single-dispatch model.** Reason: concurrent `runWorkflow` submits raced on shared static asset filenames (`mpi_input_image.png`, `mpi_input_mask.png`) and the Cue counter became unreliable when Comfy queue depth was polled vs. our optimistic increments. User also wanted full control over pending mutation (clear, future reorder).

New shape:
- `generationService._cueQueue` (in-memory array) holds pending `{ config, callbacks, opts }` entries. Only ONE prompt is ever submitted to ComfyUI at a time.
- `enqueueGeneration(config, callbacks, opts)` — Cue-mode entry. Pushes onto queue + triggers dispatcher.
- `_dispatchNextCue()` — pulls next when idle. Wraps `callbacks.onComplete/onError/onCancel` to flip `_cueDispatchInFlight = false` and call `_dispatchNextCue` again. Emits `promptbox:generation-end` when queue drains and nothing else is active.
- `clearCueQueue()` / `clearPendingQueue()` — clears local pending. Comfy never has pending so no Comfy-side mutation needed.
- `state.generationQueueCount = _cueQueue.length + (_cueDispatchInFlight ? 1 : 0)`. Updated on push/dispatch/cancel — no polling.
- `refreshQueueDepth()` retained as a no-op-ish hook for callers (still exported so block code paths compile).
- `_emitPromptBoxGenerationEndIfIdle()` now also checks `_cueDispatchInFlight || _cueQueue.length`.

Block-side wiring:
- `MpiGalleryBlock.js` and `MpiGroupHistoryBlock.js` `pb.on('run')` branch on `state.generationMode === 'queue'` → `enqueueGeneration(...)`. Single + Auto-loop continue to call `startGeneration(...)` directly (autoloop still uses the existing `_activeLoops` resubmit-on-complete path).
- `pb.on('cancel')` for queue mode now only emits `promptbox:generation-end` when `noRunning && queueIdle`. Stop on a multi-Cue run keeps Stop+Clear buttons enabled while pending remains.

Removed:
- `_scheduleQueuePoll` / `_refreshQueueDepth` Comfy `GET /queue` polling. Dead.
- `activeGenerations.cancel` async branch that called `ComfyUIController.deleteQueueItem(promptId)` for queued (not-yet-running) prompts. With own-queue, Comfy never has pending, so cancel is back to synchronous `exec.cancel()` which calls `/interrupt` for the running job only.
- `import { ComfyUIController } from './comfyController.js'` from generationService (no longer used here).

### MpiButton: new `el.setDisabled(bool)` API

`MpiButton`'s click handler reads `props.disabled`. Toggling the DOM `disabled` attribute alone (`removeAttribute('disabled')`) leaves `props.disabled` stuck at the mount-time value, so clicks silently bail. Added `el.setDisabled(disabled)` that syncs both `props.disabled` and the DOM attribute. PromptBox queue-mode Stop / Clear now use `setDisabled` instead of raw attribute toggling.

This was the root cause of the user-reported "Stop button does nothing" symptom. Document in `.claude/rules/components.md` (Primitive section for MpiButton) when sync step 7 lands.

### `el.setActive` adopted for run-button class sync

PromptBox hotkey path was using raw `runBtn.el.classList.add/remove('is-active')` which desynced `MpiButton`'s internal `props.active` (toggle clicks afterwards saw stale state). Replaced with `runBtn.el.setActive(true/false)`. Same fix applied to `el.setGenerating` in PromptBox so the in-flight visual state survives external toggling.

### Mode-switch reset of `isGenerating`

`_renderRunCluster` now resets `isGenerating = false` when `state.generationQueueCount === 0` before mounting the new button cluster. Stale optimistic flags from prior-mode Cue clicks no longer paint the new Single/Loop button as active when nothing is actually running.

### To-do status after this session

- [x] 1. Capture prompt_id + queue helpers (kept; `prompt_id` still used for routing WS messages even though we no longer poll Comfy queue depth)
- [x] 2. Session generationMode + PROMPT_BOX_CONTROLS
- [x] 3. PromptBox dual-button layout
- [x] 4. Backend queue-aware submission + cancel — **superseded mid-session**: now own-queue dispatcher; behavior verified by user
- [x] 5. Run/Stop hotkeys — `Ctrl+Enter` / `Ctrl+Alt+Enter` registered + bound in PromptBox; help page row added
- [ ] 6. StatusBar queue depth (untouched this session)
- [ ] 7. Documentation + rule files sync (in progress at session end — see end-session skill)

### Notes for the next agent

- The original plan's references to "ComfyUI's native queue" / `getQueue` / `deleteQueueItem` for **Cue-mode behavior** are stale. ComfyUI helpers in `comfyController.js` remain (used by other code paths, keep them) but generationService no longer touches Comfy queue endpoints for depth or cancel.
- Step 6 (StatusBar) should subscribe to `state.generationQueueCount` and read it directly — depth is now authoritative on the client side, no async fetch required.
- Step 7 should additionally document: `MpiButton.el.setDisabled`, `el.setActive` usage from external code, and the in-app Cue queue's place in `generationService` (replaces the "ComfyUI native queue" wording in `.claude/rules/component-events.md` / `comfy_engine.md` if any references exist).

## Out of scope

- Visual badge on PromptBox showing current mode (the popup toggle is enough for v1; revisit if user requests).
- Per-project default override at project creation (uses model default for now).
- Persistent queue across app restart (in-memory only — ComfyUI's queue resets when Comfy stops).
- Preview-gate Continue button integration — handled in the next plan, which calls `commandExecutor.enqueue()` from this plan's API.

## Open questions to confirm during execution

1. **Single mode rejection:** today there's no rejection on concurrent submissions in Single. Tightening to a toast is a behavior change — confirm with user before locking it in.
2. **Auto-loop hard-stop modifier:** Shift+click? Second tap? Or just rely on a "Force stop" hotkey? Decide during to-do 4.
