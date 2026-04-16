# Plan D: Engine Provisioning & Version Upgrade

**Status:** Ready for implementation — implement BEFORE Plan A
**Created:** 2026-04-16
**Depends on:** Nothing — this is the foundation everything else builds on
**Required by:** Plan A (COMFY_VERSION constant only makes sense once engine versioning exists)

---

## Context

The ComfyUI engine provisioning backend (`routes/engine.js`) is fully functional — it can download the portable bundle, extract it, and patch it. However, no frontend code calls it. If a user runs the app for the first time without the engine installed, they get a generic 500 error and a broken experience.

Additionally, there is no strategy for upgrading ComfyUI when a new app version requires it. Wiping the engine folder would destroy user models if they are stored in the default location inside the ComfyUI portable bundle.

This plan fixes both problems:
1. **First-run:** Detect missing engine on startup, show a blocking install modal with download progress
2. **Upgrade:** When app version requires a new ComfyUI, safely upgrade without touching user models
3. **Model safety:** Move models outside the engine folder from first install, so the engine can always be wiped freely

---

## Critical Files to Read Before Implementing

| File | Role | Key lines |
| --- | --- | --- |
| `js/shell.js` | Boot sequence (`_bootApp`) + singleton modal mounts | 34–42, 118–157 |
| `routes/engine.js` | `GET /engine/status`, `POST /engine/download` | Full file |
| `routes/comfy.js` | `POST /comfy/set-path` — writes extra_model_paths.yaml | 168–219 |
| `routes/system.js` | `POST /choose-folder` — native Windows folder picker | 59–80 |
| `routes/downloadManager.js` | SSE broadcast pattern to reuse | 190–203 |
| `js/services/downloadService.js` | Frontend SSE listener pattern | 93–137 |
| `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` | Models path picker UI pattern to reuse | Full file |
| `js/components/Compounds/MpiStartingComfy/MpiStartingComfy.js` | Blocking modal pattern to follow | Full file |
| `js/components/Primitives/MpiProgressBar/MpiProgressBar.js` | Progress bar component | Full file |
| `js/shell/preloadStyles.js` | Register new component CSS here | Full file |
| `js/components/types.js` | Document new component props here | Full file |
| `dev_configs/system_dependencies.json` | Engine download URL + filename — add `version` field here | Full file |

---

## Architecture Decisions

**Version source of truth:** Add a `version` field to `dev_configs/system_dependencies.json` (e.g. `"version": "0.18.0"`). This is the required ComfyUI version for the current app build. `routes/engine.js` reads this at runtime — no hardcoded strings, no regex parsing of URLs. Once Plan A ships, `COMFY_VERSION` from `js/core/appVersion.js` becomes the canonical source and must match this field (the version bump skill keeps both in sync).

**User chooses models location before install:** The install modal shows a models path picker before the download begins. Pre-filled with `engine/mpi_models/` as the safe default. User can Browse (reuses `POST /choose-folder` → native Windows dialog) to set any path they want (e.g. `D:/AI/Models`). Path is saved via `POST /comfy/set-path` before download starts. This reuses the identical UI pattern from `MpiSettings.js`.

**Model safety from day one:** Models always live outside `ComfyUI_windows_portable/` — either at the user-chosen path or the default `engine/mpi_models/`. `extra_model_paths.yaml` is written before the engine download begins, so ComfyUI finds models correctly on first start. The engine portable bundle can be wiped and reinstalled at any time without touching user models.

**Engine version tracking:** After every successful install or upgrade, write `engine/.mpi_engine_version` containing the installed version string (read from `system_dependencies.json`). On startup, `GET /engine/version-check` compares this file against the `version` field in `system_dependencies.json`. If mismatch → trigger upgrade flow. If file missing → engine not installed → trigger install flow.

**Blocking modal pattern:** Follow `MpiStartingComfy` — direct portal to `document.body`, bypasses Overlays queue. Engine installation is a system-level event that must show regardless of app state.

**SSE for progress:** Reuse the existing `/comfy/downloads/stream` SSE endpoint — it is already open and the frontend already connects to it via `downloadService.js`. The engine download broadcasts `engine:*` namespaced events (`engine:downloading`, `engine:extracting`, `engine:patching`, `engine:complete`, `engine:error`, `engine:upgrade-status`) on the same `_sseClients` Set in `routes/downloadManager.js`. No new SSE endpoint needed. `MpiEngineInstall` component opens an `EventSource('/comfy/downloads/stream')` and filters for `engine:*` events. Do NOT create a separate `/engine/stream` endpoint.

**Non-blocking download:** `POST /engine/download` must respond immediately (`res.json({ status: 'started' })`) and run the download + extraction asynchronously. Progress is reported via SSE. The current implementation is fully blocking — this must be fixed.

**Error logging:** Use the existing `logger` from `routes/logger.js` (already imported in `routes/engine.js`). Frontend errors go via `clientLogger.js` → `POST /log` → `app.log`. No new logging infrastructure needed.

**Upgrade model migration:** If user has no `extra_model_paths.yaml` at upgrade time (legacy user with models still inside the engine folder): move `engine/ComfyUI_windows_portable/ComfyUI/models/` → `engine/mpi_models/` silently before wiping. After reinstall, write `extra_model_paths.yaml` pointing there. One-time migration — permanently safe thereafter.

---

## Step 1: Update `dev_configs/system_dependencies.json` — add version field

Add an explicit `version` field to the engine object so `routes/engine.js` can read it without parsing the URL:

```json
{
  "engine": {
    "name": "ComfyUI Portable",
    "version": "0.18.0",
    "url": "https://github.com/Comfy-Org/ComfyUI/releases/download/v0.18.0/ComfyUI_windows_portable_nvidia_cu126.7z",
    "filename": "ComfyUI_windows_portable.7z",
    "extractDir": "engine"
  },
  ...
}
```

The version bump skill (Plan C) keeps `version`, the URL, and `COMFY_VERSION` in `appVersion.js` all in sync when cutting a release.

---

## Step 2: Update `routes/downloadManager.js` — export broadcast for engine use

Add a named export so `routes/engine.js` can broadcast `engine:*` events on the existing SSE stream without creating a new endpoint. No new SSE infrastructure needed — the `/comfy/downloads/stream` endpoint and `_sseClients` Set are already open.

```javascript
// Add to routes/downloadManager.js (near bottom, before module.exports):
function broadcastEngineEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of _sseClients) {
    try { res.write(payload); } catch { _sseClients.delete(res); }
  }
}
// Add to module.exports:
module.exports = { ..., broadcastEngineEvent };
```

## Step 3: Update `routes/engine.js` — non-blocking download + SSE progress

Import `broadcastEngineEvent` from `downloadManager`. Make `POST /engine/download` respond immediately and run async:

```javascript
const { broadcastEngineEvent } = require('./downloadManager');

router.post('/engine/download', async (req, res) => {
  res.json({ success: true, status: 'started' }); // respond immediately — never block

  _runEngineDownload(req.query.type || 'comfy').catch(e => {
    logger.error('engine', 'Engine download failed', e);
    broadcastEngineEvent('engine:error', { error: e.message });
  });
});

async function _runEngineDownload(type) {
  broadcastEngineEvent('engine:downloading', { progress: 0, downloadedBytes: 0, totalBytes: 0 });
  // ... download with progress callbacks that emit engine:downloading events ...
  broadcastEngineEvent('engine:extracting', { status: 'extracting' });
  // ... extract ...
  broadcastEngineEvent('engine:patching', { status: 'patching' });
  // ... post-install actions (write extra_model_paths.yaml, version file) ...
  broadcastEngineEvent('engine:complete', { success: true });
}
```

SSE events on existing `/comfy/downloads/stream`:
- `engine:downloading` — `{ progress, downloadedBytes, totalBytes, speed }`
- `engine:extracting` — `{ status: 'extracting' }`
- `engine:patching` — `{ status: 'patching' }`
- `engine:complete` — `{ success: true }`
- `engine:error` — `{ error: message }`
- `engine:upgrade-status` — `{ status: string }` (upgrade phase messages)

---

The post-install actions (write `extra_model_paths.yaml` pointing to user-chosen models path, write `.mpi_engine_version`) run inside `_runEngineDownload()` after extract and patch complete. Version string is read from `system_dependencies.json` — no hardcoded value.

---

## Step 4: Add `POST /engine/upgrade` route to `routes/engine.js`

Orchestrates the full upgrade sequence:

```javascript
router.post('/engine/upgrade', async (req, res) => {
  try {
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const portableDir = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable');
    const mpiModelsDir = path.join(ENGINE_ROOT, 'mpi_models');
    const extraConfigPath = path.join(portableDir, 'ComfyUI', 'extra_model_paths.yaml');

    // 1. Check if models are inside engine (no custom root set)
    const hasCustomRoot = await fs.pathExists(extraConfigPath);
    if (!hasCustomRoot) {
      broadcastEngineEvent('engine:upgrade-status', { status: 'Moving models to safe location...' });
      const defaultModels = path.join(portableDir, 'ComfyUI', 'models');
      if (await fs.pathExists(defaultModels)) {
        await fs.move(defaultModels, mpiModelsDir, { overwrite: false });
      }
    }

    // 2. Wipe ComfyUI portable (models are now safe)
    broadcastEngineEvent('engine:upgrade-status', { status: 'Removing old engine...' });
    await fs.remove(portableDir);

    // 3. Download and install new version (reuses existing download route logic)
    // Respond immediately — frontend listens on SSE for completion
    res.json({ success: true, status: 'upgrade-started' });

    // Run download async (SSE reports progress)
    await _runEngineDownload(); // extracted helper from POST /engine/download

  } catch (e) {
    logger.error('system', 'Engine upgrade failed', e);
    broadcastEngineEvent('engine:error', { error: e.message });
    if (!res.headersSent) res.status(500).json({ success: false, error: e.message });
  }
});
```

---

## Step 5: Add `GET /engine/version-check` route to `routes/engine.js`

Returns both installed and required versions so the frontend can decide what to show. Reads required version from `system_dependencies.json` — no hardcoded strings:

```javascript
router.get('/engine/version-check', async (req, res) => {
  const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
  const versionFile = path.join(ENGINE_ROOT, '.mpi_engine_version');
  const config = await fs.readJson(SYS_DEPS_PATH);
  const requiredVersion = config.engine.version; // from system_dependencies.json

  const installedVersion = (await fs.pathExists(versionFile))
    ? (await fs.readFile(versionFile, 'utf8')).trim()
    : null;

  res.json({
    installed: installedVersion,
    required: requiredVersion,
    needsInstall: installedVersion === null,
    needsUpgrade: installedVersion !== null && installedVersion !== requiredVersion,
  });
});
```

---

## Step 6: Create `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js`

New Compound. Follows `MpiStartingComfy` pattern — direct portal to `document.body`, full-screen blocking overlay. Shows during first install and during upgrades.

**Two-phase UI for first install:**

**Phase 1 — Setup (shown before download starts):**
- Title: "Welcome — let's set up ComfyUI"
- Models folder path picker: text input pre-filled with `engine/mpi_models/` default + "Browse" button
  - Browse button calls `POST /choose-folder` (same pattern as `MpiSettings.js`)
  - Input is editable directly
- "Install" button — triggers `POST /comfy/set-path` with chosen path, then `POST /engine/download`
- Note: "You can change this path later in Settings"

**Phase 2 — Progress (shown after Install clicked):**
- Status text + progress bar (reuses `MpiProgressBar` primitive with `interactive: false`)
- Speed and size info (e.g. "1.2 GB / 3.4 GB — 15 MB/s")
- No cancel button — download must complete

**For upgrades (****`mode: 'upgrading'`****):** Skip Phase 1 (path already set), go straight to progress. Show note: "Your models are safe — only the ComfyUI engine is being updated."

**States:**
- `setup` — Phase 1: path picker + install button (first install only)
- `downloading` — Phase 2: progress bar active
- `upgrading` — Phase 2 with upgrade messaging (no path picker)
- `error` — error message + retry button

**API:**
```javascript
el.show(mode)          // 'install' | 'upgrade'
el.hide()
el.setProgress(data)   // { progress, speed, downloadedBytes, totalBytes }
el.setStatus(text)     // e.g. 'Extracting...'
el.setError(message)
```

**SSE wiring (internal, connects after Install clicked):**

Connects to the existing `/comfy/downloads/stream` endpoint — NOT a new endpoint. Filters for `engine:*` events only:
```javascript
_connectSSE() {
  this._sse = new EventSource('/comfy/downloads/stream'); // existing endpoint
  this._sse.addEventListener('engine:downloading',    (e) => this.setProgress(JSON.parse(e.data)));
  this._sse.addEventListener('engine:extracting',     () => this.setStatus('Extracting...'));
  this._sse.addEventListener('engine:patching',       () => this.setStatus('Finalizing...'));
  this._sse.addEventListener('engine:complete',       () => Events.emit('engine:ready'));
  this._sse.addEventListener('engine:error',          (e) => this.setError(JSON.parse(e.data).error));
  this._sse.addEventListener('engine:upgrade-status', (e) => this.setStatus(JSON.parse(e.data).status));
}
```

**CSS:** `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.css`
Register in `js/shell/preloadStyles.js`.
Document props in `js/components/types.js`.

---

## Step 7: Update `js/shell.js` — boot-time engine check

Add engine install modal singleton and wire engine check into `_bootApp()`:

```javascript
// Add to singleton mounts (lines 34–42):
const _engineInstall = MpiEngineInstall.mount(document.createElement('div'));

// Add to _bootApp(), BEFORE any ComfyUI start logic:
async function _bootApp() {
  handleNavigation(PAGE_LANDING);

  // Check engine status before anything else
  const versionRes = await fetch('/engine/version-check');
  const version = await versionRes.json();

  if (version.needsInstall) {
    // Block app — show install UI, trigger download
    _engineInstall.el.show('installing');
    await fetch('/engine/download', { method: 'POST' });
    // Component listens on SSE for completion, emits engine:ready when done
  } else if (version.needsUpgrade) {
    // Block app — show upgrade UI, trigger upgrade
    _engineInstall.el.show('upgrading');
    await fetch('/engine/upgrade', { method: 'POST' });
  }

  // Wire engine:ready to hide install modal and continue boot
  Events.on('engine:ready', () => {
    _engineInstall.el.hide();
    _continueBootAfterEngine(); // extracted helper: wire comfy events, optional auto-start
  });

  // If engine already current, continue boot immediately
  if (!version.needsInstall && !version.needsUpgrade) {
    _continueBootAfterEngine();
  }
}

function _continueBootAfterEngine() {
  Events.on('comfy:starting', () => _startingComfy.el.show());
  Events.on('comfy:ready',    () => { _startingComfy.el.hide(); loadAssets(); });
  Events.on('comfy:error',    ({ message }) => _startingComfy.el.setError(message));
  Events.on('ui:error',       ({ title, message }) => showError(title, message));
  Events.on('models:open',    () => _modelsModal.el.show());
  Events.on('models:all-installed', () => _modelsModal.el.hide());

  if (localStorage.getItem('mpi_auto_start_comfy') === 'true') {
    import('./services/comfyController.js').then(({ ComfyUIController }) => {
      ComfyUIController.ensureServerRunning();
    });
  }
}
```

---

## Implementation Steps (in order)

- [ ] Update `dev_configs/system_dependencies.json` — add `"version": "0.18.0"` field to engine object
- [ ] Update `routes/downloadManager.js` — export `broadcastEngineEvent()` function using existing `_sseClients` Set
- [ ] Update `routes/engine.js` — import `broadcastEngineEvent` from `downloadManager`
- [ ] Update `routes/engine.js` — make `POST /engine/download` non-blocking (respond immediately, run `_runEngineDownload()` async)
- [ ] Update `routes/engine.js` — emit `engine:*` SSE events via `broadcastEngineEvent` during download + extract phases
- [ ] Update `routes/engine.js` — add post-install actions inside `_runEngineDownload()`: write `extra_model_paths.yaml` to user-chosen path, write `.mpi_engine_version`
- [ ] Update `routes/engine.js` — add `POST /engine/upgrade` route (uses `broadcastEngineEvent`, calls `_runEngineDownload`)
- [ ] Update `routes/engine.js` — add `GET /engine/version-check` route (reads version from `system_dependencies.json`)
- [ ] Create `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` + `.css`
  - Phase 1 (setup): models path picker with Browse button (`POST /choose-folder`) + Install button
  - Phase 2 (progress): `MpiProgressBar` + status text + speed/size info; SSE via `/comfy/downloads/stream`, filters `engine:*` events
  - Upgrade mode: skip Phase 1, go straight to progress with "models are safe" message
- [ ] Register CSS in `js/shell/preloadStyles.js`
- [ ] Document props in `js/components/types.js`
- [ ] Update `js/shell.js` — add `_engineInstall` singleton mount
- [ ] Update `js/shell.js` — add engine version check to `_bootApp()`, extract `_continueBootAfterEngine()`

---

## Verification

1. **Fresh install (no engine):** Start app → engine install modal appears immediately, landing page is blocked → download begins → progress bar updates → "Extracting..." → "Finalizing..." → modal hides → app continues boot normally
2. **`engine/mpi_models/`**** created:** After install, `engine/mpi_models/` exists and `extra_model_paths.yaml` points to it
3. **`.mpi_engine_version`**** written:** `engine/.mpi_engine_version` contains correct version string after install
4. **Engine already installed (current version):** App boots normally, no install modal shown
5. **Upgrade needed:** Change `.mpi_engine_version` to a different string → restart app → upgrade modal shown → old engine wiped → new engine installed → version file updated → app continues
6. **Model safety during upgrade:** Create dummy files in `engine/ComfyUI_windows_portable/ComfyUI/models/` → trigger upgrade → verify files moved to `engine/mpi_models/` and not deleted
7. **Error handling:** Cut network during download → error message shown in modal with retry button

---

## Risk Notes

- `POST /engine/download` is long-running (~2GB download + extraction). The route must respond before the operation completes and communicate via SSE — do not block the HTTP response waiting for completion
- The upgrade wipes `ComfyUI_windows_portable/` — this is destructive. Confirm model move succeeded before wipe
- Custom nodes live inside `custom_nodes/` in the engine. After upgrade, the user must reinstall them via the model manager. Plan D does not auto-reinstall custom nodes (that is a follow-up in Plan C tooling)
- `extra_model_paths.yaml` must survive upgrades — it lives inside `ComfyUI_windows_portable/ComfyUI/` which gets wiped. The upgrade route must re-write it after reinstall (Step 3 handles this)

---

## Implementation Notes (2026-04-16)

### Deviations from Plan

**1. Resumable Downloads**
The plan described using `streamDownload()` from `routes/shared.js` for the engine download. However, this function does not support resumable downloads. Instead, we used the existing `ResumableDownloader` class from `downloadManager.js`, which wraps `node-downloader-helper` and supports:
- Automatic resume on app restart (partial file detection)
- `abort()` and `resume()` methods
- Progress callbacks with speed calculation

Implementation:
- `downloadManager.js` exports `registerEngineDownload(downloader, downloadId)` and `clearEngineDownload()` for tracking active engine downloads
- `downloadManager.js` adds `/engine/pause` and `/engine/resume` routes that use the stored downloader instance
- `engine.js` creates a `ResumableDownloader` instance and registers it via `registerEngineDownload()`

**2. localStorage for Models Path**
The plan specified the models folder path picker but did not address persistence. Added localStorage so the user's chosen path is remembered across sessions:
- Key: `'mpi_comfy_root_path'`
- Default: `'engine/mpi_models/'`
- Saved on: Browse button click, Install button click
- Loaded on: Component mount

**Note:** A single source of truth for localStorage keys should be established in a future plan before dependent plans (e.g., Plan A) are implemented.
