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

### Media-input nodes need a placeholder

Any `LoadImage`/`LoadAudio`/`LoadLatent` node on a graph that can run with **no** media
supplied (an *optional* input) must bake a generic placeholder (`placeholder.png` /
`ltx_silence.wav`) **and** have it staged, or ComfyUI rejects the graph at prompt time.
**Required** inputs (`requiresImages ≥ 1`) need neither — the injector overwrites the
widget.

This is a **cross-cutting rule** (models + apps), so the full contract — the
required-vs-optional table, the too-narrow staging gate, the hand-export trap, and the
guard test — lives in **[../../workflow-authoring/media-inputs.md](../../workflow-authoring/media-inputs.md)**.
Read it before shipping any workflow with a media node. Model-onboarding note: even a
model that needs **no op split** wants a generator handler when it has an optional media
input, so the placeholder is re-stamped rather than frozen from the last export.

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
