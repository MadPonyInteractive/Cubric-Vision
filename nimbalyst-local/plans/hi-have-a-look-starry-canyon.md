# Plan: Fix ComfyUI Silent-Start Failure After Dependency Install

## Context

After installing model dependencies (via Models Manager), clicking "Generate" sometimes fails silently — the `MpiStartingComfy` modal never appears and the button appears stuck in loading state. Closing and reopening the app fixes it.

The handoff hypothesized a state synchronization issue. Systematic debugging with logs and code tracing reveals **two concrete bugs**.

---

## Root Cause Investigation

### What the logs show

`app.log` shows multiple `/engine/repair-deps` calls where the zip extract for `ComfyUI-VideoHelperSuite` fails with "Data Error". Despite the failure, `engine:complete` still fires (because `_runCustomNodeInstall` swallows zip errors with `continue` and proceeds to broadcast `comfy:needs-restart` anyway). This is a separate issue from the silent-fail bug.

### The actual silent-fail scenario

**Bug 1: `comfy:needs-restart` fires for pure model-weight installs (no custom nodes)**

In `routes/downloadManager.js`, `_runCustomNodeInstall()` lines 412–417:
```js
if (!customDeps.length) {
    modelJob.status = 'complete';
    _broadcast('download:complete', { modelId: modelJob.modelId });
    _broadcast('comfy:needs-restart', { modelId: modelJob.modelId });  // ← always fires
    return;
}
```
This fires `comfy:needs-restart` even when there are no custom nodes to install — i.e. for a pure model-weight download. There is no reason to restart ComfyUI in this case.

**Bug 2: `ensureServerRunning()` restart branch never shows the modal**

When `state.comfyNeedsRestart = true` AND ComfyUI is `running: true, ready: false` (e.g. still booting from a prior Generate click while the model install completes), `ensureServerRunning()` hits the restart branch at line 43–73. This branch:
- Stops ComfyUI, waits 2s, starts it again
- Polls for ready
- **Never emits `comfy:starting`** — so `MpiStartingComfy` modal never appears
- If poll succeeds: `comfy:ready` fires, but modal was never shown → `setError()` would target an invisible modal
- User sees button stuck in loading state with no feedback

The line `Events.emit('comfy:starting')` at line 81 is **only** reached by the fall-through path. The restart branch bypasses it entirely.

---

## The Fixes

### Fix 1: Don't broadcast `comfy:needs-restart` when there are no custom nodes

**File:** `routes/downloadManager.js`, lines 412–417

Remove the `_broadcast('comfy:needs-restart', ...)` from the no-custom-deps early-return path. A restart is only needed when custom nodes are actually installed.

```js
// BEFORE:
if (!customDeps.length) {
    modelJob.status = 'complete';
    _broadcast('download:complete', { modelId: modelJob.modelId });
    _broadcast('comfy:needs-restart', { modelId: modelJob.modelId });  // ← remove
    return;
}

// AFTER:
if (!customDeps.length) {
    modelJob.status = 'complete';
    _broadcast('download:complete', { modelId: modelJob.modelId });
    return;
}
```

### Fix 2: Emit `comfy:starting` at the top of the restart branch

**File:** `js/services/comfyController.js`, line 43 (inside the `comfyNeedsRestart && status.running` block)

Add `Events.emit('comfy:starting')` before the stop/start sequence, so the modal always appears when a restart is in progress.

```js
// BEFORE (line 43):
if (state.comfyNeedsRestart && status.running) {
    clientLogger.info('comfy', 'Custom nodes installed — triggering auto-restart');
    Events.emit('ui:error', {
        title: 'Restarting ComfyUI',
        message: 'New custom nodes were installed. Restarting automatically...',
    });
    await fetch('/comfy/stop', ...);
    ...

// AFTER:
if (state.comfyNeedsRestart && status.running) {
    clientLogger.info('comfy', 'Custom nodes installed — triggering auto-restart');
    Events.emit('comfy:starting');   // ← ADD — shows modal before restart begins
    Events.emit('ui:error', {
        title: 'Restarting ComfyUI',
        message: 'New custom nodes were installed. Restarting automatically...',
    });
    await fetch('/comfy/stop', ...);
    ...
```

---

## Files to Modify

1. `routes/downloadManager.js` — remove spurious `comfy:needs-restart` broadcast (lines ~414–416)
2. `js/services/comfyController.js` — add `Events.emit('comfy:starting')` inside restart branch (line ~45)

---

## Verification

1. Start app fresh. Let ComfyUI boot and become ready (confirm with status bar or modal hide).
2. Open Models Manager. Install a model that has **only model-weight deps** (no custom nodes).
3. Close Models Manager. Click Generate immediately.
4. **Expected:** `state.comfyNeedsRestart` should NOT be set (Fix 1). ComfyUI starts normally, modal appears, generation succeeds.
5. Now install a model that has custom node deps (e.g. one that requires a custom node zip).
6. Close Models Manager. Click Generate while ComfyUI is still coming up from a prior start attempt (or stop it manually first via `/comfy/stop`).
7. **Expected (Fix 2):** `MpiStartingComfy` modal appears during the restart. Generation succeeds after ComfyUI becomes ready.
8. Confirm in `logs/app.log` that `"Custom nodes installed — triggering auto-restart"` log appears.
