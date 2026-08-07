# ComfyUI injection — multi-stage video workflows

> **AI INSTRUCTION:** Split out of [comfy_injection.md](comfy_injection.md) 2026-07-29 (that
> file was over the 200-line cap). This is the `_ms` two-file contract ONLY — the title map,
> the silent-skip trap, LoRA slots and standalone injectors stay in the parent file. Read the
> parent for how injection works at all; read this when touching `t2v_ms` / `i2v_ms`,
> preview -> stage-2, LoadLatent staging, or dual-latent (LTX).


> ## SUPERSEDED IN PART — read this before anything below (MPI-449/452/456/466)
>
> **The two-file premise is dead, and so is `LoadLatent`.** Everything below was
> written when ComfyUI's `/prompt` API had no way to skip a node, which forced a
> physically separate `_stage2` file per model. **Lazy inputs fixed that** —
> `MpiBlocker` and `MpiSaveLatent.enabled` became lazy (MPI-449), so a gated
> sampler genuinely does not run instead of running and being discarded.
>
> What is true now:
>
> - **ONE file carries both stages.** `MpiStageLatents` (titled
>   `Input_Video_Latent`) replaced the whole save/load/boolean cluster; its
>   `is_continue` / `is_preview` are WIDGETS, written by `_buildParams` as
>   `Input_Video_Latent.is_continue` / `.is_preview`. Models declare
>   `capabilities.singleFileStages: true`, which stops `resolveWorkflowFile`
>   appending `_stage2`. **No `_stage2` file exists anywhere** — H3 never had one,
>   WAN and LTX lost theirs.
> - **Nothing is staged for stage 1.** The validation trap below was real for
>   `LoadLatent`, which is gone from every shipped graph, so
>   `WORKFLOW_INPUT_DEFAULTS`, `POST /comfy/prepare-workflow-inputs` and the three
>   dummy `.latent` files were deleted (MPI-466). `POST /comfy/stage-preview-latent`
>   is a DIFFERENT mechanism and still runs: it writes the real per-preview latent
>   where `load_path` reads it.
> - **The dual-latent split is gone** — `MpiStageLatents` handles video+audio in one
>   node, so `Input_Audio_Latent` / `Output_Audio_Latent` no longer exist.
> - **`Input_Preview_Only` and `Input_Is_Continue` are gone as params too (MPI-473).**
>   The boolean nodes died with the cluster above, but `_buildParams` kept emitting
>   both keys, and `comfyController` kept a defensive strip that found no matching
>   node and logged `Preview_Only requested but workflow has no matching node` on
>   EVERY multi-stage run. Both the params and the guard are deleted. The gate has
>   exactly ONE route now: `Input_Video_Latent.is_preview` / `.is_continue`.
>
> Sections below that describe the two-file swap, `Stage1_Bypass` derivation,
> `LoadLatent` injection or latent staging are HISTORY. They are kept because the
> reasoning explains why the current design looks the way it does, and rewriting
> the file wholesale is its own task. Trust this banner over them.

Operations with `_ms` suffix (e.g. `t2v_ms`, `i2v_ms`) are **multi-stage**: a low-res preview pass plus a final pass that consumes the saved stage-1 latent. The two phases were originally implemented as **two separate workflow files** rather than one branched workflow, because ComfyUI's `/prompt` API had no runtime node-bypass flag — a single-file branched workflow always executed every node referenced in the dependency graph regardless of any `MpiIfElse`/boolean gating. (Lazy inputs removed that constraint — see the banner.)

**Multi-stage is per-MODEL, not per-op (MPI-127).** The `_ms` op keys (`t2v_ms`/`i2v_ms`) are SHARED across WAN and LTX. Whether a model actually exposes the preview/stage-2 flow is gated by `model.capabilities.multiStage`: both WAN and LTX = `true` (show the `previewStage` toggle, run the two-file flow below). LTX was single-stage in MPI-127 (`multiStage:false`) because preview→stage-2 needs DUAL-latent staging (video + audio); **MPI-128 wired that and flipped LTX to `multiStage:true`** (see dual-latent note under "LoadLatent injection contract"). So "an `_ms` op = multi-stage" is only true when the active model declares `multiStage`. A model with `multiStage:false` would use only the stage-1 file (no stage-2). Separately, `capabilities.branchingContinue` gates the Continue (branch) button: WAN = `true` (per-stage LoRAs vary stage-2); LTX omits it → **Finish-only** (refined LTX workflow locks stage-2 to stage-1, prompt has no effect on the continuation). See `commandAllowsBranchingContinue(key, model)` in `commandRegistry.js`.

**Two-file convention:**
- `<name>.json` — stage-1 (preview) workflow. Contains the SaveLatent node(s), `Input_Preview_Only`, `Output_Preview` and `Output_Video` capture nodes, full sampler chain.
- `<name>_stage2.json` — stage-2 workflow. **Authored by saving the API JSON with the stage-1 KSampler node toggled to Bypass mode in the ComfyUI graph editor.** ComfyUI's "Save (API)" export then deletes the bypassed node and rewires every consumer to the bypassed node's upstream feeder slot (Comfy's standard splice behavior). The result is a stage-2-only graph where `LoadLatent` feeds directly into the low-noise sampler. **NOTE: WAN/LTX stage-2 siblings are now GENERATED from the stage-1 API export by `comfy_workflows/scripts/workflow_generation/` (see its `README.md`) — the bypass+re-export is mechanical (title-keyed on `Stage1_Bypass` + `Is_Continue`), not hand-authored.**

`resolveWorkflowFile(model, op, engine, {stage2})` (in `modelConstants/resolveModelDeps.js`, called from `commandExecutor.runCommand`) returns `<name>.json` normally; when `stage2 === true` it swaps the basename to `<name>_stage2.json`, then appends the engine's `workflowSuffix` (e.g. `_gguf` on a Pod → `<name>_stage2_gguf.json`). (MPI-165)

**Authoring contract** (all titles are `Input_*`/`Output_*` — the whole video fleet is post-MPI-252):

Stage-1 base file MUST contain:
- A `MpiBoolean` node titled `"Input_Preview_Only"` whose `inputs.boolean` gates the preview/final branch.
- A `LoadLatent` node titled `"Input_Video_Latent"` (kept for ComfyUI validation; never reached by stage-1's data flow).
- A `SaveLatent` node titled `"Output_Video_Latent"` that emits the stage-1 latent on preview runs. **LTX saves TWO** (MPI-128) — a video `SaveLatent` titled `"Output_Video_Latent"` (prefix `ltx_video_latent`) and an audio one titled `"Output_Audio_Latent"` (prefix `ltx_audio_latent`). The app tells them apart by SaveLatent node TITLE (`_collectComfyLatents` tags role: title containing "audio" → audio, else video).
- A capture node titled `"Output_Preview"` whose payload is the preview clip.
- A capture node titled `"Output_Video"` whose payload is the full-run final clip.

Stage-2 sibling file (`_stage2.json`) MUST contain:
- A `LoadLatent` node titled `"Input_Video_Latent"` whose `inputs.latent` is the per-preview filename injected at runtime.
- A capture node titled `"Output_Video"`.
- NO `Input_Preview_Only` node, NO `SaveLatent`, NO stage-1 sampler (these vanish when the base file is exported with stage-1 KSampler bypassed).

The `Is_Continue` boolean node is **no longer used by WAN** — WAN branch selection happens via the file swap, not an injected boolean. **LTX differs (MPI-127):** LTX's stage-2 is GENERATED no-splice — `Input_Is_Continue` drives an `MpiIfElse` that selects the loaded `Input_Video_Latent`/`Input_Audio_Latent` over the live stage-1 latent, so the generator derives the stage-2 file by flipping that one boolean (no node deletion/rewire). The app still does NOT inject `Is_Continue` at runtime for either model — the stage-2 FILE is pre-stamped. (Live as of MPI-128: LTX preview→Finish reuses both staged latents; this path is exercised, no longer moot.)

Single-stage workflows (no `_ms`) MUST NOT have the `Preview_Only` node and need only the `Output` capture node.

**LoadLatent injection contract:** ComfyUI validates the `LoadLatent` selector even when the workflow branches away from it. The app always injects `LoadLatent`:
- Stage-1 runs (Preview ON or OFF): `LoadLatent = 'ComfyUI_00001_.latent'`. The default lives at `comfy_workflows/input/ComfyUI_00001_.latent` and is copied into the active engine `input/` folder by `POST /comfy/prepare-workflow-inputs` before every `_ms` submission.
- Stage-2 runs (Continue/Finish): `LoadLatent = '<previewUuid>.latent'`. The per-preview latent lives in `<project>/Media/.latents/<previewUuid>.latent`; `POST /comfy/stage-preview-latent` copies it into the active engine `input/` folder before the stage-2 submission.

**Dual-latent (LTX, MPI-128).** LTX preview→stage-2 stages BOTH a video and an audio latent. The audio one rides a parallel optional set of fields, so WAN (single latent) is untouched (all audio fields stay undefined):
- Producer: stage-1 emits `Output_Video_Latent` + `Output_Audio_Latent`; `generationService` splits them into `previewAssets.latent` (video) + `previewAssets.audioLatent` (audio).
- Persist: `materializePreviewAssets` writes `<project>/Media/.latents/<id>.latent` (video) + `<id>.audio.latent` (audio); the sidecar records both with `status`.
- Validate: `validate-preview-assets` stats both; `canFastPath` requires the audio latent on disk **only when the sidecar declares one**.
- Dispatch: `MpiGalleryBlock` Continue/Finish pass `loadAudioLatentName` + `audioLatentFilePath` alongside the video pair.
- Stage: `_stagePreviewLatent` calls the route TWICE (once per latent), staging the audio latent under engine name `ltx_audio_latent_00001_.latent`.
- Inject: `_buildParams` emits `Input_Audio_Latent` (the staged audio name) next to `Input_Video_Latent`. Stage-1 / WAN fall back to the baked default `ltx_audio_latent_00001_.latent` (validation-only, never read on those runs).
- Cleanup: item delete drops both `<id>.latent` and `<id>.audio.latent`.

**THE VALIDATION TRAP — now LATENTS ONLY (MPI-272).** ComfyUI validates the file selector on **EVERY** `LoadLatent` node in a submitted graph — even nodes the data flow never reaches (e.g. `LoadLatent` behind an `Is_Continue` gate). If a baked latent filename has no matching file in the active engine `input/`, the whole prompt dies with `Invalid latent file` and `Output will be ignored`, even though that node is dead in this run. This bit LTX-2.3 (MPI-127): its t2v graph carries two `LoadLatent` nodes (`Input_Video_Latent` + `Input_Audio_Latent`, both behind the continue gate) — when neither was staged, both failed validation. The fix (still in force for latents): every baked latent name has a real default in `WORKFLOW_INPUT_DEFAULTS` staged before each submit (`ComfyUI_00001_.latent`, `ltx_video_latent_00001_.latent`, `ltx_audio_latent_00001_.latent`). On a stage-2 run the two LoadLatent nodes additionally get the staged per-preview latents injected over their baked names (dual-latent, MPI-128).

**Image / mask / video / audio inputs NO LONGER hit this trap.** They are path-reading loader nodes (`MpiLoadImageFromPath` / `MpiLoadAudio` / `MpiLoadVideo`, or an `MpiString` fan-out) that take a full path in a `string` widget and **self-gate on empty string** (`ExecutionBlocker`) — there is no baked filename to validate, so an unused optional slot (t2v `Input_Start_Frame`, a no-audio `Input_audio`) rejects nothing. `placeholder.png` / `ltx_silence.wav` are gone. Full contract: [docs/workflow-authoring/media-inputs.md](../../docs/workflow-authoring/media-inputs.md).

**`MpiString` = a media PATH. `MpiText` = plain text/data. Picking the wrong one breaks REMOTE ONLY (MPI-380).** `PATH_MEDIA_CLASSES` in `comfyController` holds `MpiLoadImageFromPath`, `MpiLoadAudio`, `MpiLoadVideo`, `VHS_LoadVideoPath` **and `MpiString`** — so ANY param whose same-titled node is an `MpiString` is classified `imagepath` and pushed through `_resolveMediaPath()` and, on a remote engine, `_uploadRemoteMedia()`. Aim a param carrying non-path data (JSON, a number, a prompt fragment) at an `MpiString` and the Pod tries to upload a file named after that data. **Locally it passes** — `_resolveMediaPath` returns something harmless and nothing uploads — so a green local test proves nothing about this. `MpiText` subclasses `MpiString` in the node source but is a distinct `class_type`, is NOT in the set, and exposes the same `string` field, so switching is a one-word change in the raw graph (also fix `Node name for S&R` and the output name → `Text`). Shipped precedent both ways in `klein_t2i.json`: `MpiText` for `Input_Positive` / `Input_Negative`, `MpiString` for `Input_Mask` / `Input_Image_2`. Live example of the data case: SAM3's `Input_Points_Positive` / `Input_Points_Negative` in `img_auto_mask.json`, guarded by `tests/auto-mask-inject-titles.test.cjs`.

**The latent contract — DELETED, do not re-add (MPI-466).** This paragraph used to say every baked `LoadLatent.inputs.latent` filename needed a real default staged from `comfy_workflows/input/` via `WORKFLOW_INPUT_DEFAULTS` + `POST /comfy/prepare-workflow-inputs`, and that a new model must ship one latent per `LoadLatent` node. All of it is gone: `MpiStageLatents` reads a `load_path` widget the app writes per run, no shipped graph has a `LoadLatent`, and the route, the list and the three dummy files were removed. **Adding a model now stages nothing** — latents included. `tests/optional-media-placeholder.test.cjs` fails if either a bare `Load*` node or `WORKFLOW_INPUT_DEFAULTS` comes back. Media inputs (image/mask/video/audio) still need nothing staged — they read a project-folder path from `string`. Still test a video model with NO audio/frame input to confirm the path nodes self-gate cleanly.

Note the injector's `Input_Video_Latent` override (`commandExecutor` ~L479) points stage-1 at `ComfyUI_00001_.latent` regardless of model — fine because stage-1 never *reads* the latent (validation only), and that default is always staged. A model's own baked latent name still needs staging for the nodes the override doesn't rename.

Engine-input copies are NOT proactively cleaned per-run. The server's existing `cleanComfyUITempFiles` shutdown hook (SIGTERM/SIGINT in `server.js`) empties `input/` and `output/` on app exit. Mid-session bloat is bounded by uuid uniqueness — each preview owns one staged latent and stage-2 reads it; subsequent reruns overwrite the same name.

**Preview support-asset validation + cold fallback:** Before Continue/Finish dispatches, `MpiGalleryBlock` calls `projectService.validatePreviewAssets(itemId)` which hits `GET /project-media/:projectId/validate-preview-assets`. The route stats the project latent (`Media/.latents/<id>.latent`) and any I2V snapshots (`Media/.preview-assets/<id>/<role>.<ext>`) recorded on the sidecar and returns one of three states:

- `canFastPath` — latent present. Continue branches to stage-2 (existing fast path); Finish runs stage-2 with `replaceItemId`.
- `canColdFallback` — latent missing, `frozenParams` complete, all required snapshots present. Continue reruns stage-1 with `previewOnly=true` + `replaceItemId=<previewId>` to rebuild the latent in place, then on `gallery:item-updated` auto-enqueues the stage-2 branch. Finish runs the full base `_ms` workflow with `previewOnly=false` + `replaceItemId` — no `isStage2` swap, no `LoadLatent` override — so stage-1+stage-2 fuse in a single submission.
- `blocked` — neither path possible. Card shows red "Missing" badge and hides Continue/Finish; user deletes the preview to recover (`DELETE /project-media` route cleans `.latents/<id>.latent` + `.preview-assets/<id>/` when sidecar `stage === 'preview'`).

T2V previews carry no snapshot array, so snapshot validation is a no-op for them — only latent state gates Continue/Finish. Cold-fallback Continue's stage-1 rerun reuses the existing materialization route; the `copySnapshotSource` helper now guards same-path copies because the rerun reads the preview's own already-materialized snapshot into the destination path of the same name.

**Symptom of a dead preview gate:** the user toggles "Preview initial stage" in PromptBox, runs, and gets a full final video instead of stopping at preview.

**There is no warning for this any more, and there never usefully was one (MPI-473).** `comfyController.runWorkflow` used to scan for a `Preview_Only` / `Input_Preview_Only` node and `clientLogger.warn` when it found none — but once every graph migrated to `MpiStageLatents`, no graph had the node, so the warning fired on EVERY multi-stage generation whether preview worked or not. It was pure noise and is deleted along with the params it guarded.

Diagnose it at the real gate instead: `_buildParams` writes `Input_Video_Latent.is_preview`, and injection **silently skips a param whose title matches no node**. So check, in order — (1) the graph has an `MpiStageLatents` titled exactly `Input_Video_Latent`; (2) the dispatched graph actually carries `is_preview: true` — read it off the engine's `/history`, not off the run finishing; (3) `payload.historyMode` is not forcing it false (the video-history workspace does that deliberately).
