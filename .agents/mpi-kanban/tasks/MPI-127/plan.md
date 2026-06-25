# LTX-2.3 app integration — stand up the LTX video model family

> Adaptive large plan. Source of truth for behavior: `brief.md` (LOCKED audio matrix)
> + the ship workflow `comfy_workflows/scripts/workflow_generation/LTX_i2v_t2v_template.json`
> (151 nodes, scanned 2026-06-25 — supersedes the brief's stale dep list).
> Decisions front-loaded with the user (scalable-foundation mode). No mid-impl forks remain.

## Current State

Project mode: **scalable-foundation** (full guardrails — rules, BEM, factory, events, state proxy).

LTX-2.3 has **zero app-side presence**: no model entry, no deps, no `comfy_workflows/LTX*` files,
no `generate_ltx.py`, no ops, no audio UI. The ComfyUI workflow is authored + live-tested + saved.

**Ground-truth scan of the ship workflow (2026-06-25) — what the app must serve:**

- **9 ship dependency files** (only what the workflow actually references — the `mpi-ci`
  install script pulls MANY more for deferred branches; ignore those):

  | File | Folder | Source (tonight) |
  |---|---|---|
  | `ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors` (39 GB) | `diffusion_models/` | `Kijai/LTX2.3_comfy` |
  | `LTX23_video_vae_bf16.safetensors` (1.45 GB) | `vae/` | `Kijai/LTX2.3_comfy` |
  | `LTX23_audio_vae_bf16.safetensors` (0.37 GB) | `vae/` | `Kijai/LTX2.3_comfy` |
  | `ltx-2.3_text_projection_bf16.safetensors` (2.31 GB) | `text_encoders/` | `Kijai/LTX2.3_comfy` |
  | `gemma-3-12b-it-heretic-fp8-comfy.safetensors` (14.5 GB) | `text_encoders/` | `Kijai/LTX2.3_comfy` (verify; else anongecko) |
  | `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` | `latent_upscale_models/` | `Lightricks/LTX-2.3` |
  | `LTX2.3\LTX2.3_Soft_Enhance.safetensors` | `loras/LTX2.3/` | existing MPI mirror |
  | `LTX2.3\ltx2.3-transition.safetensors` | `loras/LTX2.3/` | `valiantcat/LTX-2.3-Transition-LORA` |
  | `LTX2.3\id-lora-talkvid\ltx-2.3-id-lora-talkvid-3k.safetensors` | `loras/LTX2.3/id-lora-talkvid/` | existing MPI mirror |

  **Temporal upscaler is NOT in the workflow** (brief was stale). Spatial only.
  **First model with non-merged baked LoRAs:** transition #191, soft-enhance #236 (str 0.7),
  talk3_ID #277 (str 1.0) — `MpiLoraModel` nodes, baked into the workflow, ship as `commonDeps`
  (NOT user LoRA slots). LoRA `filename` strings carry engine-OS subfolder nesting verbatim
  (`LTX2.3\...`, `id-lora-talkvid\...`) — see `[[project-lora-path-separator]]`.

- **Base-model files are baked into the loaders** (`UNETLoader`/`DualCLIPLoader`/`VAELoader`/
  `LatentUpscaleModelLoader` by class_type, NOT `Input_*` titles). The app does NOT inject base
  model paths — only the dep manifest needs them so the downloader fetches them.

- **6 user LoRA slots:** `Input_Lora_1..6` (#264-269, `MpiLoraModelClip`, default `'None'`). Flat —
  no high/low staging (unlike WAN). Model declares no `loraStages`; `loraStrengths: ['model']`.

- **Two saved latents** (video + `Input_Audio_Latent` #69) — stage-2 fetches BOTH (WAN saves one).

- **Audio gates (verified node titles + classes):**
  `Input_Use_Audio` #190 (master enable, baked `true`) · `Input_Use_Reference_Audio` #296 (MpiIfElse) ·
  `Input_Use_Input_Audio` #203 (MpiSimpleBoolean) · `Input_Use_Transition` #192 (MpiBoolean) ·
  `Input_Audio_File` #197 (LoadAudio, `inputs.audio`).

- **Mode/output gates:** `Input_Text_to_video` #314 (i2v↔t2v fan-out) · `Input_Use_End_Image` #313 (FLF) ·
  `Input_Is_Continue` #71 · `Input_Preview_Only` #73 · `Output_Preview` #72 (SaveVideo) · `Output_Video` #186.

**Existing infra confirmed by investigation:**
- `LTX_RATIOS` + `RATIO_MODES.ltx='quality'` + `getModelRatios case 'ltx'` already wired in `js/utils/ratios.js`.
- `el.audioCount` already tracked + emitted in `MpiPromptBox` `media-change`. Audio chips already render.
- Boolean injection: `comfyController` writes `node.inputs.boolean` for any title-matched node — params just need the right keys.

## Locked Decisions (front-loaded with user, scalable-foundation)

1. **Generalize ops; do NOT multiply op keys.** `i2v`/`t2v` ops carry capability-driven component
   groups, not per-model copies. Model declares `capabilities`; the op renders the intersection.
   Both WAN + LTX keep `allowsBranchingContinue: true` (LTX is genuinely two-stage: prompt-editable
   stage-2 + preview-before-final; stage-2 is the slower stage so previewing first has real value).
2. **`tier:2` flag on the model entry** drives tier-2 `Input_*` param emission in `_buildParams`.
   Extensible to every future tier-2 model.
3. **Keep the `_ms` key suffix this release.** Killing `.endsWith('_ms')` → `command.isMultiStage`
   is a separate follow-up card (wider blast radius; not under tonight's deadline).
4. **Media is slot-based, capacity from the model.** Tonight: `i2v` = up to 2 images (start+end frame,
   like WAN) + 1 audio; `t2v` = 1 audio. Audio = first-class media (big audio icon in gallery +
   prompt box; audio cards are NOT clickable into the history workspace, same as a preview). The
   5+-image multimodal UI is deferred — wire the `{min,max}` slot seam now, leave `max` a data value.
5. **Base files from stable upstreams tonight** (Kijai / Lightricks / valiantcat + existing MPI
   mirrors). Self-hosting the 39 GB transformer + the rest to MPI HF is a **post-release follow-up
   card** (upload tax + machine slowdown can't block tonight's ship; Kijai won't pull this month).
6. **Tier-2 capture fix:** `commandExecutor.js:906` `null` → `'output_preview'`.

## Completed

- [x] Investigation (4 parallel read-only agents) + ground-truth workflow scan.
- [x] All architecture forks resolved with user.
- [x] **Batch 1 — Foundations (all 3 done + verified):**
  - `generate_ltx.py` + registry `("LTX_","ltx")` — fans template → 4 files (no-splice design,
    just flips `Input_Is_Continue`); DoD assertions PASS.
  - Capture fix `commandExecutor.js:906` (`null` → `'output_preview'`) — lint clean.
  - 9 weight deps + `ComfyUI-LTXVideo` node in `dependencies.js`; node_lock pinned to tested SHA
    `4f45fd6c222eb06eb3e46605da62e7c889e4be5c` (PR#513). All 9 URLs HEAD-200. 4 of 9 on MPI HF
    (gemma, soft-enhance, transition, talkvid); 5 upstream (Kijai/Lightricks) → MPI-128 self-host.
    **sha256 still null — run `mpic-compute-dep-hashes` before ship.**
- [x] **WAN tier-2 bump** (user re-authored both WAN templates + LTX output-latent rename).
  `generate_wan.py` titles updated. All 8 video workflows regenerated + DoD-verified PASS.
  Tier-1 still alive for IMAGE workflows (SDXL/upscaler/detailer) — fleet is MIXED.
- [x] **Phase 3 — tier-2 param feed** via dual-emit alias in `_buildParams` (no tier flag, no
  control migration; safe because injection skips unmatched titles). `LoadLatent` →
  `Input_Video_Latent` explicit. Lint clean.
- [x] Phase 4a (dual-latent stage-2) + all deferred items CARDED to **MPI-128**. LTX ships
  **single-stage** this release (user decision).

## Remaining Work

Ordering note: deps + workflow-gen + capture-fix have **disjoint ownership** and no cross-deps →
**Parallel Batch 1**. The op-model generalization + tier-2 param feed + audio UI form a dependent
chain (UI needs the op components which need the generalized op shape) → sequential **Phase 2+**.

## Parallel Batch: Foundations (independent, disjoint ownership)

- [ ] **Workflow-gen handler.** Write `comfy_workflows/scripts/workflow_generation/generate_ltx.py`
  mirroring `generate_wan.py`, with LTX constants: `BYPASS_TITLE="Stage1_Bypass"`,
  `IS_CONTINUE_TITLE="Input_Is_Continue"`, `T2V_GATE_TITLE="Input_Text_to_video"`,
  `SLOT_TO_INPUT={"LTXVNormalizingSampler":{0:"latent_image"}}`, `REQUIRED_TITLES` adjusted for
  LTX (`Output_Video`, `Input_Video_Latent`, `Input_Audio_Latent`, `Input_Is_Continue`). `build()`
  fans the ONE template into 4 files by stamping `Input_Text_to_video` boolean:
  `LTX_i2v.json`(false)+`_stage2`, `LTX_t2v.json`(true)+`_stage2`. Uncomment `("LTX_","ltx")` in
  `registry.py`. Ownership: `comfy_workflows/scripts/workflow_generation/generate_ltx.py`,
  `registry.py`. Briefings: comfy_injection. **Verify:** `python orchestrate.py --all` emits all 4
  `comfy_workflows/LTX_*.json`; diff a generated `_stage2` node-for-node against a hand-authored
  stage-2 export (the WAN proof method) — bypass node gone, consumers rewired, `Input_Is_Continue=true`.

- [ ] **Deps manifest.** Add the 9 ship deps to `js/data/modelConstants/dependencies.js` with
  exact `filename` (engine-OS subfolder nesting verbatim for the 3 LoRAs + upscaler folder
  `latent_upscale_models/`), `url` per the Locked-Decisions source table, `sha256: null`. Confirm
  the `latent_upscale_models` folder is in the app's models-path YAML; add the block if missing
  (additive, never delete — `[[project-models-path-absolute]]`). Ownership: `dependencies.js`,
  (if needed) the models-path YAML writer. Briefings: comfy_engine. **Verify:** each dep id resolves;
  a HEAD request to each URL returns 200 (esp. gemma — Kijai vs anongecko); run
  `mpic-compute-dep-hashes` to fill sha256, confirm no nulls remain for ship deps.

- [ ] **Tier-2 capture fix.** `js/services/commandExecutor.js:906` change
  `const _videoOutputTitle = _captureTitle === 'output' ? 'output_video' : null;` to
  `... : 'output_preview';`. Ownership: `commandExecutor.js` (this single line only). Briefings: none.
  **Verify:** unit-trace — a preview-only `_ms` payload now matches a node titled `Output_Preview`;
  a WAN preview (`Preview` node) still matches `t==='preview'`; non-preview still matches
  `output`/`output_video`. No other line in this file touched (avoid colliding with Phase 2 edits —
  see Plan Drift note).

## Phase 2: Op-model generalization + capability flags

- [ ] Add `capabilities: { multiStage, audio }` + `tier` to the model-def shape. Set
  `wan-22 → {multiStage:true, audio:false}, tier:1`. Refactor the `i2v`/`t2v` (`*_ms`) op entries in
  `js/data/commandRegistry.js` to declare `baseComponents` / `multiStageComponents` /
  `audioComponents` + an `order` master list, replacing the flat `components[]`. Keep
  `allowsBranchingContinue:true`. Add a slot-based media shape `{key,mediaType,min,max}` where `max`
  reads model capacity (WAN images unchanged). **Verify:** WAN i2v/t2v still render the exact same
  controls as before (no audio control appears for WAN); `npm run lint`; a WAN gen smoke-test from
  the running app produces an identical control set + a working preview→finish.

## Phase 3: Tier-2 param feed (`_buildParams`)

- [ ] In `commandExecutor._buildParams`, when `getModelById(payload.modelId)?.tier === 2`, emit
  `Input_`-prefixed param keys (`Input_Positive/Negative/Seed/Width/Height/Duration/Preview_Only`,
  `Input_Start_Frame/End_Frame/Use_End_Image`, `Input_Lora_1..6`) and the **dual** stage-2 latents
  (`Input_Video_Latent` + `Input_Audio_Latent`). Tier-1 models (WAN) unchanged. **Verify:** dump the
  params object for a synthetic LTX i2v payload — keys are all `Input_*`, both audio+video latent keys
  present on a stage-2 run; same dump for WAN is unchanged (bare titles).

## Phase 3 — DONE (2026-06-25)

Implemented as a **dual-emit alias** in `_buildParams`, NOT a tier flag or control
migration (the fleet is mixed: image workflows stay tier-1, video workflows are tier-2). Every bare
param key gets an `Input_`-prefixed alias; injection silently skips params with no matching node, so
the unused half is a no-op. `LoadLatent` -> `Input_Video_Latent` emitted explicitly (rename, not
prefix). Lint clean. WAN image/video gens unaffected (bare keys still present).

## Phase 4a: LTX dual-latent stage-2 staging — CARDED to MPI-128 (next release)

Decision (2026-06-25, user): ship LTX **single-stage** tonight; dual-latent stage-2 staging +
preview→Continue moves to **MPI-128** (next-release LTX app follow-up). LTX ops register single-stage
(no `previewStage` / `_ms`) for this release. Stage-2 LTX workflow files stay generated + ready.
Original phase notes preserved below for the MPI-128 session:

- [ ] LTX saves TWO latents (`Output_Video_Latent` + `Output_Audio_Latent`) and stage-2 loads BOTH
  (`Input_Video_Latent` + `Input_Audio_Latent`). The current `/comfy/stage-preview-latent` route +
  `loadLatentName` mechanism stage a SINGLE file. Wire dual staging so an LTX preview can be
  continued/finished: preview run must persist both latents; stage-2 payload must carry both names;
  the stage route must stage both. **Verify:** an LTX preview → Finish reuses both staged latents and
  the final matches the preview. **Scope note:** stage-1 generation (the ship feature) does NOT need
  this — audio latent is generated live in stage-1. This gates only preview→continue. If it can't
  land tonight, ship LTX with preview→Finish disabled or single-stage only, and card this.

## Phase 4: LTX model entry + ops wiring

- [ ] Add the `ltx-23` model entry to `js/data/modelConstants/models.js`:
  `type:'ltx', tier:2, mediaType:'video', capabilities:{multiStage:true,audio:true},
  loraStrengths:['model']` (no `loraStages`), `supportedOps:['t2v_ms','i2v_ms']`,
  `workflows:{t2v_ms:'LTX_t2v.json', i2v_ms:'LTX_i2v.json'}`, `commonDeps:[...9 deps + LTX custom
  nodes (ComfyUI-LTXVideo, ComfyUI-BFSNodes if required by ship nodes)...]`,
  `operations:{t2v_ms:{deps:[]}, i2v_ms:{deps:[]}}` (all weights shared → both in commonDeps).
  Add the i2v audio + 2-image slots and t2v 1-audio slot via the op `mediaInputs`. **Verify:** the
  model appears in the manager; `resolveDeps(ltxModel)` returns all 9 (+nodes) with no missing-dep
  throw; `isModelUsable` flips true once deps are marked present.

## Phase 5: Audio-mode UI (`MpiPromptBox`)

**Verify mode for this phase: user-ux.**

- [ ] Add an `audioMode` PromptBoxControl (Reference | Original `MpiRadioGroup`, emits **`'select'`**
  — `[[project-mpi-radio-emits-select]]`) in `audioComponents`, mounted in `#settings-op-slot`,
  ordered first per the op `order`. The radio is **enabled only when an audio chip is present**
  (track via the control's `setAudioPresent(bool)`, called from `_emitMediaChange` when
  `el.audioCount` changes). `getInjectionParams()` returns `{}` when no audio (baked defaults win);
  when audio present: `{ Input_Use_Reference_Audio: mode==='reference', Input_Use_Input_Audio:
  mode==='original', Input_Use_Transition: true }`. NO seed UI, NO influence slider
  (`[[feedback-no-seed-ui]]`). Audio media: big audio icon chip; audio history cards not
  click-through to history workspace (like preview). BEM, factory, dom.js, icons.js, CSS vars,
  `destroy()` collecting `_unsubs`. **Verify:** in the running app, add an audio file to an LTX op →
  radio enables; remove it → radio disables; pick Reference vs Original → params dump sets exactly
  one gate true + transition true; user visually confirms the audio icon + non-clickable card behavior.

## Phase 6: Docs / rules / registry sync

- [ ] Update `.claude/rules/component-comfy.md` (audioMode control + LTX ops + audio gate titles),
  `.claude/rules/comfy_injection.md` (Standard Node Title Map: `Input_Use_Reference_Audio`,
  `Input_Use_Input_Audio`, `Input_Use_Transition`, `Input_Use_Audio`, `Input_Audio_File`,
  `Output_Preview` mark "app wired"), and any operation_registry / version artifacts the bump
  requires (`[[project-bump-rebuild-trigger-table]]`). **Verify:** `npm run release:check` passes;
  rule files name the live nodes/titles that now exist.

## Plan Drift

- **TIER-1 IS EXTINCT (2026-06-25) — supersedes the `tier:2` flag design.** User re-authored
  BOTH WAN templates to tier-2 (`Input_*`/`Output_*` titles, `Input_Lora_High/Low_1..6`,
  `Input_Start/End_Frame`, `Input_Is_Continue`, `Output_Video/Preview/Video_Latent`). All three
  source workflows are now uniformly tier-2. CONSEQUENCE: Phase 3 no longer needs a `tier:2` model
  flag or a conditional remap — `_buildParams` emits `Input_`-prefixed keys for EVERY model, one
  code path. `mediaInputs[].title` becomes `Input_Start_Frame`/`Input_End_Frame` for all video ops
  (WAN + LTX share them, no conflict). Op keys stay shared (`i2v`/`t2v` *_ms), no `ltx_*` keys.
  `generate_wan.py` titles updated to match (`IS_CONTINUE_TITLE`, `REQUIRED_TITLES`). All 8 video
  workflows regenerated + DoD-verified PASS. WAN's staged LoRAs keep `Input_Lora_High/Low_*` (a
  per-model `loraStages` difference, NOT a tier difference) — LTX uses flat `Input_Lora_1..6`.


- **generate_ltx.py is SIMPLER than WAN — no bypass-splice (2026-06-25 graph trace).** LTX bakes the
  stage-2 switch into the workflow: `Input_Is_Continue` #71 drives MpiIfElse #51/#56 that select the
  loaded `Input_Video_Latent`/`Input_Audio_Latent` over the live stage-1 latent; the stage-1 sampler
  #70 stays in the graph (ComfyUI skips it when no consumer selects its output). So `_derive_stage2`
  = deep-copy + flip `Input_Is_Continue` → true. NO node deletion, NO `SLOT_TO_INPUT` slot-map, NO
  rewiring. `build()` still fans the template by stamping `Input_Text_to_video` (i2v=false/t2v=true).
  This supersedes the Batch-1 task's "reuse WAN bypass-one-sampler shape" — strictly less code + no
  slot-map fragility. Verify still holds: generated `_stage2` must differ from stage-1 ONLY by
  `Input_Is_Continue` boolean (and the t2v variant by `Input_Text_to_video`).
- **commandExecutor.js is touched by Batch-1 (line 906) AND Phase 3 (`_buildParams`).** Different
  functions, but same file → run Batch-1's one-line capture fix and Phase 3 in sequence on the same
  file to avoid a parallel-edit collision. If Batch-1 runs parallel, restrict it to line 906 only.
- **Custom nodes RESOLVED (2026-06-25, class_type scan of the ship workflow):** exactly ONE new
  pack — **`ComfyUI-LTXVideo`** (`Lightricks/ComfyUI-LTXVideo`), covering all 16 `LTXV*` types +
  `LatentUpscaleModelLoader` + `EmptyLTXVLatentVideo`. All `Mpi*` (17 types) → `ComfyUI-MpiNodes`
  (locked); `ImageResizeKJv2`/`VAELoaderKJ` → `comfyui-kjnodes` (locked); everything else is ComfyUI
  core. **`ComfyUI-BFSNodes` is NOT a ship dep** (zero BFS class_types in the workflow — head-swap
  branch only). Phase 4 just adds `ComfyUI-LTXVideo` to `node_lock.json` (pinned commit — get the
  tested SHA via `git -C custom_nodes/ComfyUI-LTXVideo rev-parse HEAD` on the validated Pod, NOT
  upstream HEAD) + a `dependencies.js` entry built from the lock + `commonDeps`.

## Verification

**Verify mode:** user-ux (Phase 5 has a UI surface the user must judge in the running app;
Phases 1-4 + 6 are `auto`).

End-to-end: install LTX in the app → generate a t2v with an audio file (soundscape) → generate an
i2v with start frame + audio in Reference mode (voice-ID) and Original mode (direct) → stage-1
preview renders + captures (Output_Preview), Finish produces the final (Output_Video) → audio plays
in the gallery card, card shows the audio icon, audio-only cards don't open the history workspace.
`npm run lint` + `npm run release:check` clean.

## Preservation Notes

- **New follow-up cards to create at end-session:**
  (a) Self-host the 9 LTX base files to MPI HF (39 GB transformer first) + swap dep URLs next release.
  (b) Kill the `_ms` key-suffix magic → `command.isMultiStage` flag across commandExecutor.
  (c) Multimodal input UI (5+ images) when LTX next release lands — `max` is already a data seam.
  (d) Deferred LTX branches already carded/queued: lipdub v2v, lipsync-v2v-2, video extend, CTRL/pose.
- **Memory to write:** "LTX first non-merged-LoRA model" + "ship deps = workflow-scan not install-script"
  + "tier:2 flag drives Input_* param emission". Correct `[[project-transition-lora-short-morph]]`
  (transition LoRA is the i2v motion/lipsync enabler — already noted in
  `[[project-ltx-transition-lora-enables-lipsync]]`).
- **Docs:** `docs/builder/research/` holds the locked audio matrix; keep it the behavior source.
