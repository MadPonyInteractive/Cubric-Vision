# Download Manager Rules

> **AI INSTRUCTION:** All model downloads, uninstalls, and engine download pause/resume must go through the download manager. Never bypass it with raw `fetch` or shell `curl`.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves model downloads, uninstalls, or engine downloads.

**Frontend entry point:** `js/services/downloadService.js` — a singleton. Always use `downloadService.start/pause/resume/cancel/uninstall()`, never raw `fetch` directly.

**Backend router:** `routes/downloadManager.js` — manages `ResumableDownloader` instances, job maps, completion sidecars, and SSE broadcast. NDH writes directly to the final filename; Cubric marks in-progress managed downloads with `<file>.cubricdl` and treats a file as installed only when `exists && no sidecar`.

**SHA256 verification is automatic.** Each dep can declare a `sha256` in the registry. The backend verifies on completion and marks `failed` on mismatch. Do not bypass or override this. **Exception: `custom_nodes` deps must NOT have `sha256` set** — GitHub branch archive zips regenerate on every commit, making pinned hashes permanently stale. Leave `sha256` as `null`/omitted for all `custom_nodes` type deps.

**`comfyNeedsRestart`:** After custom node extraction completes, the backend broadcasts `comfy:needs-restart` via SSE. `downloadService.js` receives this and sets `state.comfyNeedsRestart = true`. `ensureServerRunning()` in `comfyController.js` checks this flag BEFORE the early-return on `running && ready` — if set and ComfyUI is running, it auto-restarts. Do not skip or reorder this check.

**custom_nodes path:** The `extra_model_paths.yaml` does NOT remap the `custom_nodes` type. All custom node deps (ComfyUI-MpiNodes, ComfyUI-UltimateSDUpscale, etc.) use the engine default path `{engine}/custom_nodes/`, regardless of `customRoot`. Do not attempt to redirect custom_nodes downloads to `customRoot/custom_nodes/` — the YAML doesn't support this mapping, and the engine's Python needs to find custom nodes in its own `custom_nodes` folder.

**State keys:** `state.downloadJobs[]` and `state.downloadQueueActive`. Components should read these, not duplicate them.

**Events:** All download state transitions are broadcast via SSE to `downloadService._connectSSE()` and re-emitted on the Events bus. Components subscribe via `Events.on()`. Full event list in `docs/events.md`.

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
2. **Never Delete \****`.cubricdl`**\*\* Markers Casually:** Model resume and installed-state safety depend on `<file>.cubricdl` sidecars. They are created on download start and removed only after verified completion, explicit cancel, uninstall, or checksum failure cleanup.
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

**Custom_node deps — universal vs per-model (do NOT conflate):**

- **Universal nodes** (needed by the UNIVERSAL workflows — interpolate, upscale, resize, auto-mask — that every install must serve) MUST be marked `installOnEngine: true`. They are baked in with the engine so a fresh install can run any universal workflow with zero extra install. This is the ONLY case for `installOnEngine: true`. Examples: `ComfyUI-MpiNodes`, `comfyui-videohelpersuite`, `comfyui-frame-interpolation`, `comfyui-kjnodes`.
- **Per-model nodes** (used only by a specific model's workflows) MUST NOT set `installOnEngine: true`. Put them in that model's `dependencies[]` (flat) or an `operations.<op>.deps[]` (op-keyed) so they install WHEN the model/op installs — and on a Pod, route to the wrapper for volume install (see `routes/remoteModels.js` `_isImageResident`), so a new model never forces an engine/image rebuild. Precedents: `ComfyUI-PainterI2Vadvanced` (Wan i2v op), `ComfyUI-LTXVideo` (LTX model). Setting `installOnEngine: true` on one of these is a BUG — it pulls the node (and its pip install) into EVERY fresh engine even when the model isn't installed.

A per-model node is NOT missing after a fresh engine install because the model that needs it has not been installed yet; installing the model fetches it. The universal-vs-per-model split is the whole point — only universal needs proactive engine-time install.

---

## Operation-selectable models — the resolver chokepoint (MPI-122)

A model declares its deps in ONE of two shapes (see `docs/data.md` § resolveModelDeps):
- **Flat** (all image models): `dependencies: string[]`.
- **Operation-keyed** (e.g. Wan 2.2 `wan-22`): `commonDeps: string[]` + `operations: { <opKey>: { deps: string[] } }`, and NO flat `dependencies`. The user picks which operations to install in the model manager.

**The download lifecycle is frozen and op-blind.** `downloadService.start(modelId, deps)` and `uninstall(modelId, deps)` ALWAYS take a RESOLVED FLAT dep array. Operations are collapsed to that flat array by `js/data/modelConstants/resolveModelDeps.js` at the call site — BEFORE the lifecycle. Jobs/SSE/refcounts/`.cubricdl` markers never learn about operations; jobs stay keyed by `modelId`. **Do NOT add a per-operation download job, a second SSE channel, or operation-level refcounts.**

**Which resolver call to use:**
- **Install** → `resolveDeps(model, selectedOps)` (the user's op selection; `null` = all selectable ops = fresh full install).
- **Whole-model uninstall** + **install-status checks** (`/comfy/models/check`) → `resolveFullUniverse(model)` so no op payload is orphaned and partial state is computed against the complete universe.
- **Backend shared-dep protection** (`_findOtherModelsUsingDep`, `_remoteSharedDepIds` in `routes/downloadManager.js`; `getInstalledModelNodeDeps` in `routes/shared.js`) MUST resolve every OTHER model's full universe — never read a `.dependencies` field, which no longer exists on op-keyed models. Otherwise a shared/op-specific dep another installed model needs gets deleted (e.g. uninstalling Wan I2V trashing the VAE/text-encoder T2V also uses).

**Never read `model.dependencies` directly.** Use the resolver. A flat model is treated as `commonDeps = dependencies` with no operations, so one code path covers both shapes.

**Per-operation install AND uninstall.** The model-download page lets the user toggle ops on/off on an installed model:
- Adding an op (Update / Install) downloads only its missing resolved deps.
- Removing an op (Update, after a confirm) calls `downloadService.uninstall(modelId, deps)` with `deps` = the removed op's resolved deps MINUS any dep still used by an op that REMAINS installed/selected (incl. commonDeps, which any remaining op keeps). This intra-model subtraction is done CLIENT-SIDE — the backend's shared-dep guard only protects across OTHER models (it excludes the target model), so it would not stop you deleting a dep a sibling op of the same model still needs.
- The button reads Install (0 installed) / Update (draft ≠ installed) / Uninstall (installed, no change). The op draft persists in `state.s_modelOpDraftByModel`.
No change to the download/refcount/SSE contract — per-op uninstall is the same `uninstall()` call with a narrower dep list.

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

`GET /comfy/downloads/active` reports active model downloads separately from engine downloads for Electron quit warnings. Model downloads are resumable across app restart when a sidecar-marked partial exists; engine archive downloads still restart from scratch by design.
