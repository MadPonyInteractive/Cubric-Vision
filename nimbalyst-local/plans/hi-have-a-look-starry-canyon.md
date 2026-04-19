# Plan: Fix ComfyUI Silent-Start Failure After Dependency Install

## Context

After installing model dependencies (including custom nodes) via the Models Manager, clicking "Generate" fails silently — the `MpiStartingComfy` modal never appears, ComfyUI does not start, and generation times out. Closing and reopening the app fixes it.

This was handed off with a hypothesis about stale state. Root cause investigation confirms a **single-line logic ordering bug** in `ensureServerRunning()`.

---

## Root Cause (Confirmed)

**File:** `js/services/comfyController.js`, line 40

```js
if (status.running && status.ready) return true;   // ← this fires first
// ↓ this is NEVER reached when ComfyUI is already up:
if (state.comfyNeedsRestart && status.running) { ... }
```

**What happens:**

1. User installs custom node deps. `downloadManager.js` broadcasts SSE `comfy:needs-restart`.
2. `downloadService.js:227` sets `state.comfyNeedsRestart = true`.
3. ComfyUI process is **not killed** by the install — it stays running with the old custom nodes.
4. User clicks Generate → `ensureServerRunning()` runs.
5. `GET /comfy/status` returns `{ running: true, ready: true }` (process is alive).
6. **Line 40 fires: `return true` immediately.** The `comfyNeedsRestart` check on line 43 is never reached.
7. Generation proceeds against ComfyUI that does not have the new custom node loaded → fails silently.
8. App restart → `state.comfyNeedsRestart` resets to `false` (never persisted) → works fine.

The fix: **check `state.comfyNeedsRestart` before the early return**, so a pending restart always takes priority over treating the current process as usable.

---

## The Fix

**File:** `js/services/comfyController.js`

Move the `comfyNeedsRestart && status.running` check to run **before** the `running && ready` early-return guard:

```js
async ensureServerRunning() {
    try {
        const statusRes = await fetch('/comfy/status');
        const status = await statusRes.json();

        // Check restart flag BEFORE the early-return — a pending restart
        // must take priority over treating the current process as usable.
        if (state.comfyNeedsRestart && status.running) {
            clientLogger.info('comfy', 'Custom nodes installed — triggering auto-restart');
            Events.emit('comfy:starting');   // ← ADD THIS so modal appears
            Events.emit('ui:error', {
                title: 'Restarting ComfyUI',
                message: 'New custom nodes were installed. Restarting automatically...',
            });

            await fetch('/comfy/stop', { method: 'POST' });
            await new Promise(r => setTimeout(r, 2000));

            await fetch('/comfy/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isUserRestart: true }),
            });

            let retries = 60;
            while (retries-- > 0) {
                await new Promise(r => setTimeout(r, 1000));
                try {
                    const check = await fetch('/comfy/status').then(r => r.json());
                    if (check.ready) {
                        state.comfyNeedsRestart = false;
                        Events.emit('comfy:ready');
                        return true;
                    }
                } catch (e) { /* keep polling */ }
            }
            throw new Error('ComfyUI auto-restart failed to become ready.');
        }

        // Normal fast-path: already running and ready, no restart needed
        if (status.running && status.ready) return true;

        // ... rest unchanged
```

**Two changes in one move:**
1. Reorder: `comfyNeedsRestart && status.running` block moves above the `running && ready` early-return.
2. Add `Events.emit('comfy:starting')` at the top of the restart branch, so the `MpiStartingComfy` modal appears (it was previously missing from this branch entirely — `shell.js:181` only shows the modal on `comfy:starting`).

---

## Files to Modify

- `js/services/comfyController.js` — lines 36–73 (the `ensureServerRunning()` function only)

No other files need changes. The SSE wiring, state management, and modal show/hide logic are all correct.

---

## Verification

1. Start app. Let ComfyUI boot normally (confirm it's `running + ready`).
2. Open Models Manager. Install a workflow that includes at least one custom node dep.
3. Wait for `download:complete` SSE — confirm `state.comfyNeedsRestart` is `true` via browser console (`state.comfyNeedsRestart`).
4. Close Models Manager. Click "Generate" immediately (do NOT restart app).
5. **Expected:** `MpiStartingComfy` modal appears, ComfyUI restarts, generation succeeds.
6. **Old behavior:** modal never appeared, generation failed silently.
7. Check `logs/app.log` for `'Custom nodes installed — triggering auto-restart'` log line to confirm the branch was entered.
