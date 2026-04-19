# Debug Plan: Engine Fresh Install Flow Broken

## Context

Session added UW dep checking to boot flow and `_runEngineDownload`. User deleted the engine folder to test fresh install. Instead of seeing the install modal (path input + Install button), the app skipped directly to a progress bar and then showed "installation failed". Goal: find root cause and fix surgically.

---

## Root Cause (Confirmed)

### Primary Bug: `.mpi_engine_version` file outlives the engine folder

**File:** `routes/engine.js` — `GET /engine/version-check` (line 271–291)

The version check ONLY looks for `engine/.mpi_engine_version`. It does NOT verify that ComfyUI actually exists on disk.

When the user deleted the **ComfyUI folder** (i.e., `engine/ComfyUI_windows_portable/`), the `.mpi_engine_version` file in `engine/` survived. So:

- `/engine/version-check` → `installedVersion` = valid version string → `needsInstall: false`  
- `shell.js` skips `show('installing')`, falls through to `deps-status`  
- `/engine/deps-status` → all deps missing → `needsDepsInstall: true`  
- `shell.js` calls `_engineInstall.el.show('repairing')`  
- Repair mode skips the path input + Install button, goes straight to progress  
- It then tries to download just the UW deps (not the engine itself) — fails or partially succeeds

**This is why the user saw partial install + failure: the app thought the engine was already installed and only tried to install deps, not ComfyUI itself.**

### Secondary Bug: Double `engine:error` broadcast

**File:** `routes/engine.js` lines 242–267

In `_runEngineDownload`:
```js
throw err; // line 244 — re-throws into outer try/catch
// outer catch broadcasts engine:error (line 253-254)
```

Plus at the call site (line 265–267):
```js
_runEngineDownload(engineType).catch(e => {
    broadcastEngineEvent('engine:error', { error: e.message }); // second broadcast
});
```

If UW dep install fails, `engine:error` is broadcast **twice**, causing two error popups or double error handler firing.

### Tertiary Bug: UW dep failure kills the entire engine install

**File:** `routes/engine.js` lines 242–245

```js
throw err; // surface as engine:error
```

If UW dep download fails (network error, SHA256 mismatch), the entire engine install is marked as failed — even though ComfyUI itself installed successfully. The user has to redo the full engine install. This is wrong: ComfyUI working is the primary goal; UW deps can be repaired.

---

## Fix Plan

### Fix 1 — PRIMARY: Make `version-check` verify ComfyUI actually exists

**File:** `routes/engine.js` — `GET /engine/version-check`

Add a check that `python_embeded/python.exe` exists (same check used by `GET /engine/status`). If the version stamp exists but ComfyUI doesn't, treat it as `needsInstall: true` and delete the stale version file.

```js
// After reading installedVersion, verify engine binary exists:
let engineExists = false;
if (installedVersion !== null) {
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    let pythonPath = path.join(ENGINE_ROOT, 'python_embeded', 'python.exe');
    if (!(await fs.pathExists(pythonPath))) {
        pythonPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'python_embeded', 'python.exe');
    }
    engineExists = await fs.pathExists(pythonPath);
    if (!engineExists) {
        // Stale version stamp — remove it so next install writes fresh
        await fs.remove(versionFile).catch(() => {});
        installedVersion = null; // treat as fresh install
    }
}
```

This makes `needsInstall: true` whenever the engine binaries are actually absent, regardless of the version stamp.

### Fix 2 — SECONDARY: Non-fatal UW dep failure

**File:** `routes/engine.js` — `_runEngineDownload`, step 6 block

Change `throw err` to log + broadcast warning, then continue to `engine:complete`. Engine install succeeded; UW deps can be repaired separately.

```js
} catch (err) {
    logger.error('engine', `UW deps install failed: ${err.message}`);
    broadcastEngineEvent('engine:uw-installing', {
        status: 'Some dependencies could not be installed. You can repair them later.'
    });
    // Don't throw — engine itself installed successfully
}
```

### Fix 3 — SECONDARY: Remove double `engine:error` broadcast

**File:** `routes/engine.js` — `router.post('/engine/download')` call site

The `.catch` at the call site re-broadcasts `engine:error` when `_runEngineDownload`'s own catch block already did it. Remove the re-broadcast:

```js
// BEFORE:
_runEngineDownload(engineType).catch(e => {
    logger.error('engine', 'Engine download failed', e);
    broadcastEngineEvent('engine:error', { error: e.message });
});

// AFTER:
_runEngineDownload(engineType).catch(e => {
    logger.error('engine', 'Uncaught engine download error (already handled)', e);
    // engine:error already broadcast by _runEngineDownload's internal catch
});
```

---

## Files to Modify

1. **`routes/engine.js`** — Three changes:
   - `GET /engine/version-check`: verify python.exe exists, clear stale version stamp
   - `_runEngineDownload` step 6: don't throw on UW dep failure
   - `router.post('/engine/download')` `.catch`: remove duplicate `engine:error` broadcast

---

## Verification

1. Confirm `engine/.mpi_engine_version` exists but `engine/ComfyUI_windows_portable/` does not
2. Launch app → `/engine/version-check` should now return `needsInstall: true`
3. App shows install modal with path input + Install button (setup phase)
4. Click Install → engine downloads → progress bar → UW deps install
5. Even if a UW dep fails, app shows "Complete!" and boots
6. Check `logs/app.log` — single `engine:error` at most, UW dep failures logged as warnings

---

## Out of Scope

- SSE reconnection resilience (separate concern, not confirmed cause here)
- `startUniversalWorkflowInstall` path inconsistency (pre-existing, not causing today's failure)
