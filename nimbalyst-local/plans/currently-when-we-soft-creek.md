# Aggregated ComfyUI Workflow Progress Bar

## Context

Today the app shows only raw KSampler step progress from ComfyUI (`{value, max}` per active KSampler). Multi-sampler workflows, UltimateSDUpscale's dual-stream, and video pre-processing nodes all cause the bar to reset, jump, or mislead. Goal: one monotonically-increasing aggregated progress bar that reflects the whole workflow cost, not just the currently-running KSampler.

Because we author every workflow the app ships, we can pre-compute node weights from the workflow JSON (KSampler `steps`, VHS frame counts, upscale phases) before the prompt is sent. Combined with ComfyUI's richer `progress_state` event (confirmed present in our pinned engine v0.19.3, emitted by `comfy_execution/progress.py::WebUIProgressHandler`), we can aggregate across all nodes deterministically. Legacy `progress`/`executing` events remain as fallback.

Secondary scope (Comfy-Org ecosystem — SDK/CLI/other repos) is deliberately deferred; notes captured in brainstorm transcript, no action this plan.

## Approach

1. **Pre-execution weight map.** When `commandExecutor` resolves a workflow JSON, walk all nodes once and produce `{ totalWeight, nodes: { [nodeId]: { weight, kind } } }`.
   - `KSampler` / `KSamplerAdvanced` / future `ClownsharKSampler` / any `class_type` matching `/sampler$/i`: weight = `inputs.steps` (default 20 if missing).
   - `UltimateSDUpscale`: weight = `inputs.steps * tiles_estimate` where `tiles_estimate = ceil(img_w / tile_width) * ceil(img_h / tile_height)` if dims known, else fixed `steps * 4`. Treated as 2 phases (load/pre-pass = 20%, upscale = 80%) inside the node's own value/max tracking.
   - `ImageUpscaleWithModel`: fixed weight `10` per invocation (per-frame for video — multiply by frame count if wired into VHS output).
   - VHS nodes (`VHS_LoadVideoPath`, `VHS_VideoCombine`): fixed weight `5` each; frame count not known pre-run, so these act as "chunky" nodes.
   - All other nodes (CLIP encode, VAE decode, LoRA, Mpi* helpers): weight `1` (they're fast but add fill progress so bar doesn't pause on node-count spikes).
2. **Runtime aggregator.** New module `js/services/progressAggregator.js`:
   - API: `create(weightMap) → { onProgressState(msg), onProgress(msg), onExecuting(msg), onExecutionSuccess(), percent() }`.
   - Preferred path: `progress_state` event. For each node in `nodes` dict: `contributedFraction = (value/max) * weight` if `state === 'running'`; `weight` if `state === 'finished'`; `0` if `pending`. Sum / totalWeight.
   - Fallback path: on first run, if no `progress_state` received after 2 seconds of execution OR first WS frame is legacy `progress`, switch to `executing` + `progress`:
     - `executing.data.node` → mark that node active; mark all previously-active as finished.
     - `progress.data.{value,max}` → scale active node's weight. UltimateSDUpscale dual-stream: detect `max` value change within same active node — treat first stream as completed (full weight counted), reset inner fraction for second stream (split becomes 20/80 regardless of reported values).
   - `percent()` always monotonic: never emit a value lower than previous.
3. **Wiring.**
   - `js/services/commandExecutor.js`: compute weight map after workflow JSON resolved, before POST to `/prompt`. Create aggregator per execution. Route all WS events through it. Replace existing `exec.onProgress?.(value/max)` with `exec.onProgress?.(aggregator.percent())`.
   - `js/services/comfyController.js`: extend WS message handler to forward `progress_state` alongside existing `progress`/`executing` (currently `progress_state` probably falls through unhandled). Single `onMessage` dispatch.
4. **UI.** No API change to `statusBar.progress.update(pct)` or `MpiProgressBar`. Bar already fills from 0→1; aggregator supplies the number. Existing `tool:sampling-start` / `tool:loading-model` events untouched.
5. **UltimateSDUpscale testing gate.** Ship with the 20/80 fixed split assumption. After first real test against the `upscaler_sdxl_realistic.json` workflow we'll tune constants (or add a per-node override hook in `models.js` if we find dims/tile metadata is reliable).

## Files to Modify

- `js/services/commandExecutor.js` — compute weight map, attach aggregator, route events, emit aggregated percent. Lines ~221-409.
- `js/services/comfyController.js` — pass `progress_state` through `onMessage` listener. Lines ~142-192.
- **NEW** `js/services/progressAggregator.js` — pure module: weight map builder + aggregator factory. No DOM, no state writes.
- `js/shell/statusBar.js` — no change expected; verify monotonic aggregator output feeds existing `progress.update()` correctly. Lines ~14-49.

## Reused utilities

- `Events` (`js/events.js`) — cross-component signals if we need to fire any new phase events (probably not; statusBar already listens to `tool:sampling-start`).
- `state` (`js/state.js`) — store `state.activeGenerations` entry's aggregator reference alongside existing exec handle; avoid new top-level key.
- `MpiProgressBar` primitive — unchanged, consumes pct as today.
- `modelRegistry.getWorkflowFile()` — unchanged; plan does not add fields to `models.js`.

## Verification

1. **Unit-ish.** Feed `progressAggregator` a scripted sequence: synthetic `progress_state` frames with 2 KSamplers, confirm `percent()` is monotonic and hits exactly 1.0 on final node `finished`.
2. **t2i 2-KSampler workflow.** Run `t2i_sdxl_realistic.json` via prompt box. Watch statusBar bar: must advance smoothly through both KSamplers without resetting between them.
3. **UltimateSDUpscale.** Run `upscaler_sdxl_realistic.json`. Expect bar to not regress when the internal pre-pass switches to upscale pass. Log the raw `progress_state` sequence to `logs/app.log` via `clientLogger` during first test run for tuning.
4. **Video workflow.** Run `video_upscale.json`. Bar should not stall long on VHS load (weight contribution fills even if per-frame progress unknown).
5. **Fallback path.** Temporarily force aggregator into legacy mode (dev flag) and re-run step 2. Confirm bar still advances across both KSamplers (executing + progress path works).
6. **Cancel.** Interrupt mid-run via `/interrupt`. Aggregator should stop updating; no stuck progress bar state.
7. **Errors.** Force ComfyUI error (e.g., missing model). Confirm aggregator receives `execution_error` / stalls gracefully; statusBar returns to idle.

## Out of scope

- `comfyui-sdk` adoption (third-party risk).
- `comfy-cli` lifecycle swap (our curated install diverges).
- Adding `progressWeights` metadata to `models.js` (runtime JSON parse covers it; revisit only if a workflow needs override).
- Engine version detection for `progress_state`: we treat v0.19.3 as the floor and rely on runtime fallback if a future patch regresses.
