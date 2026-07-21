# Download Manager Rules

> **AI INSTRUCTION:** All model downloads and uninstalls must go through the download manager. Never bypass it with raw `fetch` or shell `curl`. Resume contract (MPI-317): user CANCEL is intent → partial + `.cubricdl` marker deleted; failure/stall/app-quit is accident → partial kept, next Install resumes via an explicit Range request. There is still NO pause/resume UI (MPI-258 B2 deleted those routes — do not reintroduce them).

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves model downloads, uninstalls, or engine downloads.

**Frontend entry point:** `js/services/downloadService.js` — a singleton mirror of the backend store snapshot. Always use `downloadService.start/cancel/uninstall()`, never raw `fetch` directly. On `download:snapshot` it REPLACES `state.downloadJobs` wholesale (version-gated). `start()` shows an optimistic client-only `pending` job that reverts to Install after 10s with a `ui:warning` toast if no backend ack lands.

**The SOT is `routes/install/installStore.js` (MPI-276).** One store, legal-transition table (illegal moves rejected + logged), monotonic `version`. **No `refCount` — DELETED; never reintroduce it, never gate on `refCount === 0`.** "Is a dep in-flight" = `store.activeModelsForDep(depId)` / `_inFlightDepIds`. `routes/install/reconciler.js` drives the store from disk/volume truth (settles wedged jobs, fails orphans, prunes, broadcasts the snapshot) on SSE connect / 15s poll / post-uninstall.

**Backend router:** `routes/downloadManager.js` — manages `FileDownloader` instances, runtime job maps (write-authoritative + transport carriers), completion sidecars, and SSE broadcast. Downloads RESUME after failure/stall/quit (MPI-317): a marker-blessed partial restarts via an explicit Range request (safe — the installed NDH truncates on a 200-not-206 answer, so the MPI-258 B2 append-corruption cannot recur); a resumed stream skips the MPI-296 incremental hash and `_verifySha256` falls back to a full disk re-read. User cancel still deletes the partial + marker. NDH writes directly to the final filename; Cubric marks in-progress managed downloads with `<file>.cubricdl` and treats a file as installed only when `exists && no sidecar`.

**Uninstall (G13, MPI-276):** the route engine-filters the wire dep array (`_filterDepsForEngine`), protects shared deps (whole-model-installed rule) + in-flight deps (store, both engines), and deletes custom-nodes by their extracted FOLDER (`custom_nodes/<name>/`, NOT the long-gone install zip). A kept/missing path is never reported in `removed[]`.

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
1. **Never Raw Fetch for Downloads:** Always use `downloadService.start/cancel/uninstall()`. Raw `fetch` bypasses the SSE sync and state management.
2. **Never Delete \****`.cubricdl`**\*\* Markers Casually:** Model resume and installed-state safety depend on `<file>.cubricdl` sidecars. They are created on download start and removed only after verified completion, explicit cancel, uninstall, or checksum failure cleanup.
3. **Never Skip \****`comfyNeedsRestart`**\*\*:** After custom node install, ComfyUI must be restarted. `ensureServerRunning()` handles this automatically — do not suppress or bypass it.
4. **Always Use Events for Download UI:** Components must subscribe to `download:*` events via `Events.on()`, not poll `state.downloadJobs` directly. Store the unsubscribe function and call it on cleanup.
5. **Never Open a Second EventSource:** Only `downloadService._connectSSE()` opens `/comfy/downloads/stream`. All other code subscribes via `Events.on()` to events already bridged by `downloadService`.

---

## Engine Download & Engine-Deps Parallel Flow

**Engine downloads run parallel with engine-level dependency downloads** for better UX. Engine-level deps are the UNIVERSAL set: every `type: 'custom_nodes'` dep plus every `engineAsset: true` weight in `dependencies.js` (MPI-222 — replaced the old `installOnEngine` flag). They cover all universal workflow needs in one place.

1. **Combined size calculation:** `routes/shared.js` exports `getUniversalWorkflowDepsTotalSize()` which HEAD-requests each universal dep URL to get exact bytes
2. **Parallel firing:** `routes/engine.js` fires both engine download AND `startUniversalWorkflowInstall(depIds, true, true)` immediately
3. **Custom node install delayed:** The third parameter `true` skips custom node pip install until after engine extraction
4. **Frontend aggregation:** `MpiEngineInstall.js` receives both `engine:downloading` and `download:progress` events and aggregates them into a single unified progress bar
5. **Custom node finish:** After engine extraction, `finishCustomNodeInstall(modelJob, true)` is called to run pip install with Python now available

**Adding a new universal workflow:** No dependency changes needed in `universal_workflows.js`. Any new node dep is `type: 'custom_nodes'`, which is in the universal set automatically (no flag) and included in future engine installs.

**Custom_node deps are UNIVERSAL by TYPE (MPI-222 — replaced `installOnEngine`):**

- **Every `type: 'custom_nodes'` dep** is universal: `getUniversalWorkflowDepIds()` selects `type==='custom_nodes' || engineAsset===true`, so all nodes bake in with the engine and a fresh install can run any universal workflow with zero extra install. There is no per-model node class anymore — the old `installOnEngine` flag and `getInstalledModelNodeDeps()` are deleted (once every node went universal, that fn returned `[]`). A former per-model node (`ComfyUI-PainterI2Vadvanced`, `ComfyUI-LTXVideo`) just installs as a universal node.
- **On the Pod, the split is `installRequirements`:** `true` nodes BAKE into the image (pip cost at build); `false` nodes install onto the VOLUME at connect via the wrapper (see `routes/remoteModels.js` `_isImageResident`) — so bumping a volume node's commit never forces an image rebuild. A commit bump is a `dev_configs/node_lock.json` edit; the drift ladder (`.mpi_node_commit` marker) reinstalls at the new commit on both engines. See `.claude/rules/comfy_engine.md` § 2.5c.

---

## Operation-selectable models — the resolver chokepoint (MPI-122)

A model declares its deps in ONE of two shapes (see `docs/data.md` § resolveModelDeps):
- **Flat** (all image models): `dependencies: string[]`.
- **Operation-keyed** (e.g. Wan 2.2 `wan-22`): `commonDeps: string[]` + `operations: { <opKey>: { deps: string[] } }`, and NO flat `dependencies`. The user picks which operations to install in the model manager.

**The download lifecycle is frozen and op-blind.** `downloadService.start(modelId, deps)` and `uninstall(modelId, deps)` ALWAYS take a RESOLVED FLAT dep array. Operations are collapsed to that flat array by `js/data/modelConstants/resolveModelDeps.js` at the call site — BEFORE the lifecycle. Jobs/SSE/`.cubricdl` markers never learn about operations; jobs stay keyed by `modelId`. **Do NOT add a per-operation download job or a second SSE channel.**

**Which resolver call to use:**
- **Install** → `resolveDeps(model, selectedOps)` (the user's op selection; `null` = all selectable ops = fresh full install).
- **Whole-model uninstall** + **install-status checks** (`/comfy/models/check`) → `resolveFullUniverse(model)` so no op payload is orphaned and partial state is computed against the complete universe.
- **Backend shared-dep protection** (`_localSharedDepsMap`, `_remoteSharedDepIds` in `routes/downloadManager.js`) MUST resolve every OTHER model's full universe — never read a `.dependencies` field, which no longer exists on op-keyed models. Otherwise a shared/op-specific dep another installed model needs gets deleted (e.g. uninstalling Wan I2V trashing the VAE/text-encoder T2V also uses).

**Never read `model.dependencies` directly.** Use the resolver. A flat model is treated as `commonDeps = dependencies` with no operations, so one code path covers both shapes.

**Per-operation install AND uninstall.** The model-download page lets the user toggle ops on/off on an installed model:
- Adding an op (Update / Install) downloads only its missing resolved deps.
- Removing an op (Update, after a confirm) calls `downloadService.uninstall(modelId, deps)` with `deps` = the removed op's resolved deps MINUS any dep still used by an op that REMAINS installed/selected (incl. commonDeps, which any remaining op keeps). This intra-model subtraction is done CLIENT-SIDE — the backend's shared-dep guard only protects across OTHER models (it excludes the target model), so it would not stop you deleting a dep a sibling op of the same model still needs.
- The button reads Install (0 installed) / Update (draft ≠ installed) / Uninstall (installed, no change). The op draft persists in `state.s_modelOpDraftByModel`.
No change to the download/SSE contract — per-op uninstall is the same `uninstall()` call with a narrower dep list.

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

### Cancel (deletes the partial — failure/quit resumes instead, MPI-317)
```javascript
await downloadService.cancel(modelId); // idempotent; a second press / settled card no-ops
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
// DepJob (backend runtime map — NO refCount, DELETED MPI-276)
interface DepJob {
    id: string;
    url: string;
    localPath: string | null;
    status: 'queued' | 'downloading' | 'verifying' | 'complete' | 'failed' | 'cancelled';
    downloadedBytes: number;
    totalBytes: number;
    error: string | null;
    sha256Expected: string | null;
    pipPins?: string[] | null;
}

// DownloadJob (state.downloadJobs[]). 'pending' is a CLIENT-ONLY state (G2).
interface DownloadJob {
    id: string;
    modelId: string;
    status: 'pending' | 'queued' | 'downloading' | 'verifying' | 'installing' | 'complete' | 'failed' | 'cancelled';
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

## Engine Download (cancel-only)

The **engine** archive download (distinct from model downloads) is managed via `registerEngineDownload()` / `clearEngineDownload()` and `_activeEngineDownloader` in `routes/downloadManager.js`. `/engine/pause` + `/engine/resume` were DELETED (MPI-258 B2) — do not reintroduce them.

`GET /comfy/downloads/active` reports active model downloads separately from the engine download for Electron quit warnings. On cancel both scrub the partial; on interruption MODEL downloads resume (MPI-317) — whether the engine-archive path also resumes has NOT been verified since that change; confirm before relying on it.
