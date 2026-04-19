# Handoff: ComfyUI Startup After Dependency Installation

**Session Date:** 2026-04-19  
**Status:** Issue discovered and documented; ready for investigation

---

## The Issue

After installing missing model dependencies (via Models Manager), generating an image fails silently:
1. User clicks "Generate" button
2. Prompt box shows loading state (button appears active)
3. **MpiStartingComfy modal does NOT appear**
4. ComfyUI server does not start
5. Generation times out or fails
6. **Closing and reopening the app allows generation to work**

This suggests a **state synchronization issue** between the dependency installer and ComfyUI startup logic.

---

## Root Cause (Hypothesis)

The app may be caching the ComfyUI server state or readiness check result:
1. User installs dependencies via `/engine/repair-deps` or model dependency download
2. Backend marks `comfyNeedsRestart: true` after custom node pip install
3. **App doesn't detect this state change** and attempts to use ComfyUI without restarting
4. Startup modal never triggers
5. Restart app → fresh state check → ComfyUI starts correctly

---

## Where to Investigate

### 1. ComfyUI Startup Logic (`routes/comfy.js` & `js/services/comfyController.js`)

- Check `ensureServerRunning()` method (line ~36 in comfyController.js)
- Does it check `comfyNeedsRestart` flag after dependency install?
- Is there a **cache or stale state** that prevents restart detection?

### 2. Dependency Install Completion (`routes/downloadManager.js`)

- After `finishCustomNodeInstall()` completes (line 816–834)
- Does it set `comfyNeedsRestart: true`?
- Is this flag broadcast to the frontend?

### 3. Frontend Startup Trigger (`js/shell.js` & related)

- When `generate` is clicked, does the app call `ensureServerRunning()`?
- Or is there a **stale cached result** from the pre-install check?
- Check `MpiStartingComfy.js` mount/show logic — does it ever get triggered?

### 4. State & Events

- Check if `comfyNeedsRestart` state is properly reactive
- Is there an event that should fire after dependency install completion?
- Should `engine:complete` or similar trigger a state refresh?

---

## Testing Checklist for Next Session

- [ ] Install one model dependency successfully
- [ ] Click "Generate" immediately after install completes
- [ ] Verify MpiStartingComfy modal appears
- [ ] Verify ComfyUI starts and generation works
- [ ] Do NOT close and reopen the app
- [ ] If it fails: check browser console and `logs/app.log` for error state

---

## Key Files to Review

1. `js/services/comfyController.js` — ensureServerRunning(), startup logic
2. `routes/downloadManager.js` — finishCustomNodeInstall() completion
3. `js/shell.js` — event wiring on app startup
4. `routes/comfy.js` — comfyNeedsRestart flag management
5. `logs/app.log` — backend state during reproduce

---

## Possible Solutions

1. **Force state refresh after dependency install** — emit event that triggers ComfyUI readiness re-check
2. **Clear cached startup state** — reset any memoized results when dependencies change
3. **Monitor `comfyNeedsRestart` flag** — listen for changes and auto-trigger restart
4. **Update generation flow** — ensure startup modal is always shown for fresh installations

---

## Previous Session Work

This session implemented:
- Parallel engine + UW deps downloads with aggregated progress bar
- Separated custom node installation from download phase (runs after Python available)
- Fixed model detection race condition (now waits for engine:ready event)
- Computed SHA256 hashes for updated model URLs

All changes committed. Next session should focus on this startup issue.
