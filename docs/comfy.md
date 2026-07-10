# ComfyUI Integration

ComfyUI is the generation engine. Communication is via REST + WebSocket.

> **Remote engine:** ComfyUI can run on a RunPod Pod instead of locally. The renderer
> keeps the same controller/executor contracts; only the transport changes (Express
> `/proxy/*` forward + a renderer-direct binary-preview WS). See
> [runpod-remote-engine.md](runpod-remote-engine.md). Video output uses the portable
> `CreateVideo → SaveVideo` split (titles `Output_Video`/`Output_Audio`/`Preview`),
> captured workflow-agnostically by `_collectComfyOutputUrls` reading `videos[]`.

## comfyController (`js/services/comfyController.js`)

Singleton that manages the ComfyUI server lifecycle and workflow execution.

- `ensureServerRunning()`: Starts ComfyUI if not running (calls `POST /comfy/start`).
- `runWorkflow(workflowFile, params, onProgress?)`: Loads workflow JSON, uploads input assets, injects params by node `_meta.title`, captures `Output` node results via WebSocket, and routes messages by ComfyUI `prompt_id` so queued jobs complete into the correct active-generation entry.
- `getQueue()`: Reads ComfyUI's native queue and returns `{ running, pending }`.
- `clearQueue()`: Clears pending ComfyUI jobs without interrupting the current job.
- `deleteQueueItem(promptId)`: Removes one pending ComfyUI queue item.
- `interrupt()`: Aborts running generation.
- `generateRandomSeed()`: Returns a random seed for the Seed node.

## commandExecutor (`js/services/commandExecutor.js`)

Orchestrates a full generation request.

- `runCommand(payload)`: Single argument — a `RunPayload` object `{ operation, modelId, positive, negative, seed?, injectionParams?, mediaItems?, maskDataUrl? }`. Resolves workflow file, builds title-keyed param map (including `injectionParams` for PromptBox controls), runs via comfyController, captures Output node.
- `runAutoMask(imageData, modelId, params, onProgress?)`: Runs auto-mask workflow, captures both `Detected` and `Output` nodes.
- `_depFilename(depId)`: Maps dep ID to filename.
- Workflow file selection: `runCommand()` resolves universal workflows directly (`getUniversalWorkflow`), else derives the model-tied filename via `resolveWorkflowFile(model, op, engine, {stage2})` in `modelConstants/resolveModelDeps.js` — applies the `_stage2` then engine (`_gguf`) suffix in build-script order, engine resolved once per gen. (MPI-165)
- `_buildParams(payload)`: Builds the title→value map for injection. Merges `payload.injectionParams` (from PromptBox controls) into the params object alongside standard fields (Positive, Negative, Seed, media slots).
- Operation-specific injectors: if `COMMANDS[payload.operation].injector` is set, `runCommand()` applies `INJECTORS[name](workflow, payload.injectionParams || {})` after loading workflow JSON and before submitting it.
- Execution handles expose `promptId`, `seed`, and `onPromptAck`. `generationService` stores `promptId` in `activeGenerations` and saves the resolved seed on generated items.

## Generation Flow — Cue + Loop

There is one execution path: the in-app Cue queue in `generationService.js`. Loop is a session-only boolean (`state.loopArmed`) layered on top — never persisted to `project.json`. There is no Single mode.

- **Cue (default)**: tap Cue button or `Ctrl+Enter` enqueues one job into `_cueQueue`. Only ONE prompt is ever submitted to ComfyUI at a time (single-dispatch); Comfy never holds pending. `state.generationQueueCount = _cueQueue.length + (_cueDispatchInFlight ? 1 : 0)` updated synchronously on enqueue/dispatch — no Comfy polling. Stop interrupts the current job; the dispatcher pulls the next pending item. Clear empties `_cueQueue` (current job continues). API: `enqueueGeneration(config, callbacks, opts)`.
- **Loop**: `state.loopArmed = true` — set by holding the Cue button ≥700ms or `Ctrl+L`. When the dispatcher drains to empty AND `loopArmed`, it re-fires using the last job's `getNextGeneration` callback (live PromptBox payload — model/op/prompt/media at re-fire time). Re-fire triggers on complete, cancel, AND error. Only flipping `loopArmed = false` (tap Cue while armed, or Ctrl+L) halts re-fire.

Cue StatusBar progress is per active generation, not aggregate across the full queue. The dispatcher waits for the current lifecycle to unwind before starting the next queued item.

## Workflow Injection Pattern

Nodes are matched by `_meta.title` (case-insensitive). Example:

```javascript
const params = {
    "Positive": "A landscape",
    "Seed": 45678,
    "Checkpoint": "sdxl-realistic.safetensors",
    "Lora_1": { lora_name: "my_lora.safetensors", strength_model: 0.8, strength_clip: 0.8 },
    "Input_Image": "data:image/png;base64,..."
};
```

Known titles: "Positive", "Negative", "Seed", "Checkpoint", "Lora_1"…"Lora_6", "Input_Image", "Input_Mask", "Output", "Detected", "Upscale_Model", etc. See `.claude/rules/comfy_injection.md` for the full table.

Models with staged LoRAs, such as WAN, inject title keys from `model.loraStages`.
WAN uses `Lora_High_1` ... `Lora_High_6` and `Lora_Low_1` ... `Lora_Low_6`.
ComfyUI nodes may expose either `strength` or `strength_model`; the injector supports both.

**Static filenames for uploads** (e.g. `mpi_detailer_input.png`) enable ComfyUI execution caching.

### Workflow Injectors

Most workflow mutation is handled by the standard title-keyed params map passed
to `ComfyUIController.runWorkflow()`. Some tool-panel utility workflows need
more specific mutation than `_buildParams()` provides. Those operations declare
an injector in `commandRegistry.js`:

```javascript
resize: {
    universal: true,
    injector: 'resize',
}
```

`commandExecutor.runCommand()` resolves the injector from
`js/services/workflowInjectors/index.js` and calls it with the loaded workflow
JSON plus `payload.injectionParams`. The injector mutates the workflow object in
place and must target nodes by `_meta.title`, not numeric node IDs. After the
injector runs, those consumed operation-specific params are removed from the
generic title-keyed params map so names like `flip` cannot collide with a
workflow node titled `Flip`.

Current injector:
- `resize` (`js/services/workflowInjectors/resizeInjector.js`) shared by
  `resize` and `resizeVideo`. It writes Resize Image v2, ImageFlip, Image Rotate,
  and the Boolean node titled Flip. Media inputs (`Input_Image`, `Input_Video`) and
  Output capture remain handled by the standard command executor/controller path.

Resize live preview (image AND video workspaces) calls `runCommand` directly with
`previewOnly: true` AND `suppressLifecycleEvents: true`. The compound extracts a
512px-longest-edge thumbnail from the source via `viewer.el.getSourceElement()`
(HTMLImageElement on the canvas viewer, HTMLVideoElement first frame on the
video viewer) and submits it through the **image** `resize` workflow with
`width`/`height`/`divisible_by` proportionally scaled to thumbnail space. The
result paints into an inline `<img>` slot inside the resize tool panel — viewer
canvas / video stays untouched. `previewOnly` is the existing client-side
"do not save" hint; `suppressLifecycleEvents: true` suppresses
`tool:sampling-start` / `tool:loading-model` emits because tool-panel previews
bypass `generationService` and have no `tool:running`/`tool:idle` pair to
bracket them — without suppression, StatusBar would be left in active state with
its elapsed timer running. Multi-stage `_ms` previews go through
`generationService` and DO want lifecycle events; the suppression is gated on
the explicit flag, NOT on `previewOnly`. The executor still captures the
workflow `Output` node for resize; only `_ms` video preview workflows switch
capture to `Preview`. Apply (image or video) always re-runs the workflow at
full resolution via `startGeneration`; there is no fast-path / preview-URL
reuse.

### Multi-stage workflows

Full authoring contract (two-file convention, `LoadLatent` injection, `Preview` vs `Output` capture, WAN baked-vs-live LoRA semantics, LTX flat-LoRA + `allowsBranchingContinue: false`) lives in `.claude/rules/comfy_injection.md` § "Multi-stage video workflows". Read it before touching `_ms` ops.

LTX-2.3 resolution tiers, the /64 size rule (multi-stage ×0.5 stage), and measured per-tier timings + motion/audio tradeoff live in [`docs/builder/research/ltx-2.3-tiers.md`](builder/research/ltx-2.3-tiers.md). Read it before changing `LTX_RATIOS` in `js/utils/ratios.js`.

## assetService (`js/services/assetService.js`)

Loads available LoRA and upscale model filenames from `GET /comfy/list-files` into `state.availableLoras` and `state.upscaleModels`. `loadAll()` is the **only** writer of those two keys.

Callers: `shell.js` on the `comfy:ready` event, plus lazy loads on ModelSettings/upscale-tool open and folder import/save. All the lazy ones are user-interaction gated.

**The empty-list trap (MPI-245):** `commandExecutor._findMissingModel()` treats an EMPTY `availableLoras` as "engine not ready" and **fails open** (deliberately — blocking a generation on an unloaded list would be worse). So whenever the list has not loaded, the pre-dispatch missing-LoRA guard silently passes and a dead LoRA reaches ComfyUI. Two consequences worth knowing:

- `ensureServerRunning()` must emit `comfy:ready` on **every** ready path, including the already-running early return — that emit is what runs `loadAssets()` at boot.
- Even then, boot auto-start is gated on `Storage.getAutoStartComfy()` (**default `false`**), and the dispatch-time `ensureServerRunning()` inside `runWorkflow` fires *after* the guard has already run. So on a default config the guard can never pre-empt dispatch, and the engine-side rejection (see "missing LoRA is reported differently per engine" below) is the PRIMARY defense, not a fallback. Do not delete it believing the guard covers it.

## Models path & additive folders

The models-root resolution, `extra_model_paths.yaml`/`extra_model_folders.json`
contract, `/comfy/list-files`, `/comfy/extra-folders`, and LoRA/upscaler
visibility rules live in [models-path.md](models-path.md).

## Download Manager

Resumable model downloads (frontend `downloadService.js` + backend
`downloadManager.js` + SSE, `ResumableDownloader`, `.cubricdl` markers, the
lifecycle event table, ComfyUI auto-restart) live in
[download-manager.md](download-manager.md).

## Engine Gotchas

**v0.26 completion sentinel (MPI-152):** v0.26 dropped `executing {node:null}` — completion is now `execution_success {prompt_id}` WS message. Both handlers (`comfyController.js` + `commandExecutor.js`) accept EITHER terminal (legacy + new) via idempotent `_finishGeneration()`. Terminal events are `broadcast=False` (not replayed on WS reconnect) — `_reconcileFromHistory` polls `/history/{prompt_id}` on reconnect. `model_type FLUX` in LTX boot log is NORMAL (LTX uses DiT/Flux arch class), not a bug.

**sage-attention arch gating (MPI-145):** `--use-sage-attention` crashes LTX-2.3 on Ada sm_89 (4090/4060Ti) with `CUDA error: unspecified launch failure` → engine dies → WS drops (shows misleading "engine disconnected" dialog, NOT OOM). Works on Blackwell sm_120. Gated in `start.sh` via `SAGE_DISABLED_ARCHS` (default `sm_89`). `CUBRIC_SAGE_DISABLED_ARCHS` Pod env overrides without a rebuild. Local engine never installs sage (MPI-50).

**Pod VRAM ~1GB under nominal (MPI-146):** `torch.cuda.get_device_properties(0).total_memory` reports ~1GB below nominal (24GB 4090 → 23GiB; 32GB 5090 → 31GiB). Use `>=28` as lowvram cutoff, not `>=32` — the 5090 at 31GiB wrongly classified as `<32` and OOM-hung. Mostly moot under aimdo (torch ≥ 2.8), kept because it bit us live before that fix.

**Seed node required for cache-dedupe:** `commandExecutor.js` listens for `execution_cached` WS event. If ALL `outputNodeIds` are cached AND no node titled `"Seed"` (case-insensitive) exists, `cacheHit = true` → short-circuits, no `saveGeneration`, toast "No changes, skipping...". Any workflow consuming a seed MUST have a node titled exactly `"Seed"`. Replace mode bypasses dedupe.

**PYTHONUTF8=1 on Windows (MPI-118):** Windows embedded Python 3.13 defaults to cp1252. A custom node with a non-Latin-1 char (e.g. `"$Δ \hat{t}$"`, U+0394) causes `SyntaxError` + traceback crash → whole ComfyUI exits. Fix: `PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8'` in ComfyUI spawn env (`routes/comfy.js`) + `set PYTHONUTF8=1` prepended to `run_nvidia_gpu.bat` in `engine.js`.

**GPU build selection by arch, not CUDA:** `resolveDownloadConfig()` selects portable build via `selectNvidiaBuild(gpuName, cudaVersion)` using GPU ARCHITECTURE. `--query-gpu=name` never emits `CUDA Version:` header → CUDA always `unknown` under old logic → everyone fell to cu126 including Blackwell. Gate on arch (GPU model name): RTX/GTX-16xx+ → default `nvidia.7z`; GTX 10xx & older → `nvidia_cu126.7z`.

**Engine bootstrap retry contract (MPI-8):** `_clearStaleWindowsEngineArtifacts()` runs BEFORE download — removes partial archive, OS-renamed `(n)` dups, partial extract folder with no Python. Post-extract: assert `getPythonBin()` exists; else scrub + throw. Retry routes by `/engine/status`: `exists:false` → `/engine/download`; `exists:true` → `/engine/repair-deps`.

**Engine upgrade must preserve models path (MPI-118):** `/engine/upgrade` MUST capture `getCustomRoot()` BEFORE `fs.remove(portableDir)`, then pass it to `_runEngineDownload()`. General law: any engine-wipe/reinstall op captures custom models root first and re-applies after.

**Dep URL/filename integrity — cross-check content:** `dependencies.js` deps have `filename`, `url`, and `sha256`. Wan 2.2 had `url`+`sha256` CROSSED against `filename` (internally consistent — sha matched the wrong url-target). `computeDepHashes.py` only fills `sha256: null`, does NOT recompute wrong ones. Rule: trust `filename`+`origin` as intent; cross-check `url` basename matches `filename` basename and `sha256` matches that file's HF ETag.

**A rejected `/prompt` is reported DIFFERENTLY per engine (MPI-229 remote, MPI-245 local).** Both engines answer HTTP 400 for a bad enum value (a LoRA/checkpoint missing from the loader's list), but the payload differs, and a parser written for one is blind to the other:

| Engine | Body | Where the filename lives |
|---|---|---|
| remote (Pod) | `{error: "<string>", message, detail: {comfy_status, comfy_body}}` (wrapper) | inside the `comfy_body` **text** → scrape it |
| local | `{error: {type, message, details}, node_errors: {...}}` (ComfyUI `server.py`) | `node_errors[id].errors[].extra_info.received_value` |

Traps, all of which bit us:

- The local top-level `error.details` is **`''`** whenever *any other* output node still validated (`execution.py` only fills it when `good_outputs` is empty). Never parse `details` — read `node_errors` structurally.
- Local `error` is an **object**; remote `error` is a **string**. `errCode = errData?.error` therefore captures an object locally and silently breaks every `errCode === '...'` comparison below it. Take the string form only.
- The carrier identifies the engine: `node_errors` ⇒ local, `detail.comfy_body` ⇒ remote. Tag the thrown error accordingly (`lora_missing_local` / `lora_missing_remote`) so `commandExecutor` can raise a `ui:warning` toast rather than letting it fall through to the `ui:error` GitHub bug-reporter dialog.

Anything that classifies a ComfyUI rejection MUST handle both shapes — see the "fix BOTH engine paths" law. Guard: `tests/lora-missing-local-toast.test.cjs`.

## Generation / Prompt Gotchas

**Cue queue contract — Ratio_Label injection:** `generationService.getGenerationQueueSnapshot()` and `generation-queue:changed` own the user-visible queue state (not ComfyUI polling). Ratio injection includes `Ratio_Label` alongside `Width` and `Height` — Cue cards and sidecar metadata should display the selected label (e.g. `16:9`), not derive from output pixels.

**Prompt draft persistence (MPI-113):** Drafts survive navigation via session-only `state.promptDraft` + `state.promptMedia`. Tagged-slot scheme: one slot per workspace stamped with card id. Gallery slot: `id:null` (always matches). `MpiPromptBox.mount()` restores BEFORE block subscribes to `media-change`. Props: `workspaceKey` (`'gallery'`|`'history'`) + `workspaceId` (card id).

**PromptBox chip name nav survival (MPI-130):** `_saveMedia` must include `name` in its serialize map — dropping it reverts chip labels to raw filename after nav. 4-hop round-trip: `_tryAddMedia({..., name})` → `_saveMedia` map includes `name` → restore loop passes `m.name` to `injectMedia` → `injectMedia({url, mediaType, role, name})` forwards to `_tryAddMedia`. Any per-chip field that must survive nav goes in `_saveMedia` AND through `injectMedia → _tryAddMedia`.
