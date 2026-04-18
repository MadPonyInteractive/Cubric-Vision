---
title: "Install Universal Workflow Dependencies During Engine Setup"
tracker: bug_mo2kjd43vwnp8h
status: in-development
priority: high
startDate: 2026-04-18
updated: 2026-04-18
progress: 0
---

# Install Universal Workflow Dependencies During Engine Setup

## Context

When ComfyUI is installed, only the core engine binary is downloaded. The three Universal Workflows (`interpolate`, `videoUpscale`, `autoMaskImg`) each require custom nodes and model files that are never installed — so all three show as `installed: false` immediately after a fresh engine install.

Additionally, if the user manually deletes or corrupts UW deps, there is no recovery path — the install screen never re-appears because the engine version stamp is still valid.

**Fix:** Extend `GET /engine/version-check` to also check whether all UW deps are present on disk. If any are missing, the response includes `needsDepsInstall: true`, causing `shell.js` to show the install screen. The install screen then triggers `POST /engine/download` (or a new dedicated endpoint), which downloads any missing UW deps before broadcasting `engine:complete`.

## Implementation Progress

- [ ] Add `_UW_DEPS` constant to `routes/downloadManager.js` and export `startUniversalWorkflowInstall()`
- [ ] Extend `GET /engine/version-check` in `routes/engine.js` to check UW dep presence, return `needsDepsInstall`
- [ ] Update `shell.js` `_bootApp()` to handle `needsDepsInstall` — show install screen in `'repairing'` mode
- [ ] Update `MpiEngineInstall.js` to support `'repairing'` mode (skip Phase 1 path picker, go straight to progress)
- [ ] Update `_runEngineDownload()` (and add a new `POST /engine/repair-deps` route) to install UW deps as part of the flow
- [ ] Add `engine:uw-installing` SSE handler in `MpiEngineInstall.js` to keep modal open with status text
- [ ] Verify `syncModelInstalled()` returns `installed: true` for all 3 UWs after fresh install and after repair

---

## Implementation Plan

### Step 1 — `routes/downloadManager.js`: `_UW_DEPS` + `startUniversalWorkflowInstall()`

Add a module-level constant `_UW_DEPS` with inline dep objects (avoids ESM/CJS interop with `dependencies.js`). These mirror the UW-relevant entries from `js/data/modelConstants/dependencies.js` exactly — same URLs, filenames, sha256s.

**Deps to include** (8 total; `ComfyUI-MpiNodes` is already bundled with the engine):
- `ComfyUI-VideoHelperSuite` (custom_nodes)
- `ComfyUI-Frame-Interpolation` (custom_nodes, `installRequirementsCommand: 'python install.py'`)
- `ComfyUI-Impact-Pack` (custom_nodes, `installRequirements: true`)
- `ComfyUI-Impact-Subpack` (custom_nodes, `installRequirements: true`)
- `face-yolov8n` (ultralytics)
- `hand-yolov8n` (ultralytics)
- `person-yolov8n-seg` (ultralytics)
- `sam-vit-b` (sams)

**`startUniversalWorkflowInstall()`** — exported async function that:
1. Resolves local paths for each dep using `getCustomRoot()` + `resolveComfyPath()` (same as the `/start` route)
2. Skips deps already on disk (marks them `'complete'` immediately)
3. Enqueues the rest as `modelId: 'universal-workflows'` using `_createDepJob`, `_createModelJob`, `_startPendingDeps`
4. Returns a Promise that resolves when the job reaches `'complete'` or `'failed'`

The promise resolution: after enqueuing, poll `modelJob.status` on a small interval (e.g. every 500ms) until it is no longer `'downloading'` or `'installing'`. This is simpler than wiring an internal callback through `_checkModelJobsComplete`.

**Also export `checkUniversalWorkflowDepsInstalled()`** — a lightweight function that checks disk presence of all 8 deps without starting any download. Returns `{ allInstalled: boolean, missing: string[] }`. Used by the version-check route.

---

### Step 2 — `routes/engine.js`: Extend `GET /engine/version-check`

Import `checkUniversalWorkflowDepsInstalled` from `./downloadManager`. In the version-check handler, after the existing version stamp check, run the UW dep check:

```js
const uwCheck = await checkUniversalWorkflowDepsInstalled();
res.json({
    installed: installedVersion,
    required: requiredVersion,
    needsInstall: installedVersion === null,
    needsUpgrade: installedVersion !== null && installedVersion !== requiredVersion,
    needsDepsInstall: !uwCheck.allInstalled,   // NEW
    missingDeps: uwCheck.missing,              // NEW (for logging/debug)
});
```

`needsDepsInstall` is `true` whenever any UW dep is absent — regardless of engine version status.

**Add `POST /engine/repair-deps`** — a lightweight route that:
1. Broadcasts `engine:uw-installing` immediately
2. Calls `await startUniversalWorkflowInstall()`
3. Broadcasts `engine:complete`

This is the entry point for the repair flow (when engine version is fine but deps are missing).

**Update `_runEngineDownload()`** — after `engine:patching` and before `engine:complete`:
```js
// Install UW deps as part of every fresh install / upgrade
broadcastEngineEvent('engine:uw-installing', { status: 'Installing Universal Workflow dependencies...' });
try {
    await startUniversalWorkflowInstall();
} catch (e) {
    logger.warn('engine', `UW dep install failed (non-fatal): ${e.message}`);
}
broadcastEngineEvent('engine:complete', { success: true });
```

`engine:complete` is now always broadcast after UW dep install — whether all succeeded or not.

---

### Step 3 — `js/shell.js`: Handle `needsDepsInstall`

In `_bootApp()`, extend the existing version-check block:

```js
if (versionData.needsInstall) {
    _engineInstall.el.show('installing');
} else if (versionData.needsUpgrade) {
    _engineInstall.el.show('upgrading');
} else if (versionData.needsDepsInstall) {
    _engineInstall.el.show('repairing');   // NEW
}

// resolve condition: also resolve immediately if none of the above
if (!versionData.needsInstall && !versionData.needsUpgrade && !versionData.needsDepsInstall) {
    resolve();
}
```

---

### Step 4 — `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js`

**`show(mode)` — add `'repairing'` mode:**
- Skips Phase 1 (path picker) — goes straight to progress phase
- Sets title: `"Repairing Installation"`
- Sets subtitle: `"Downloading missing dependencies..."`
- Hides upgrade message
- Connects SSE and calls `POST /engine/repair-deps` (new route)

**Add `engine:uw-installing` SSE handler:**
```js
_sseConnection.addEventListener('engine:uw-installing', (e) => {
    const data = JSON.parse(e.data);
    el.setStatus(data.status || 'Installing workflow dependencies...');
    progressInfo.textContent = 'Downloading Universal Workflow dependencies...';
    el.setLoading(true);
    pauseButtonMount.style.display = 'none';
    resumeButtonMount.style.display = 'none';
});
```

`engine:complete` already closes the modal and emits `engine:ready` — no change needed there.

---

## Critical Files

| File | Change |
|---|---|
| `routes/downloadManager.js` | Add `_UW_DEPS`, export `startUniversalWorkflowInstall()` + `checkUniversalWorkflowDepsInstalled()` |
| `routes/engine.js` | Extend `version-check` with `needsDepsInstall`; add `POST /engine/repair-deps`; call `startUniversalWorkflowInstall()` in `_runEngineDownload()` |
| `js/shell.js` | Handle `needsDepsInstall` in `_bootApp()` |
| `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` | Add `'repairing'` mode + `engine:uw-installing` SSE handler |

## Reused Infrastructure

- `_createDepJob`, `_createModelJob`, `_startPendingDeps`, `_runCustomNodeInstall` — unchanged
- `resolveComfyPath`, `getCustomRoot`, `runPipCommand`, `runCustomCommand` from `routes/shared.js`
- `broadcastEngineEvent` from `routes/downloadManager.js`
- Existing `engine:complete` → `engine:ready` → modal hide flow — unchanged

## Verification

1. **Fresh install:** Trigger engine install via app. Confirm UW deps appear in `custom_nodes/` and `models/` before `engine:complete` fires.
2. **Repair trigger:** With engine version current, delete `comfyui-videohelpersuite/`. Restart app. Confirm install screen shows in repair mode and re-downloads the missing dep.
3. **Already installed:** With all deps present, confirm `needsDepsInstall: false` and install screen does NOT appear.
4. **`syncModelInstalled()`:** After install/repair, all three `universal:*` entries return `installed: true`.
5. **Upgrade path:** `POST /engine/upgrade` → `_runEngineDownload()` → UW deps install → `engine:complete`. Confirm deps present after upgrade.
