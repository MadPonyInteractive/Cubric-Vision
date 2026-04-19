# Handoff: Model Manager Progress Display Bug — Debugging Incomplete

## What Was Done

Implemented fixes for 4 bugs identified in `in-this-session-we-quirky-blum.md`:

### Bug 1 (Backend) ✅ In Place
**File:** `routes/downloadManager.js` (line 313-315)
**Fix:** Recalculate `modelJob.downloadedBytes` and `progress` from completed deps BEFORE broadcasting `download:started`.
```js
modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
```

### Bug 2 (Frontend SSE Reconnect) ✅ In Place
**File:** `js/services/downloadService.js` (SSE `open` handler, lines 112-120)
**Fix:** On SSE reconnect, recalculate each job's progress from its deps' `downloadedBytes` to fix stale progress.
```js
for (const job of jobs) {
    if (job.deps && job.totalBytes > 0) {
        const depBytes = job.deps.reduce((s, d) => s + (d.downloadedBytes || 0), 0);
        if (depBytes > job.downloadedBytes) {
            job.downloadedBytes = depBytes;
            job.progress = depBytes / job.totalBytes;
        }
    }
}
```

### Bug 3 (Frontend Pause/Cancel Buttons) ⚠️ Incomplete
**File:** `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`
**Fix Applied:** Added `_cardHandlers` Map to track callbacks, clear and re-wire on `download:started`.
**ISSUE:** The fix attempts to clear listeners via `card.display.listeners` but `listeners` is a private variable inside `ComponentFactory.mount()` and is NOT exposed on the returned instance. The fix likely doesn't work.

### Bug 4 (Frontend Complete State) ✅ In Place
**File:** `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`
**Fix:** On `download:complete`, call `setDownloadState('complete')` immediately before `awaitReSync()`.

### Additional Fixes Found Necessary ⚠️
**File:** `js/services/downloadService.js`

**Fix 5 — Missing SSE listener:** There was NO `download:started` SSE listener in `downloadService.js`. Backend broadcasts it but frontend never processed it. Added the listener to update `job.progress` from the backend's correct value.

**Fix 6 — SSE timing:** Moved `_ensureSSE()` to the START of `start()` (was at END, after POST). This ensures SSE is connected before the backend might broadcast events during request processing.

---

## Current State

- All 6 fixes are in the source files (confirmed via `git diff`)
- App was NOT restarted after changes were applied
- Electron runs JS directly from source (no bundler), but renderer must be restarted to reload modules
- **The bug still manifests visually**

---

## Key Suspicions for Next Session

### Suspicion 1: App Restart Required
Electron needs a full restart to reload the source files. The user needs to close and reopen the app.

### Suspicion 2: Bug 3 Fix is Broken
The `card.display.listeners` reference in my Bug 3 fix is `undefined` because `ComponentFactory.mount()` doesn't expose the `listeners` Map on the returned instance. The fix doesn't actually clear old listeners. See `js/components/factory.js` lines 77, 111-114:

```js
// listeners is declared INSIDE mount() at line 77 — NOT on the returned instance
const listeners = new Map();
const instance = {
    el,
    props,
    // ... no listeners property
    on: (event, callback) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(callback);
    },
    // destroy() clears listeners but doesn't expose the Map
};
```

**To properly fix Bug 3**, the ComponentFactory would need to expose `listeners` on the instance, OR `MpiInstalledDisplay` needs a method to remove event listeners, OR `MpiModelsModal` needs a different approach (e.g., always using a single delegating handler that checks current state).

### Suspicion 3: Bug 2 May Not Trigger
Bug 2's recalculation only runs when the SSE `open` event fires. This happens when `_ensureSSE()` is first called (on first `downloadService.start()` call in the session). If the user opens the Model Manager BEFORE starting any download, the SSE hasn't connected yet, and the stale `progress: 0` from previous session persists.

**Suspect the fix should ALSO run when:**
- Modal opens (not just SSE reconnect), OR
- `_ensureSSE()` should be called at app startup, not lazily on first download

### Suspicion 4: Frontend Creates Stale Job
In `downloadService.start()`, a job is created locally with `progress: 0` BEFORE the SSE connection is established:
```js
const job = _createJob(modelId, dependencies); // progress: 0
state.downloadJobs = [...state.downloadJobs.filter(j => j.modelId !== modelId), job];
Events.emit('download:started', { modelId, job }); // emits with progress: 0
// THEN _ensureSSE() was at END (now at START)
// If SSE not ready, backend broadcasts download:started with correct progress
// but nothing is listening (before Fix 5)
```

### Suspicion 5: Bug 2 Condition May Fail
```js
if (depBytes > job.downloadedBytes) { // 0 > 0 = false!
```
If the job was created by the frontend with `downloadedBytes: 0` and `deps: []` (empty, because the frontend job creation doesn't include dep details), then on reconnect `depBytes = 0` and the condition `0 > 0` fails. The backend's job has the correct dep data, but only if the backend still has the job (not cleared on app restart).

---

## Verification Steps to Test After Restart
1. Open app, open Model Manager
2. Models with SDXL installed should show "INSTALLED" badge (not a progress bar)
3. Models with partial installs (~90%) should show a progress bar at ~90%
4. Click Install on a partially-installed model — Pause and Cancel buttons should be functional
5. Let a download complete — card should immediately show "INSTALLED" without waiting for re-sync
6. Reload app while a download is in progress, reopen modal — progress should resume at correct percentage (not 0%)

---

## Files to Check
| File | What to Verify |
|---|---|
| `routes/downloadManager.js:313-315` | Bug 1 fix exists |
| `js/services/downloadService.js:112-120` | Bug 2 fix exists |
| `js/services/downloadService.js:135-146` | SSE `download:started` listener exists |
| `js/services/downloadService.js:18-21` | `_ensureSSE()` called at start of `start()` |
| `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` | `_cardHandlers` Map exists, Bug 3/4 fixes exist |

---

## Architecture Context

- **Single SSE Connection:** `downloadService._connectSSE()` is the ONLY EventSource connection. All other components subscribe via `Events.on()`.
- **No Bundler:** Electron runs `js/` files directly. Restart required to reload changes.
- **State Keys:** `state.downloadJobs[]`, `state.s_installedModelIds`
- **Key Events:** `download:started`, `download:progress`, `download:complete`, `models:checked`
- **Backend SSE Broadcasts:** `download:started` sends `{ modelId, status, progress }` where progress should be accurate
