# Handoff: Engine Install & UW Deps Flow

**Session Date:** 2026-04-19  
**Status:** Core fixes complete; testing in progress; new issues discovered

---

## What Was Fixed This Session

### 1. Version Check Now Validates Binary Existence
**File:** `routes/engine.js` — `GET /engine/version-check`

**Problem:** Version stamp (`.mpi_engine_version`) outlived the engine folder. User deleted `ComfyUI_windows_portable/` but stamp remained, so app thought engine was current and tried to repair instead of reinstall.

**Fix:** Check that `python_embeded/python.exe` actually exists. If stamp exists but binary is missing, delete stamp and return `needsInstall: true`.

**Code Location:** Lines 281–293 in engine.js

### 2. UW Dep Failure Is Non-Fatal
**File:** `routes/engine.js` — `_runEngineDownload` step 6

**Problem:** If any UW dep failed to download/install, the entire engine install was marked failed.

**Fix:** Catch UW dep errors, broadcast warning to user, allow engine to complete successfully. UW deps can be repaired separately via `/engine/repair-deps`.

**Code Location:** Lines 245–249 in engine.js

### 3. Removed Double Error Broadcast
**File:** `routes/engine.js` — `router.post('/engine/download')`

**Problem:** `engine:error` was broadcast twice (once in `_runEngineDownload` catch, once at call site).

**Fix:** Removed the duplicate broadcast at call site. Let internal catch handle all errors.

**Code Location:** Lines 267–269 in engine.js

### 4. Fixed Path Parsing in `getCustomRoot()`
**File:** `routes/shared.js` — `getCustomRoot()`

**Problem:** YAML `base_path` had escaped quotes (`\"`) in the returned value, causing "invalid characters in path" errors during download.

**Fix:** Strip surrounding quotes from the base_path value after parsing.

**Code Location:** Lines 361–376 in shared.js

### 5. Fixed DownloaderHelper Resume Logic
**File:** `routes/downloadManager.js` — `ResumableDownloader._ensureDownloader()`

**Problem:** `override: true` conflicted with `resume: true`, causing partial downloads to restart instead of resume.

**Fix:** Removed `override: true` flag. Now partial files resume correctly.

**Code Location:** Line 127 in downloadManager.js

### 6. Fixed DepJob LocalPath Always Updated
**File:** `routes/downloadManager.js` — `startUniversalWorkflowInstall`

**Problem:** If a dep was previously queued, its `localPath` wasn't updated even if custom root changed. Caused downloads to go to wrong folder on subsequent attempts.

**Fix:** Always update `depJob.localPath` before checking if installed.

**Code Location:** Lines 697–703 in downloadManager.js

### 7. Fixed YAML Preservation on Repair
**File:** `routes/engine.js` — step 5 (Write YAML)

**Problem:** `_runEngineDownload` always wrote YAML pointing to `mpi_models`, overwriting custom path from `/comfy/set-path`.

**Fix:** Only write YAML if it doesn't exist. On repair, preserve existing YAML (which has user's custom path).

**Code Location:** Lines 215–233 in engine.js

### 8. Updated User Messages
**Files:** `routes/downloadManager.js`, `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js`

**Changes:** 
- "Preparing universal workflow dependencies..." → "Installing dependencies..."
- Added 30-minute timeout to UW deps wait loop (prevent infinite hangs on slow connections)
- Added debug logging for path resolution and download starting

### 9. Added Timeout Protection
**File:** `routes/downloadManager.js` — `startUniversalWorkflowInstall`

**Problem:** If downloads stalled, the wait loop would hang forever.

**Fix:** Added 30-minute timeout that rejects with error if still pending.

**Code Location:** Lines 727–755 in downloadManager.js

---

## Current Test Status

✅ **Working:**
- Fresh install detects `needsInstall: true` correctly
- Engine downloads and installs
- UW deps download to user-defined folder (after `/comfy/set-path` called)
- Repair flow preserves existing YAML

❌ **Discovered Issue (NEW):**
Model downloader shows all models as "partially installed" even though only SDXL-realistic exists locally (6GB of 7GB). Progress bar shows "0 MB / 7 GB" when file already exists.

**Root Cause:** Likely the same path resolution issue — model downloader is checking wrong location or not detecting existing files in custom folder.

---

## Next Session Tasks

### 1. Fix Model Downloader Path Detection
Check `js/services/comfyController.js` or model download logic:
- Verify it reads `extra_model_paths.yaml` correctly
- Ensure it checks the custom root folder for existing files
- Should show SDXL-realistic as "6 GB / 7 GB installed" instead of "0 MB / 7 GB"

**Likely files:** `js/services/comfyController.js`, model registry endpoints

### 2. Aggregate Engine + UW Deps Progress
**Current flow:** Engine downloads → extracts → **then** UW deps download (sequential)  
**Desired flow:** Engine + UW deps download in parallel with aggregated progress bar

**Changes needed:**
- In `_runEngineDownload`, call `startUniversalWorkflowInstall` without awaiting engine completion
- Merge `__universal_workflow__` modelJob progress with engine progress in SSE
- Keep extraction/installation sequential
- Update component to handle combined progress

**Files to modify:**
- `routes/engine.js` — restructure step 6 to start UW deps earlier
- `routes/downloadManager.js` — adjust progress reporting
- `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` — merge progress displays

### 3. Update CLAUDE.md & Documentation
After verifying fixes, update:
- `.claude/rules/comfy_engine.md` — document the fresh install → repair → settings flow
- `.claude/rules/downloads.md` — document ResumableDownloader behavior and path handling
- `docs/project-integrity.md` — note the extra_model_paths.yaml format and timing

---

## Files Modified This Session

1. `routes/engine.js` — Version check, YAML write, error handling
2. `routes/downloadManager.js` — Path resolution, resume logic, timeout, logging
3. `routes/shared.js` — Quote stripping in path parsing
4. `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` — User message update
5. `nimbalyst-local/plans/comfyui-installation-should-eventual-prism.md` — Debugging plan (completed)

---

## Key Insights

- **Path handling is critical**: Quotes in YAML, path normalization, custom root detection must all align
- **YAML timing matters**: Created before engine extraction, must be preserved during repair
- **UW deps are non-blocking**: Failure to install deps shouldn't block engine functionality
- **Download resume needs `override: false`**: Otherwise partial files restart from scratch

---

## Testing Checklist for Next Session

- [ ] Model downloader shows correct installation status for all models
- [ ] SDXL-realistic shows "6 GB / 7 GB" instead of "0 MB / 7 GB"
- [ ] Delete engine folder → fresh install works end-to-end
- [ ] Delete ComfyUI folder only → repair works (preserves path)
- [ ] Change path in settings → YAML updates and deps install to new location
- [ ] Parallel progress aggregation works for engine + UW deps
