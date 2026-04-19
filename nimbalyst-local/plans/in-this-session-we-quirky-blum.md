# Model Manager Progress Display Bug Fix

## Context

The model manager UI shows all models at ~1% installed even though SDXL is fully installed and other models are ~90% installed. This was introduced by the SSE architecture refactor (`7194188`) which changed how `MpiModelsModal` reads download state.

The root cause is **two compounding bugs** — one in the backend download job initialization (incorrect `progress` at `download:started`), and one in how `MpiModelsModal` updates cards in-place via `setDownloadState('downloading')` without re-wiring Pause/Cancel button handlers.

---

## Root Cause Analysis

### Bug 1 — PRIMARY: `download:started` broadcasts `progress: 0` even when deps are pre-installed

**File:** `routes/downloadManager.js:314`

When a user clicks Install, the start endpoint:
1. Pre-sums `totalBytes` from ALL dep sizes (line 275)
2. Marks already-installed deps as `complete` with `depJob.downloadedBytes = dep.size` (lines 306–310)
3. Immediately broadcasts `download:started` with `progress: modelJob.progress` (line 314)

**The problem:** `modelJob.progress` is still `0` at line 314 because `_wireProgress` hasn't fired yet — it only fires when an HTTP download chunk arrives. The pre-installed deps have their `depJob.downloadedBytes` set, but `modelJob.downloadedBytes` is only recalculated inside `_wireProgress` which hasn't run.

So a model with SDXL (~6.94 GB) already installed and one small dep missing broadcasts `progress: 0` on start. The first real `download:progress` event will eventually fix it, but during any period without active download bytes (e.g., between the start and the first chunk of a large file), progress is stuck near 0.

**Fix:** After marking all pre-installed deps complete in the loop (lines 306–310), recalculate `modelJob.downloadedBytes` and `modelJob.progress` before the `download:started` broadcast:

```js
// After the for (const dep of dependencies) loop, before broadcast:
modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
_broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });
```

---

### Bug 2 — SECONDARY: Stale `state.downloadJobs` from prior sessions cause persistent ~1% display

**File:** `js/services/downloadService.js:103–114`

On SSE reconnect, the service fetches `/comfy/downloads/status` and restores all in-memory jobs into `state.downloadJobs`. If a previous download session was interrupted after `download:started` but before any `download:progress` events arrived, the stored `job.progress` is `0` (or near 0 from bug 1).

When the modal opens next time, it finds this stale job in `state.downloadJobs` and renders a `progress: ~0` bar instead of the partial progress from dep disk scan.

**Fix:** After loading status jobs on SSE reconnect, recalculate each job's progress from its deps' `downloadedBytes`:

```js
if (jobs && jobs.length) {
    // Recalculate progress from dep data in case stored value is stale
    for (const job of jobs) {
        if (job.deps && job.totalBytes > 0) {
            const depBytes = job.deps.reduce((s, d) => s + (d.downloadedBytes || 0), 0);
            if (depBytes > job.downloadedBytes) {
                job.downloadedBytes = depBytes;
                job.progress = depBytes / job.totalBytes;
            }
        }
    }
    state.downloadJobs = jobs;
    ...
}
```

---

### Bug 3 — Pause/Cancel buttons have no event handlers after `setDownloadState('downloading')`

**File:** `js/components/Blocks/MpiModelsModal/MpiModelsModal.js:353–356`

When `download:started` fires, the in-place handler calls `card.display.el.setDownloadState('downloading')`, which calls `_renderState()` inside `MpiInstalledDisplay`, rebuilding the actions slot with new Pause and Cancel buttons. However, `MpiModelsModal` never re-wires `card.on('pause', ...)` / `card.on('cancel', ...)` for these new button instances — only `renderList()` does that wiring.

The buttons are rendered but dead.

**Fix:** In the `download:started` subscriber in `MpiModelsModal`, after calling `setDownloadState`, re-wire the handlers:

```js
_unsubs.push(Events.on('download:started', ({ modelId }) => {
    const card = _cardInstances.get(modelId);
    if (!card) return;
    card.display.el.setDownloadState('downloading');
    // Re-wire pause/cancel since setDownloadState rebuilt the buttons
    card.display.off('pause');
    card.display.off('cancel');
    card.display.on('pause', () => downloadService.pause(modelId));
    card.display.on('cancel', () => downloadService.cancel(modelId));
}));
```

**Note:** This requires verifying whether `MpiInstalledDisplay` (as a `ComponentFactory.create()` component) supports `.off(eventName)` to remove all listeners for an event. If not, the fix is to track and teardown the handlers manually.

---

### Bug 4 — `download:complete` leaves card in `downloading` state until re-render

**File:** `js/components/Blocks/MpiModelsModal/MpiModelsModal.js:378–383`

On `download:complete`, only `awaitReSync()` is called. The card stays visually in the downloading state until the async re-sync finishes. The fix is to immediately call `setDownloadState('complete')` before `awaitReSync()`.

---

## Files to Modify

| File | Change |
|---|---|
| `routes/downloadManager.js` | Bug 1: Recalculate `modelJob.downloadedBytes` and `progress` before `download:started` broadcast |
| `js/services/downloadService.js` | Bug 2: Recalculate progress from dep bytes when restoring jobs on SSE reconnect |
| `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` | Bug 3: Re-wire pause/cancel handlers in `download:started` subscriber; Bug 4: Call `setDownloadState('complete')` on `download:complete` |

---

## Pre-fix Investigation Step

Before implementing, verify how `MpiInstalledDisplay`'s event emitter works:
- Read `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js` to check if `ComponentFactory.create()` provides `.off(eventName)` on the component instance
- If not, determine the correct pattern to remove stale listeners before re-wiring

---

## Verification

1. Open app, open Model Manager
2. Models with SDXL installed should show "INSTALLED" badge (not a progress bar)
3. Models with partial installs (~90%) should show a progress bar at ~90%
4. Click Install on a partially-installed model — Pause and Cancel buttons should be functional
5. Let a download complete — card should immediately show "INSTALLED" without waiting for re-sync
6. Reload app while a download is in progress, reopen modal — progress should resume at correct percentage (not 0%)
