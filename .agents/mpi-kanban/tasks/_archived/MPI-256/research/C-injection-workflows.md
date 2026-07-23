# MPI-256 research — Agent C: workflow selection / injection / deps / registry / styles / engines

## Q1. Workflow file selection
- `resolveWorkflowFile(model, op, engine, {stage2, variantTokens})` — `js/data/modelConstants/resolveModelDeps.js:240`. Strictly `(model, op)` keyed: `model.workflows[op]` + variant suffix (`variants.arch.options[token].workflowSuffix`) + `_stage2` + engine suffix (`model.engines[engine].workflowSuffix`, currently unused by any deployed model). Called from `commandExecutor.js:1134`.
- **UNIVERSAL WORKFLOWS bypass it entirely**: `getUniversalWorkflow(payload.operation)` (`modelRegistry.js:253`) reads `UNIVERSAL_WORKFLOWS` (universal_workflows.js); `universal: true` in commandRegistry.js:313. Existing: interpolate, videoUpscale, imageUpscale, autoMaskImg, resize, resizeVideo. **= the App-workflow precedent.**
- Files: templates in `comfy_workflows/scripts/workflow_generation/*_template.json` (not served); runtime in `comfy_workflows/*.json`, fetched `/comfy_workflows/<file>`.
- **App-workflow recipe (no ModelDef needed):** commandRegistry entry w/ `universal: true` + universal_workflows.js entry + operationRegistry.js + operation_registry.json.
- GAPS: universal path has NO installed-model guard (an app workflow calling e.g. Wan transformer 400s if not installed — "model not in []"); **`requiredModels[]` is not a codebase concept — pre-flight guard = NEW build.** Existing drift: `poseReference` in operationRegistry.js:17 but missing from operation_registry.json.

## Q2. Injection contract
- `comfyController.js:runWorkflow(workflowFile, params, onProgress)`; params built by `commandExecutor.js:_buildParams`.
- Match: `node._meta.title` case-insensitive, `filter` (multi-node same-title all injected). Injectable input fields: value,text,int,float,boolean,string,ckpt_name,model_name,unet_name,image,mask,picks,lora_name,strength_model,strength_clip,denoise,seed,noise_seed,select,audio,latent.
- Canonicalization (`commandExecutor.js:730`): any key not `Input_`/`Output_`-prefixed is RENAMED to `Input_<key>` (bare deleted). Unmatched keys DROP SILENTLY (MPI-242 trap; guard test inject-params-titles.test.cjs).
- Standalone injectors: `commandRegistry.injector` field (e.g. 'resize') runs `INJECTORS[name](workflow, injectionParams)` (js/services/workflowInjectors/) BEFORE generic loop, consumes its keys.
- Media: `Input_Image/Input_Mask/Input_Start_Frame/Input_End_Frame` → if node has `inputs.image`, upload via `POST /comfy/upload` w/ STATIC filename (mpi_input_image.png, caching); masks same. Video/audio = local paths, no upload.
- Optional-media staging: `_prepareWorkflowInputs` (commandExecutor.js:98) detects LoadImage/LoadImageMask/LoadAudio/LoadLatent class_types → `POST /comfy/prepare-workflow-inputs` copies `WORKFLOW_INPUT_DEFAULTS` (placeholder.png, latents, ltx_silence.wav — routes/comfy.js:61) from `comfy_workflows/input/`.
- Output capture (`commandExecutor.js:1296`): titles `output_image` / `output_video` / `output_preview` / `output_audio` / `output_prompt` / `output_detected` (case-insensitive). **Wrong/missing output title ⇒ run completes, returns NOTHING, silently (MPI-217).** Custom class_types not in LOADER_CLASS_TYPES (commandExecutor.js:971) get no weight-map/progress-stage tracking.

## Q3. Weights / deps / requiredModels
- Loader nodes hold filenames relative to ComfyUI type subdir; injection passes verbatim. `_resolveModelName` heals separator/basename for LoRAs + upscale models ONLY (from state.availableLoras) — NOT ckpt/VAE/CLIP (baked, never injected).
- `resolveDeps(model, selectedOps, depExists, engine, variantTokens)`: flat models → dependencies+engine extra+variant extra; op-keyed → commonDeps+op deps+extras. Download system operates ONLY on dep-id lists reachable via ModelDef.
- **NO mechanism for app-declared requiredModels[] reusing dep ids without a ModelDef.** Partial paths: (a) new ModelDef reusing existing dep ids in dependencies[] (works, dedupeStable) but needs full card; (b) universal path = no weight enforcement at all. App workflow files ship static in comfy_workflows/, never downloaded.
- footprint.js calculations don't apply to non-ModelDef dep lists.

## Q4. Operations registry — 3 files in sync
1. `js/data/commandRegistry.js` (UI metadata: label, mediaType, requiresImages, mediaInputs, components[], defaults, injectParams, injector, isMultiStage).
2. `js/core/operationRegistry.js` (versioning: latestVersion, appVersionIntroduced; isOperationKnown for history migration).
3. `operation_registry.json` (generated mirror, /mpi-version-bump maintains, never hand-edit; universal ops carry "universal": true).
- New app op ⇒ ALL of the above (+ universal_workflows.js if universal). Adding model/op ≠ app version bump (playbook:489). Missing operationRegistry entry ⇒ isOperationKnown false ⇒ history misrouting.

## Q5. Krea2 style-LoRA system (closest app-resource precedent)
- Each style LoRA = normal dep in dependencies.js (`loras/krea-2/style/...`), in ModelDef.dependencies[] — downloads WITH the model (no lazy per-style install).
- Workflow: N MpiLoraModel nodes `Input_style_lora_1..N`, lora_name HARDCODED, strength LINKED from MpiMath gate `b if a==N else 0.0`; `a ← Input_Style` (MpiInt), `b ← Input_Stylization` (MpiFloat). Style 0 = all zero. Same Input_Style feeds MpiPromptList.specific_item (trigger phrases) → concat w/ Input_Positive.
- App-side: PromptBoxControls.js:983 styleSelect (`nodeTitle: 'Input_Style'`, labels from model.styleLoraLabels[]), :1044 stylization; both gated by capabilities.styleLoras (MpiPromptBox.js:978-981); listed in ops' components[].
- MpiLoraModel.apply_lora short-circuits at strength 0 (loras.py:100) — one LoRA in VRAM max.

## Q6. Local vs remote for app workflows
- Engine resolved ONCE per gen (commandExecutor.js:1036 after remoteEngineClient.refresh()); threaded everywhere.
- Universal ops: same workflow file both engines, no suffix. Loader eager-validation: a file carrying both engines' loaders rejects on the engine lacking one (comfy_engine.md §2.5) — app workflow must use both-engine weights or split files.
- **`_ensureRemoteHotStore` (≥20GB staging, commandExecutor.js:499) gated on payload.modelId — universal op (no modelId) NEVER hot-stages** → slow first Pod run, no toast, if app workflow uses big weight.
- Remote LoRA auto-upload (`comfyController._uploadRemoteModels`) gated on LoRA params in params map — workflow-BAKED LoRA filenames not covered; must pre-exist on Pod volume.
- `_prepareWorkflowInputs` runs both engines (remote: uploads defaults to Pod input/). App workflow w/ optional media needs placeholders in comfy_workflows/input/ AND WORKFLOW_INPUT_DEFAULTS.
- SSE frames engine-tagged; `_frameEngineMatches` drops foreign frames — no new code needed.
