# 01 — Workflow: template → runtime files + loader paths

> Part of the [add-model playbook](README.md). Covers the two biggest traps:
> splitting a combined template into per-op runtime files, the media-input
> placeholder rule, and making loader paths agree with dep install paths.

## 0a. Author & prove the workflow in the LOCAL ComfyUI FIRST

The raw→API sync procedure (author locally first, `sync-raw-workflows.mjs`, the
`validate-injection-rules.mjs` gate, `raw/` is user-owned, staged output) is
**[shared] — canonical in [../common/workflow-authoring-entry.md](../common/workflow-authoring-entry.md).**
For a model, the raw source carries the `_template.json` suffix
(`comfy_workflows/raw/<Name>_template.json`) so it routes to a generator. The
model-specific divergences below:

> **Converter-staleness trap (2026-07-14).** The generated API templates
> (`scripts/workflow_generation/*_template.json`) are checked in — they do NOT
> re-derive themselves on a plain sync of an *unchanged* raw. When
> `workflow-to-api.mjs` itself is fixed (e.g. the `control_after_generate` phantom-
> widget skip), every previously-converted template is silently stale until re-synced,
> and the fix does NOT reach them. A stale `UltimateSDUpscale`/`KSampler` template
> ships an **off-by-one `widgets_values`** → ComfyUI rejects at prompt time with a
> cluster like `steps: invalid literal for int(): 'fixed'`, `mask_blur bigger than
> max of 64`, `sampler_name: 1 not in (list)`. **After ANY converter change, run
> `node scripts/sync-raw-workflows.mjs --all`** to re-derive every API template + rebake
> runtimes on a clean tree, then commit. (Symptom-only fix per file: convert that raw →
> its `*_template.json`, run its `generate_*.py`.) Sweep to prove zero remaining:
> validate every runtime's widget values against live `/object_info`.

- **Local live-test workflows folder:** `G:\ComfyUi\ComfyUI\user\default\workflows\`
  (e.g. `NVIDIA_PID_template.json`). This is the primary authoring bench.
- **Local models dir:** `G:\CubricModels\` (checkpoints → `diffusion_models/`,
  VAEs → `vae/`, text encoders → `text_encoders/`, etc.).
- **Two-stage test flow:** prove it here FIRST; then test in the in-app ENGINE
  ComfyUI (the one Cubric Vision drives). A workflow graduates to app wiring only
  after it passes on the local folder. The engine run is the second gate, not the first.
- **The engine already points at `G:\CubricModels` via `extra_model_paths.yaml`**
  (`comfyui:` block, `base_path: G:/CubricModels`). Weights placed there are visible to
  the app engine **immediately** — no download, no symlink. The standard workflow: drop
  the weights in `G:\CubricModels\<type>\` FIRST (author's habit), and the app is
  test-ready **before** the R2 upload or the sha256 fills. So you can run a full in-app
  gen per op while the upload is still in flight. R2 upload + hashes are **ship-prep**
  (so end-users can download), not **test-prep**. A `sha256: null` dep does NOT block a
  local test: `downloadManager` sets `sha256Expected: dep.sha256 || null` and **skips the
  verify step when it is null** (install-status keys on local file existence, not R2). So:
  wire → test locally now → upload + fill hashes in parallel → re-verify before ship.
- When exporting the template, remember the media-input `input/` trap (below) — the
  exported JSON carries whatever test file was open.

### Detailer / refiner sampler settings ≠ the base-gen settings

A MaskDetailer / FaceDetailer (Impact Pack) node does NOT inherit good behavior from the
base-gen sampler settings. It crops a small region, denoises it, and stitches it back — a
different regime. **Do not copy the base-gen `cfg` into a detailer.**

- **`cfg` is the one that bites.** A cfg that is correct full-frame is too strong inside a
  detailer's small denoised crop (guidance over-pushes the patch). Non-distilled KREA2 raw
  gen runs `cfg 3`; its MaskDetailer wanted **~1.5**. Per-model — TEST EACH DETAILER
  INDIVIDUALLY, do not bulk-lower.
- **Diagnostic tell:** a bad detailer result that is **denoise-invariant** (equally bad at
  `0.1` / `0.2` / `0.4`) is almost always **cfg-in-crop**, NOT sampler / scheduler / steps /
  guide_size. Denoise moving the result = a real denoise problem; denoise doing nothing =
  suspect cfg first.
- Distilled/turbo/lcm detailers already run `cfg 1–1.4` (correct — leave them). Only the
  non-distilled (raw) detailers carry a base-gen cfg that is too high.
- Same edit mechanic as any workflow: `raw/` is user-owned — change cfg live in the ComfyUI
  graph + live-save, or patch the raw JSON then re-sync. A widget change on a `_template`
  re-syncs the runtime.

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

> **RULE — workflow filenames are ALL-LOWERCASE (MPI-291).** The raw source, the runtime
> file, the GEN template, the `registry.py` prefix, and the `models.js` `workflows` value are
> ONE name that must agree byte-for-byte. The **Pod FS is case-sensitive**: `Chroma_t2i.json`
> and `chroma_t2i.json` are the same file on Windows but different on the Pod, so a mixed-case
> name works locally and 404s remotely the moment a key is written in a different case. Name
> every raw file lowercase from the start (`chroma_hyper_t2i_template.json`, not
> `Chroma_Hyper_...`). `sync-raw-workflows.mjs` now GATES on this and stops before committing a
> mixed-case name. **Fixing an already-committed mixed-case name is a case-only rename**, which
> collides in git's `add` on `core.ignorecase=true`; do it in two steps
> (`git mv X x.tmp && git mv x.tmp x`) or rename on disk + `git add -A` the old/new pair, then
> re-run the convert→validate→orchestrate pipeline manually (sync can't do a case-only rename —
> its own `git add` hits the same alias collision).

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

### Media inputs are path→string (no placeholder; latents excepted)

Image/mask/video/audio inputs are path-reading loaders (`MpiLoadImageFromPath` /
`MpiLoadAudio` / `MpiLoadVideo`) that take a full project-folder path in a `string`
widget and **self-gate on empty string** — no placeholder file, no staging (MPI-272).
The one survivor: any `LoadLatent` node still needs its baked latent staged into the
engine `input/`, or ComfyUI rejects the graph at prompt time.

This is a **cross-cutting rule** (models + apps), so the full contract — the path
source law, the reuse-404 soft-error, and the latent survivor — lives in
**[../../workflow-authoring/media-inputs.md](../../workflow-authoring/media-inputs.md)**.
Read it before shipping any workflow with a media node.

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
