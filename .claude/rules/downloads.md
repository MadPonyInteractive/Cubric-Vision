# Download Manager Rules

> **AI INSTRUCTION:** All model downloads, uninstalls, and engine download pause/resume must go through the download manager. Never bypass it with raw `fetch` or shell `curl`.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves model downloads, uninstalls, or engine downloads.

**Frontend entry point:** `js/services/downloadService.js` — a singleton. Always use `downloadService.start/pause/resume/cancel/uninstall()`, never raw `fetch` directly.

**Backend router:** `routes/downloadManager.js` — manages `ResumableDownloader` instances, job maps, and SSE broadcast. The `.part` file pattern is used for resume — never delete these manually.

**SHA256 verification is automatic.** Each dep can declare a `sha256` in the registry. The backend verifies on completion and marks `failed` on mismatch. Do not bypass or override this. **Exception: `custom_nodes` deps must NOT have `sha256` set** — GitHub branch archive zips regenerate on every commit, making pinned hashes permanently stale. Leave `sha256` as `null`/omitted for all `custom_nodes` type deps.

**`comfyNeedsRestart`:** After custom node extraction completes, the backend broadcasts `comfy:needs-restart` via SSE. `downloadService.js` receives this and sets `state.comfyNeedsRestart = true`. `ensureServerRunning()` in `comfyController.js` checks this flag BEFORE the early-return on `running && ready` — if set and ComfyUI is running, it auto-restarts. Do not skip or reorder this check.

**custom_nodes path:** The `extra_model_paths.yaml` does NOT remap the `custom_nodes` type. All custom node deps (ComfyUI-MpiNodes, ComfyUI-UltimateSDUpscale, etc.) use the engine default path `{engine}/custom_nodes/`, regardless of `customRoot`. Do not attempt to redirect custom_nodes downloads to `customRoot/custom_nodes/` — the YAML doesn't support this mapping, and the engine's Python needs to find custom nodes in its own `custom_nodes` folder.

**State keys:** `state.downloadJobs[]` and `state.downloadQueueActive`. Components should read these, not duplicate them.

**Events:** All download state transitions are broadcast via SSE to `downloadService._connectSSE()` and then re-emitted as `Events` (`download:started`, `download:progress`, `download:complete`, `download:failed`, `download:paused`, `download:resumed`, `download:cancelled`, `download:uninstalled`, `download:installing`). Components subscribe via `Events.on()`.

**Shutdown:** `cancelAllDownloads()` is exported from `routes/downloadManager.js` and called on app shutdown to abort active downloads gracefully.

## Single SSE Connection Architecture

**CRITICAL ARCHITECTURAL PATTERN:** `downloadService.js` is the ONLY component that opens an EventSource connection. All other frontend code subscribes to events via the Events bus.

**How it works:**
1. `downloadService._connectSSE()` opens `/comfy/downloads/stream` (one connection, shared)
2. SSE events from the backend include: `download:*` (model downloads) and `engine:*` (engine install/upgrade)
3. `downloadService` bridges ALL SSE events to the `Events` bus via `Events.emit()`
4. Components subscribe via `Events.on()` — no direct EventSource connections

**Engine events bridged:** `engine:downloading`, `engine:extracting`, `engine:patching`, `engine:upgrade-status`, `engine:uw-installing`, `engine:complete`, `engine:error`

**Why:** Prevents multiple EventSource connections competing for the same stream, ensures atomic state updates, simplifies cleanup, and makes event flow auditable through the Events bus.

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **Never Raw Fetch for Downloads:** Always use `downloadService.start/pause/resume/cancel/uninstall()`. Raw `fetch` bypasses the SSE sync and state management.
2. **Never Delete \****`.part`**\*\* Files:** The resume mechanism depends on `.part` files written by `node-downloader-helper`. Deleting them breaks resume.
3. **Never Skip \****`comfyNeedsRestart`**\*\*:** After custom node install, ComfyUI must be restarted. `ensureServerRunning()` handles this automatically — do not suppress or bypass it.
4. **Always Use Events for Download UI:** Components must subscribe to `download:*` events via `Events.on()`, not poll `state.downloadJobs` directly. Store the unsubscribe function and call it on cleanup.
5. **Never Open a Second EventSource:** Only `downloadService._connectSSE()` opens `/comfy/downloads/stream`. All other code subscribes via `Events.on()` to events already bridged by `downloadService`.

---

## Engine Download & Engine-Deps Parallel Flow

**Engine downloads run parallel with engine-level dependency downloads** for better UX. Engine-level deps are identified by `installOnEngine: true` in `dependencies.js` — they cover all universal workflow needs in one place.

1. **Combined size calculation:** `routes/shared.js` exports `getUniversalWorkflowDepsTotalSize()` which HEAD-requests each `installOnEngine` dep URL to get exact bytes
2. **Parallel firing:** `routes/engine.js` fires both engine download AND `startUniversalWorkflowInstall(depIds, true, true)` immediately
3. **Custom node install delayed:** The third parameter `true` skips custom node pip install until after engine extraction
4. **Frontend aggregation:** `MpiEngineInstall.js` receives both `engine:downloading` and `download:progress` events and aggregates them into a single unified progress bar
5. **Custom node finish:** After engine extraction, `finishCustomNodeInstall(modelJob, true)` is called to run pip install with Python now available

**Adding a new universal workflow:** No dependency changes needed in `universal_workflows.js`. If the new workflow requires a dep not yet marked `installOnEngine: true` in `dependencies.js`, add the flag there — it is automatically included in future engine installs.

**Adding a custom_node dep to an image/video model:** If a `custom_nodes` dep is referenced by any entry in `models.js`, it MUST be marked `installOnEngine: true` in `dependencies.js`. Otherwise a fresh engine install leaves the custom node missing, `POST /comfy/models/check` reports the model as not installed, and the model manager pops up on project entry even though the user installed nothing extra. The engine install is the only path that handles `custom_nodes` deps proactively — regular model install only fetches them as a side effect of installing a specific model.

---

## 🛠️ Implementation Patterns

### Starting a Download (Frontend)
```javascript
import { downloadService } from '../../services/downloadService.js';
import { Events } from '../../events.js';

setup: () => {
    const unsub = Events.on('download:complete', ({ modelId }) => {
        // reSyncInstalledModels() is called automatically by downloadService
    });
    el.destroy = () => unsub();
    // ...
    await downloadService.start(modelId, dependencies);
}
```

### Pause / Resume / Cancel
```javascript
await downloadService.pause(modelId);
await downloadService.resume(modelId);
await downloadService.cancel(modelId);
```

### Monitoring Progress
```javascript
const unsub = Events.on('download:progress', ({ modelId, progress, speed }) => {
    // progress is 0..1, speed is formatted string e.g. "2.5 MB/s"
});
```

### Uninstalling
```javascript
await downloadService.uninstall(modelId, dependencies);
// Emits download:uninstalled after backend confirms file removal
```

---

## Job Data Shapes

```typescript
// DepJob (backend internal)
interface DepJob {
    id: string;
    url: string;
    localPath: string | null;
    status: 'queued' | 'downloading' | 'complete' | 'failed' | 'paused' | 'cancelled';
    downloadedBytes: number;
    totalBytes: number;
    refCount: number;
    error: string | null;
    sha256Expected: string | null;
}

// DownloadJob (state.downloadJobs[])
interface DownloadJob {
    id: string;
    modelId: string;
    status: 'queued' | 'downloading' | 'paused' | 'complete' | 'failed' | 'installing';
    totalBytes: number;
    downloadedBytes: number;
    speed: string;       // formatted e.g. "2.5 MB/s"
    progress: number;     // 0..1
    deps: DepJob[];
    installCustomNodes: boolean;
    error?: string;
}
```

---

## Engine Download Pause/Resume

The backend also exposes pause/resume for **engine** downloads (distinct from model downloads):
- `POST /engine/pause` — pause active engine download
- `POST /engine/resume` — resume paused engine download

Managed via `registerEngineDownload()` / `clearEngineDownload()` and `_activeEngineDownloader` in `routes/downloadManager.js`.
