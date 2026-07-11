# 01 — Workflow: template → runtime files + loader paths

> Part of the [add-model playbook](README.md). Covers the two biggest traps:
> splitting a combined template into per-op runtime files, the media-input
> placeholder rule, and making loader paths agree with dep install paths.

## 0a. Author & prove the workflow in the LOCAL ComfyUI FIRST

Before any app wiring, build and prove the ComfyUI graph in the standalone local
ComfyUI — the fast iteration bench. Only once it produces good output there do you
export the `_template.json` and start the app-wiring steps.

- **Local live-test workflows folder:** `G:\ComfyUi\ComfyUI\user\default\workflows\`
  (e.g. `NVIDIA_PID_template.json`). This is the primary authoring bench.
- **Local models dir:** `G:\CubricModels\` (checkpoints → `diffusion_models/`,
  VAEs → `vae/`, text encoders → `text_encoders/`, etc.).
- **Two-stage test flow:** prove it here FIRST; then test in the in-app ENGINE
  ComfyUI (the one Cubric Vision drives). A workflow graduates to app wiring only
  after it passes on the local folder. The engine run is the second gate, not the first.
- When exporting the template, remember the media-input `input/` trap (below) — the
  exported JSON carries whatever test file was open.

## Files & where they live

| Artifact | Location | Notes |
|---|---|---|
| Model registry entry | `js/data/modelConstants/models.js` (`MODELS[]`) | one `ModelDef` |
| Dependency entries | `js/data/modelConstants/dependencies.js` (`DEPS{}`) | one per weight/node |
| Workflow TEMPLATE | `comfy_workflows/scripts/workflow_generation/<Name>_template.json` | authoring source, NOT loaded at runtime. MUST live here with the `_template.json` suffix, next to the other templates (LTX/Wan/sdxl) — NOT loose in `comfy_workflows/`. |
| Workflow RUNTIME files | `comfy_workflows/<Name>_<op>.json` | what the app fetches; produced by the generator |
| Generator script | `comfy_workflows/scripts/workflow_generation/generate_<name>.py` | reads the template, bakes per-op booleans, writes runtime files to `comfy_workflows/` |

**The app fetches runtime workflows from `comfy_workflows/<file>` directly**
(`commandExecutor.js` `fetch('/comfy_workflows/${workflowFile}')`). No startup copy.

## Template → runtime files (the biggest trap)

**The app cannot switch t2v/i2v at runtime.** The op mode is BAKED into separate
files at build time (confirmed: `Input_Text_to_video` is never injected by
`commandExecutor` / the prompt box). A combined template with an
`Input_Text_to_video` MpiSimpleBoolean → MpiIfElse gate must be split into two
runtime files, one per boolean value.

- `resolveWorkflowFile()` (`js/.../resolveModelDeps.js`) picks the file from the
  model's `workflows` map, then applies `_stage2` (multi-stage) and the engine's
  `workflowSuffix` (e.g. `_gguf`) suffixes. So a combined single-stage model needs
  only `<Name>_t2v.json` + `<Name>_i2v.json` (no `_stage2`, no `_gguf`).
- **The generation is ORCHESTRATED — do not write a standalone script.** Workflow
  generation runs through `comfy_workflows/scripts/workflow_generation/orchestrate.py`,
  which globs every `*_template.json`, hashes it (rebuilds only changed ones), and
  routes it by **filename prefix** (`registry.py` `HANDLERS`) to a handler module
  `generate_<handler>.py` exposing `build(source_path, out_dir) -> list[Path]`.
  To add a model:
  1. Drop `<Name>_template.json` into `scripts/workflow_generation/`.
  2. Add a `HANDLERS` prefix rule in `registry.py` → your handler name. **Order
     specific before general** (first match wins): `Wan22_5B_` MUST precede `Wan22_`,
     or the 5B template routes to the 14B `wan` handler.
  3. Write `generate_<handler>.py` with a `build(source_path, out_dir)` function
     (model it on `generate_sdxl.py` — the simplest). Look up nodes by `_meta.title`,
     NEVER by node id (ids change on every re-export).
  4. Run `python orchestrate.py --all` (or drop `--all` to rebuild only changed).
- The handler is tiny when the only per-op difference is a boolean (5B: read
  template, flip the `Input_Text_to_video` MpiSimpleBoolean, stamp placeholders,
  write two files). Do NOT copy generate_ltx.py's 254 lines of stage-2/gguf
  machinery you don't need. (ponytail: only add stage-2/gguf branches if the model
  actually has them.)

### Media-input nodes need a placeholder — GENERAL rule, not LTX-specific

ANY workflow with a `LoadImage`/`LoadAudio`/`LoadLatent` node (frame, audio, latent)
must have a real default file staged in the engine `input/`, or ComfyUI rejects the
graph at prompt time (`Invalid image file` / `Value not in list`) — even for nodes
whose output is gated off (t2v never uses the frame). Two halves:

1. **Bake a valid placeholder in the template.** Stamp every
   `Input_Start_Frame`/`Input_End_Frame` → **`placeholder.png`** (generic, shared
   across models — do NOT invent a per-model `<model>_placeholder.png`; that's the
   LTX-specific mistake this replaced). Audio nodes → `ltx_silence.wav`. The
   exported template carries whatever test file was open when saved — it won't
   exist on the engine and WILL reject. The handler's stamp step does this.
2. **Stage the placeholder at submit time.** `routes/comfy.js`
   `WORKFLOW_INPUT_DEFAULTS` lists the repo-owned defaults; `_prepareWorkflowInputs`
   (`commandExecutor.js`) copies them into the engine `input/` before submit.
   **TRAP:** that staging used to gate on `commandIsMultiStage` (LTX/Wan `_ms`
   only), so single-stage `t2v`/`i2v` (5B) never staged → `Invalid image file`.
   Fixed to gate on `mediaType === 'video'`. The RIGHT rule is broader still —
   stage whenever the workflow has ANY media-input node, regardless of op type or
   media type. If you add a non-video model with media nodes, widen this gate
   (or make it inspect the workflow's Load* nodes) rather than adding another
   op-type special-case.

**Only OPTIONAL media inputs need any of this.** The distinction:

| the op's media input | what the injector does | placeholder needed? |
|---|---|---|
| **required** (`requiresImages ≥ 1`, `mediaInputs[].required: true`) — upscale, detail, i2i | overwrites the `LoadImage` widget before submit | **No.** The baked value is never read. `Chroma_detailer.json` bakes `ComfyUI_temp_iacob_00003_.png` and has shipped for months. |
| **optional** — a `LoadImage` on a graph that can run with no image | injects **nothing**; ComfyUI validates the **baked** filename | **Yes.** Bake `placeholder.png` **and** stage it. |

Optional-input graphs shipped today: `LTX_t2v*` (`Input_Start_Frame`, `Input_End_Frame`),
`Wan5B_t2v` (`Input_Start_Frame`) — all bake `placeholder.png`. `Chroma_t2i` has no
`LoadImage` at all.

⚠ **Krea2 is the first IMAGE model with an optional `LoadImage`** (its t2i graph serves
t2i + i2i + pose-reference from one file, so plain t2i runs with no image). It needs BOTH
halves. The `mediaType === 'video'` gate at `commandExecutor.js` was widened for it — the
staging now fires whenever the workflow carries ANY `Load*` node (MPI-242).

> **A hand-exported workflow has nothing to stamp the placeholder — give it a handler.**
> LTX/Wan never hit this bug because their generators re-stamp on every build
> (`generate_ltx.py`, `generate_wan5b.py::_stamp_placeholders`). Krea2 originally shipped
> its runtime JSON by hand, so its t2i baked a local scratch filename that existed on no
> other machine. Fixed by `generate_krea2.py` + a `krea2_` rule in `registry.py`: the
> template keeps whatever the export carried, the runtime file is stamped. Even a model
> that needs **no op split** wants a handler when it has an optional media input.
> Guard: `tests/optional-media-placeholder.test.cjs` derives the optional-media set from
> the registry (`workflows` × `requiresImages: 0`) and fails on any unstaged baked name.

Verify the op-boolean node feeds ONLY the MpiIfElse gate (nothing else changes
between t2v/i2v) before trusting a single-boolean split:
`node <id>.inputs → only the MpiIfElse boolean`.

**Template format:** the app loads **API format** (id-keyed `{ "101": {inputs, class_type, _meta} }`),
which is what these templates already are — no UI↔API conversion needed.

## Loader paths MUST match dep install paths (trap)

Each loader node's file field resolves relative to its ComfyUI models subdir:
`UNETLoader.unet_name` → `diffusion_models/`, `VAELoader.vae_name` → `vae/`,
`CLIPLoader.clip_name` → `text_encoders/`, `LoraLoaderModelOnly.lora_name` → `loras/`.

**The loader's file field, the dep's `filename`, AND the physical file location
must ALL agree** — ComfyUI lists a model by its path RELATIVE to the models dir
(recursive scan), so a subfolder shows up in the name. Trap hit twice in MPI-172:

- The template baked `lora_name: "wan 2.2\\Wan22_...safetensors"` (a Windows
  subfolder with a space) because that's where the file sat on disk. But the dep
  `filename` was `loras/Wan22_...safetensors` (bare). Validation failed:
  `Value not in list: 'Wan22_...' not in [... 'wan 2.2\\Wan22_...' ...]` — ComfyUI
  saw the space-folder path, the workflow asked for bare.
- **Fix = pick ONE path (the dep's install path) and make all three match:** set the
  dep `filename` to the intended install location, bake that SAME value in the
  loader node, and (for local dev) MOVE the physical file to match. If the dep says
  `loras/foo.safetensors`, the file must be at `<models>/loras/foo.safetensors` (not
  a subfolder) and the loader `lora_name` must be `foo.safetensors`.
- After moving a local file, ComfyUI's cached model list is stale — reload the
  workflow / restart ComfyUI so the new path is picked up.

Cross-check EVERY loader (unet/vae/clip/lora) file field against its dep `filename`
(minus the models-subdir prefix) AND the real on-disk location.
