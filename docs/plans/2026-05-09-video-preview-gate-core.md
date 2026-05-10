# Video Preview-Gate Core

**Created:** 2026-05-09
**Kanban entry:** `Video preview-gate core`
**Tag:** [PLAN]
**Priority:** high
**Depends on:** `Queue modes + run hotkeys` (this plan calls into the queue API + uses the new mode toggle).

## Status (as of 2026-05-10)

- [x] To-do 1 — sidecar schema + in-memory parity (verified with normal video gen)
- [x] To-do 2 — Preview_Only injection + new ms ops registered
- [x] To-do 3 — PromptBox toggle "Preview initial stage"
- [x] To-do 4 — save preview output as `stage: 'preview'` + frozenParams (verified: preview MP4 saved, sidecar correct)
- [ ] To-do 5 — gallery PREVIEW badge + Continue / Discard buttons + click gate
- [ ] To-do 6 — Continue handler: re-submit with frozen params, replace card on finalize
- [ ] To-do 7 — Continue-while-busy behavior per generation mode
- [ ] To-do 8 — documentation + rule files sync

## Deviations from original plan (read before continuing)

These changes were made during execution and should be honored by the next session.

1. **New ops `t2v_ms` / `i2v_ms` instead of repurposing `t2v` / `i2v`.**
   The plan originally added a `previewInitialStage` toggle to `t2v` and `i2v`. We instead created **multi-stage operations** as first-class entries in `commandRegistry.js` and changed WAN's `workflows`/`supportedOps` in `js/data/modelConstants/models.js` to use `t2v_ms` and `i2v_ms`. Single-stage `t2v` / `i2v` remain in the registry for future single-stage models. Future video models opt into multi-stage by listing `*_ms` ops in `supportedOps` + providing matching workflow files.

2. **No PromptBox-level capability scan.** The plan considered fetching workflow JSON to detect `Preview_Only` node presence. Rejected — the op key (`_ms` suffix) is the contract. Workflow authoring guarantees node presence. Defensive scan stays in `comfyController.runWorkflow` as a `clientLogger.warn` only (dev signal, no user-facing toast).

3. **No `toast:warn` event bus.** No such event exists in the app. The defensive warning when a workflow is missing `Preview_Only` is `clientLogger.warn` only — UI never sees it because the op contract should prevent the case.

4. **`previewStage` control name (not `previewInitialStage`).** Registered in `PROMPT_BOX_CONTROLS` as `previewStage`. Component is an `MpiButton` with `toggleable: true`, `size: 'sm'`, icon `frameForward` (double-play). Persists per-model under `modelSettings[modelId].previewStage`. Run payload field is `previewOnly: boolean`.

5. **`MpiOptionSelector` got a `size` prop.** To match the new small Preview toggle visually, `size: 'sm'` was added to MpiOptionSelector and passed from `PromptBoxControls.js` for the `ratio` and `batch` controls. Default remains `md` for non-PromptBox callers (MpiToolOptionsUpscale, MpiToolOptionsInterpolate). Documented in `js/components/types.js`.

6. **Capture-title filter switch in `commandExecutor.js`.** Critical bug discovered + fixed: the executed-message filter was hardcoded to `_meta.title === 'output'`, silently dropping the Preview node's `gifs[]` payload during preview-only runs. Filter now switches to `'preview'` when `payload.previewOnly === true`. Workflow authors of `_ms` workflows MUST title their two `VHS_VideoCombine` capture nodes exactly `"Preview"` and `"Output"`. Documented in `.claude/rules/comfy_injection.md`.

7. **`projectModel.js` factory defaults NOT updated.** Plan suggested adding `stage`/`frozenParams`/`loraSnapshot` defaults. We deliberately omitted — sidecars and in-memory MediaItems intentionally don't carry these keys when absent. Reconciler hydrates verbatim. This preserves shape parity (`feedback_sidecar_inmemory_parity.md` memory) — legacy sidecars stay clean.

8. **Frames frozen-param is `null` for v1.** WAN workflows don't expose a frame-count injection node today. `frozenParams.frames` stores `null` until a workflow adds a `Frames` / `Frame_Count` node — `generationService` already reads from `injectionParams.Frames` or `injectionParams.Frame_Count` if either appears.

## Files touched in this session (for next-session orientation)

- `routes/projects.js` (save-generation: stage / frozenParams / loraSnapshot accept + persist + echo)
- `js/services/projectService.js` (saveGeneration wrapper forwards new fields)
- `js/services/generationService.js` (preview-mode metadata builder pre-loop; passes `previewOnly` into `runCommand`)
- `js/services/commandExecutor.js` (inject `Preview_Only` boolean; capture-title filter switches `output` ↔ `preview`)
- `js/services/comfyController.js` (defensive scan: warn + strip `Preview_Only` if node missing)
- `js/data/modelConstants/models.js` (WAN `supportedOps` + `workflows` → `t2v_ms` / `i2v_ms`)
- `js/data/commandRegistry.js` (new `t2v_ms` / `i2v_ms` entries with `components: ['ratio','previewStage']`)
- `js/components/Organisms/MpiPromptBox/PromptBoxControls.js` (new `previewStage` control; `size: 'sm'` on ratio/batch)
- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` (`getRunPayload` includes `previewOnly`)
- `js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js` + `.css` (size prop)
- `js/components/types.js` (size prop docs)
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` (forward `previewOnly`)
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` (forward `previewOnly`)
- `.claude/rules/comfy_injection.md` (Preview_Only / Preview / Output node contract)

## Goal

Let users run multi-stage video workflows (WAN today, LTX later) with `Preview_Only=true` to get a low-res motion preview MP4. The preview lands as a gallery card with a **PREVIEW** badge plus **Continue** and **Discard** buttons. Continue re-runs the workflow with `Preview_Only=false` reusing the frozen seed + prompt from the sidecar (LoRAs use current PromptBox state). The final card replaces the preview card in the gallery on completion. Preview cards are not clickable into history.

## Context summary (from investigation)

- **Sidecar shape** (written at `routes/projects.js:706` save-generation route): `id`, `type`, `filePath`, `operation`, `displayName`, `prompt`, `negativePrompt`, `seed`, `modelId`, `createdAt`, `name`, `uploaded`, `pixelDimensions`, `generationMs`, plus video-specific `fps`, `duration`, `frameCount`, `hasAudio`, `videoMeta`, `thumbPath`. Sidecars live at `Media/.meta/<uuid>.json`.
- **In-memory parity** (memory `feedback_sidecar_inmemory_parity.md`): MediaItem must mirror sidecar shape exactly. Reconciler at `js/managers/projectReconciler.js`. New fields go in both places.
- **Gallery rendering:** `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js:214` card template, render at `:313`. Existing top-badge pattern at `:222` (model + operation, or "VIDEO · duration"). Existing per-card overlay precedents: fav-wrap, reuse-wrap (after line 224).
- **Card click → history:** emits `'open-group'` at `:416`, navigated to `PAGE_GROUP_HISTORY` at `MpiGalleryBlock.js:128`. Gate point for "preview cards do not navigate" lives in the click handler before emit.
- **Video output capture:** `comfyController.js:22-29` `_collectComfyOutputUrls` reads `nodeOutput.gifs[]` (VHS MP4s) + `nodeOutput.images[]`. No preview/final distinction today.
- **Hot-continue feasibility:** ComfyUI keeps latents in VRAM unless `/comfy/unload?deep=true` runs. Skip cleanup after a preview to enable hot-continue. Cold continue re-runs stage 1 from scratch.
- **Workflow JSON** (WAN): `engine\ComfyUI_windows_portable\python_embeded\Lib\site-packages\comfyui_workflow_templates_media_video\templates\video_wan2_2_14B_t2v.json` (and `_i2v.json`). WAN workflow uses subgraph + `SaveVideo` final node. **No `Preview_Only` node, no `SaveLatent`/`LoadLatent` exist in the templates today** — these are workflow-author concerns.
- **Injection rules** (`comfyController.js:299-337`): match by `_meta.title` (case-insensitive). Boolean injection already supported via `node.inputs.boolean`.
- **Per-op registration:** `js/data/commandRegistry.js:110-123` defines `t2v` + `i2v` with `components: ['ratio']`.
- **Param construction:** `commandExecutor.js:_buildParams()` line 125-177. Currently injects Positive, Negative, Seed, Width, Height, Lora_1..6, Upscale_Model, Input_Image, Input_Mask.
- **Active generations registry:** `js/services/activeGenerations.js`. Plan #1 added `promptId` field — this plan extends with `previewItemId` so we can correlate Continue jobs back to their preview card.
- **Delete:** `routes/projects.js:344` deletes file + sidecar; `:1038` deletes sidecar only. Gallery delete handler exists.

## Architecture decisions

1. **Sidecar additions** for video items:
   - `stage`: `'preview'` | `'final'` | absent (legacy/non-video).
   - `frozenParams`: `{ seed, prompt, negative, dims, frames }` — only what determinism requires; **LoRAs not frozen** (per user spec).
   - `loraSnapshot`: list of LoRA names + strengths used at preview time, **informational only**, not used for Continue.
   - `previewLatentRef`: optional path/marker for cold-continue latent reload (workflow-side feature; absent for v1 if workflow doesn't include latent save/load — falls back to full re-run).
2. **Two paths for Continue:**
   - **Hot path** = preview just finished, no other workflow ran since, `_loraStillLoaded === true`, no model swap. Continue submits a new workflow with `Preview_Only=false` reusing frozen seed/prompt + current LoRAs. Latents are re-derived (deterministic with same seed/params) — full hot reuse of cached latents requires `LoadLatent` node, deferred to workflow author.
   - **Cold path** = anything else. Same submission but pays full re-run cost. UX-identical.
   - **Decision:** v1 ships **cold path only** for simplicity. Hot path becomes a workflow-side optimization later — workflow gains `LoadLatent` node + `Latent_Stage1_Path` injection, plan #3 or a follow-up handles. Cold-path-only keeps determinism guarantee (same seed + same params + same model = same output) without VRAM lifecycle plumbing.
3. **Continue while busy** uses queue mode behavior from plan #1: in Single mode → toast rejection; in Queue/Auto-loop → enqueues.
4. **Card replacement on finalize:** preview card's sidecar is mutated in place — `stage: 'final'`, MP4 file overwritten, `frozenParams` removed, full final fields populated. Same item id. Gallery re-renders the card.
5. **Discard:** removes preview MP4 file + sidecar via existing delete route.
6. **PromptBox UI:** add `previewInitialStage` boolean toggle in PromptBox options popup, only for `t2v` and `i2v` operations. Default `false`.
7. **Preview cards are not history-clickable.** Click handler returns early when `item.stage === 'preview'`. Optional toast: "Preview — Continue or Discard to finalize".

## Open workflow-author requirement

The WAN workflow JSON does **not** currently have a `Preview_Only` boolean node. The user knows this and stated it must be added on the workflow side. Same for LTX. This plan assumes the workflow has been authored to include the node before the code-side toggle becomes useful. Add a sanity check at run time: if `Preview_Only=true` is requested but the workflow has no node titled `Preview_Only`, log a warning and proceed (final video will still be produced — user-visible toast: "Workflow does not support preview mode; running full generation").

## To-dos

### 1. Sidecar schema + in-memory parity for `stage` + `frozenParams`

Edit `routes/projects.js` save-generation handler around `:706` (and `:414`, `:902` if they also write sidecars): accept new optional fields `stage`, `frozenParams`, `loraSnapshot` from the request body and persist them. Edit `js/managers/projectReconciler.js` and `js/data/projectModel.js` defaults to load + default these fields (`stage` undefined → treat as final, `frozenParams` undefined OK). Edit `js/services/generationService.js` to thread the fields from the run payload into the save-generation POST.

**Verify:** Trigger a normal video generation (no preview mode). Open `Media/.meta/<id>.json` → confirm `stage` and `frozenParams` are absent (or null) and existing fields unchanged. Then add a `console.log('[sidecar]', sidecar)` temporarily in the reconciler load path → confirm `stage` lands as undefined and the in-memory MediaItem has the same shape. Remove the log on green.

### 2. Inject `Preview_Only` boolean + workflow detection

Edit `js/services/commandExecutor.js` `_buildParams` (`:125-177`): when `payload.previewOnly === true`, add `params['Preview_Only'] = true`. Edit `js/services/comfyController.js` `runWorkflow` around `:299-337`: before submission, if `Preview_Only` is in params but no node with `_meta.title === 'Preview_Only'` exists in the workflow JSON, emit a toast event `'toast:warn'` with text "Workflow does not support preview mode; running full generation" and strip the param. Boolean injection itself is already handled by the existing `_inject` logic (`node.inputs.boolean`).

**Verify:** With a workflow that has the node: trigger Run with `previewOnly=true`, console-log the resolved workflow JSON, confirm the `Preview_Only` node's `inputs.boolean` is `true`. With a workflow that lacks the node: trigger same → confirm warning toast + the param is absent in the submitted JSON.

### 3. PromptBox toggle: "Preview initial stage"

Edit `js/components/Organisms/MpiPromptBox/PromptBoxControls.js`: add a new control `previewInitialStage` using `MpiOptionSelector` variant `buttons` (or a simpler boolean toggle component if one exists — investigate during execution). Register only for `t2v` and `i2v` in the command registry `components[]`. Persist in `modelSettings[modelId].previewInitialStage` via the existing `settings:model:update` debounce. PromptBox `'run'` payload includes `previewOnly: <value>`.

**Verify:** Open PromptBox in t2v mode, confirm "Preview initial stage" toggle appears in the popup. Toggle on, run, confirm the run payload (console.log in `MpiPromptBox.js` run-handler) includes `previewOnly: true`. Switch to t2i — toggle should not appear.

### 4. Save preview output as `stage: 'preview'` + frozenParams

Edit `js/services/generationService.js` save path: when the run was submitted with `previewOnly=true`, write the resulting sidecar with `stage: 'preview'`, `frozenParams: { seed, prompt, negative, dims, frames }` (snapshot from the actual injection params used), `loraSnapshot: [{ name, strengthModel, strengthClip }, ...]` from `modelSettings`. The MP4 captured is whatever ComfyUI emitted (preview node output). The `_collectComfyOutputUrls` in `comfyController.js` already grabs whatever is in `output.gifs` — confirm we pick the preview-node output specifically. If the workflow has both nodes wired, we may need to filter by node title (`Preview` vs final `SaveVideo`); investigate during execution.

**Verify:** Run with `previewOnly=true`. Check the sidecar JSON — `stage: 'preview'`, `frozenParams` populated, `loraSnapshot` populated. The MP4 file is the low-res preview clip. Reopen project, confirm the in-memory MediaItem reflects the same fields.

### 5. Gallery card: PREVIEW badge + Continue / Discard buttons + click gate

Edit `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` card render around `:214-313`:
- When `item.stage === 'preview'`: render a corner badge "PREVIEW" using existing badge pattern at `:222`. Use accent OKLCH token. Use BEM `.mpi-gallery-grid__preview-badge`.
- Render two overlay buttons: `Continue` (primary accent) and `Discard` (ghost). Use `MpiButton`. Mount via per-card slot wrapper after `:224` (mirror `fav-wrap` pattern). Use icons from `js/utils/icons.js` (add `play-forward` and `discard` if missing).
- Click handler at `:416`: if `item.stage === 'preview'` AND target is the card body (not Continue/Discard) → return early, do not emit `'open-group'`. Continue button click → emit `'preview:continue'` with the item. Discard click → confirm dialog → emit `'preview:discard'`.

**Verify:** Run a preview generation. Gallery shows the new card with PREVIEW badge + two buttons. Click card body → no navigation. Click Continue → console-log fires `preview:continue` event with item id. Click Discard → confirm dialog appears.

### 6. Continue handler: re-submit with frozen params, replace card on finalize

Edit `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` (or wherever `'open-group'` is handled): subscribe to `'preview:continue'` and `'preview:discard'` events. Continue handler:
1. Read `frozenParams` + `operation` + `modelId` from the item's sidecar.
2. Build a run payload using frozen `seed`, `prompt`, `negative`, dims, frames + **current** `modelSettings` LoRAs.
3. Submit via the queue API exposed by plan #1 (`commandExecutor.runCommand` honoring current `generationMode`). Pass `previewOnly: false`.
4. Tag the submission so the resulting sidecar replaces the preview card: pass `replaceItemId: <previewItemId>` in the payload.
5. In `generationService.js` save-generation path: when `replaceItemId` is set, mutate the existing sidecar in place — rewrite stage to `'final'`, swap MP4 file (delete old preview MP4, save new final MP4), drop `frozenParams`, keep id stable. Emit `'gallery:item-updated'` so the grid re-renders the card without losing position.

Discard handler: delete sidecar + MP4 via existing delete route. Emit `'gallery:item-removed'`.

While Continue is in flight for a card, hide its Continue + Discard buttons and overlay a "Generating final…" status strip; restore on cancel/error.

**Verify:** With Single mode + idle: click Continue on preview card → final video generates → preview card swaps to final card in same gallery slot, MP4 plays final. Click on the resulting final card → navigates to history (preview gate lifted). Discard test: click Discard → sidecar + MP4 file gone, card removed.

### 7. Continue-while-busy behavior per generation mode

Tie into plan #1 generation mode. In the Continue handler:
- Single + idle: submit immediately.
- Single + busy: mount an inline `MpiToast` (variant `warning`) "Generation in progress — stop or wait" using the existing pattern in `js/services/downloadService.js` (no `toast:warn` event bus exists). Do not submit.
- Queue: submit (will land in ComfyUI native queue). Continue button shows "Queued" state until it becomes the active job.
- Auto-loop + idle (loop not running): submit as one-off (does not start the loop).
- Auto-loop + active: enqueue after current job completes; loop resumes after Continue lands. Verify with user during execution if a different preference comes up.

**Verify:** Toggle through the three modes (per-model `generationMode` from plan #1). For each: kick off a long generation, then click Continue on a preview card, observe expected behavior. Console-log queue depth + per-mode decisions.

### 8. Documentation + rule files sync

Update only what changed:
- `.claude/rules/comfy_injection.md`: ALREADY UPDATED in this session (Preview_Only boolean injection + Preview/Output capture node contract + multi-stage workflow authoring contract). Re-verify still accurate after to-dos 5-7.
- `.claude/rules/component-events.md`: add `'preview:continue'`, `'preview:discard'`, `'gallery:item-updated'`, `'gallery:item-removed'` (whichever are new).
- `.claude/rules/component-state.md`: PromptBox now reads `modelSettings[modelId].previewStage` (NOT `previewInitialStage` — actual key in code is `previewStage`).
- `docs/project-integrity.md`: extend the sidecar schema section with `stage`, `frozenParams`, `loraSnapshot`.
- `.claude/rules/components.md`: gallery card now has preview-stage variant.
- `.claude/rules/component-comfy.md`: document new `t2v_ms` / `i2v_ms` ops + that `Preview_Only` is injected only when `previewOnly === true`.

**Verify:** Look at the five edited docs — confirm each new fact is present, no unrelated content modified.

## Out of scope (explicitly)

- Hot-continue using `LoadLatent` (deferred — needs workflow-author support; cold path only in v1).
- LTX 2.3 integration (handled in plan #3, which reuses this plan's preview-gate machinery).
- 12-LoRA support (plan #3).
- Preview clip retained alongside final after Continue (per user spec, preview is replaced — no archival v1).

## Open questions to confirm during execution

1. **Output node disambiguation: RESOLVED.** When `previewOnly === true`, `commandExecutor.js` switches its capture-title filter to `'preview'` (instead of `'output'`). Workflow MUST have a `VHS_VideoCombine` node titled exactly `"Preview"` for the preview clip and one titled exactly `"Output"` for the final clip. Verified working with `Wan22_t2v.json`.
2. **Replacement vs new entry on Continue:** the user spec says "replace the preview card". Confirm this means the same gallery position + same item id. If the grid re-sorts on update, the visual replacement may shift; might need to anchor by id.
3. **Auto-loop interaction with Continue:** spec'd as "queue after current loop iteration, loop resumes". Confirm during to-do 7.
