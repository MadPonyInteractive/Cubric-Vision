# Add a New Model — End-to-End Playbook

> The single procedure for wiring a new model into Cubric Vision. Before this doc,
> the knowledge was scattered across `docs/builder/04-add-models.md`,
> `app-handoff.md`, `.claude/rules/comfy_engine.md`, `docs/versioning.md`, and the
> version-bump skill FAQ. Read this first; those remain the deep references.
>
> **Models are NOT version-bumped.** Adding a model does not touch `appVersion.js`.
> A new model that reuses existing ops (`t2v_ms`/`i2v_ms`) does NOT touch
> `operationRegistry.js` / `commandRegistry.js` / `operation_registry.json` either —
> those change only for a NEW operation type.

Worked example throughout: **Wan 2.2 TI2V-5B** (MPI-172) — a combined-op,
single-stage, low-tier video model.

---

## 0a. Author & prove the workflow in the LOCAL ComfyUI FIRST

Before any app wiring, build and prove the ComfyUI graph in the standalone local
ComfyUI — the fast iteration bench. Only once it produces good output there do you
export the `_template.json` and start the app-wiring steps below.

- **Local live-test workflows folder:** `G:\ComfyUi\ComfyUI\user\default\workflows\`
  (e.g. `NVIDIA_PID_template.json`). This is the primary authoring bench.
- **Local models dir:** `G:\CubricModels\` (checkpoints → `diffusion_models/`,
  VAEs → `vae/`, text encoders → `text_encoders/`, etc.).
- **Two-stage test flow:** prove it here FIRST; then test in the in-app ENGINE
  ComfyUI (the one Cubric Vision drives). A workflow graduates to app wiring only
  after it passes on the local folder. The engine run is the second gate, not the first.
- When exporting the template, remember the media-input `input/` trap (§ "Media-input
  nodes" below) — the exported JSON carries whatever test file was open.

---

## 0. Decide the model's SHAPE first

Two structural forks decide everything downstream:

1. **Combined-op vs separate-op transformer.**
   - **Combined** (one transformer serves t2v + i2v, like LTX and 5B): use a flat
     `dependencies: []` array on the model def. Both ops install together; no
     per-op toggle in the manager.
   - **Separate** (distinct weights per op, like Wan-22 14B's high/low experts):
     use `commonDeps: []` + `operations: { t2v_ms: {deps:[...]}, i2v_ms: {deps:[...]} }`.
     Each op installs independently.
2. **Single-stage vs multi-stage.** `capabilities.multiStage` — true shows the
   preview-stage toggle + (if also `branchingContinue`) the Continue button.
   Single-stage (5B) → `multiStage: false`, Finish-only.
   **TRAP — pick the matching OPS.** Multi-stage video uses `t2v_ms`/`i2v_ms`;
   single-stage video uses `t2v`/`i2v` (both exist in `commandRegistry.js`). A
   single-stage model wired with `_ms` ops routes through preview/stage-2 handling
   → `Prompt outputs failed validation` (400) + `Preview_Only requested but
   workflow has no matching node`. `supportedOps` AND the `workflows` map keys must
   both use the non-`_ms` keys. (MPI-172: 5B is the first video model on `t2v`/`i2v`.)

---

## 1. Files & where they live

| Artifact | Location | Notes |
|---|---|---|
| Model registry entry | `js/data/modelConstants/models.js` (`MODELS[]`) | one `ModelDef` |
| Dependency entries | `js/data/modelConstants/dependencies.js` (`DEPS{}`) | one per weight/node |
| Workflow TEMPLATE | `comfy_workflows/scripts/workflow_generation/<Name>_template.json` | authoring source, NOT loaded at runtime. MUST live here with the `_template.json` suffix, next to the other templates (LTX/Wan/sdxl) — NOT loose in `comfy_workflows/`. |
| Workflow RUNTIME files | `comfy_workflows/<Name>_<op>.json` | what the app fetches; produced by the generator |
| Generator script | `comfy_workflows/scripts/workflow_generation/generate_<name>.py` | reads the template, bakes per-op booleans, writes runtime files to `comfy_workflows/` |

**The app fetches runtime workflows from `comfy_workflows/<file>` directly**
(`commandExecutor.js` `fetch('/comfy_workflows/${workflowFile}')`). No startup copy.

---

## 2. Workflow: TEMPLATE → runtime files (the biggest trap)

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
- **Media-input nodes need a placeholder — this is a GENERAL rule, not
  LTX-specific.** ANY workflow with a `LoadImage`/`LoadAudio`/`LoadLatent` node
  (frame, audio, latent) must have a real default file staged in the engine
  `input/`, or ComfyUI rejects the graph at prompt time (`Invalid image file` /
  `Value not in list`) — even for nodes whose output is gated off (t2v never uses
  the frame). Two halves:
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

Verify the op-boolean node feeds ONLY the MpiIfElse gate (nothing else changes
between t2v/i2v) before trusting a single-boolean split:
`node <id>.inputs → only the MpiIfElse boolean`.

**Template format:** the app loads **API format** (id-keyed `{ "101": {inputs, class_type, _meta} }`),
which is what these templates already are — no UI↔API conversion needed.

---

## 3. Loader paths MUST match dep install paths (trap)

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

---

## 4. Dependencies — entry shape + R2 upload

Weight dep shape (see `dependencies.js` for live examples):
```js
'my-model-weight': {
    id: 'my-model-weight',
    name: 'Display Name',
    origin: 'HF-org/repo',                 // informational
    filename: 'diffusion_models/file.safetensors',   // relative to models root == R2 tail
    url: 'https://models.cubric.studio/vision/models/diffusion_models/file.safetensors',
    size: '9.31GB',                        // footprint.js reads this for the VRAM/RAM table
    sha256: null                           // fill via /mpic-compute-dep-hashes AFTER upload
}
```

**Reuse shared deps — do not re-host.** The 5B reuses `umt5_xxl_fp8_e4m3fn_scaled`
(same clip as the 14B, already on HF/R2) — just list the existing dep id. Only
host what's genuinely new.

> **🛑 PING THE USER — any single weight file ≥ 15 GB (Pod hot-store + disk budget, MPI-194).**
> RunPod **volume** pods keep weights on a 750 MB/s network volume; re-reading a huge file
> every gen-stage was the LTX slowdown. The fix (MPI-194) STAGES any single file **≥ 15 GB**
> from the volume onto the pod's container disk on first use (sticky, LRU-evicted). The
> container disk is **50 GB** and today fits exactly ONE ≥15GB model (LTX's 41GB transformer).
> So when you add a model whose dep list has a file **≥ 15 GB**, STOP and tell the user BEFORE
> shipping — two things need a call:
> 1. **Disk budget.** If the new ≥15GB hot-set does NOT fit in the free container-disk space
>    (e.g. a 60–70GB weight, or a 2nd big model that must coexist with LTX), `CONTAINER_DISK_GB`
>    in `routes/remotePodLifecycle.js` (create payload) must be bumped. ~$0.004/hr per +30GB.
> 2. **Confirm it's genuinely ≥15GB per FILE**, not per set. Reference (2026-07-05): LTX
>    transformer 41GB → hot-stored; LTX Gemma TE 9.45GB, every Wan file ≤13.55GB → NOT (under 15,
>    stay on the volume). Threshold constant = `15 * 1e9` bytes (SI or binary — same result, no
>    borderline file exists today).
>
> Files **under 15 GB need no action** — they stay on the volume, no disk/cost impact. This gate
> is ONLY about the ≥15GB ones.

### R2 upload (cubric-models bucket)

Access via `C:\Users\Fabio\.secrets\rclone-r2.conf`, remote `cubric-r2:`, bucket
`cubric-models` → public host `https://models.cubric.studio/`. Path convention
(MPI-178 flat-mirror): R2 MIRRORS the local ComfyUI models dir — flat by type,
NOT by model family: `vision/models/<comfy-type>/<file>`. Since a dep's
`filename` IS the comfy-relative path, the invariant is
`url == https://models.cubric.studio/vision/models/<filename>`. Full capability
doc: `c:\AI\Mpi\MadPony-Identity\capabilities\cloudflare-r2\README.md` (boot via
`START-HERE.md`).

**TRAP — scoped-token 403 on multi-thread upload.** A plain `rclone copyto`
of a large file fails with `403 AccessDenied … CreateBucket`: rclone's
multi-thread chunk writer probes/creates the bucket, which the scoped R2 token
cannot do. **ALWAYS pass `--s3-no-check-bucket`** (documented in the R2 README).
Belt-and-suspenders for big files: also `--multi-thread-streams 0`.

```bash
CONF="C:/Users/Fabio/.secrets/rclone-r2.conf"
rclone --config "$CONF" copyto "LOCAL/file.safetensors" \
  "cubric-r2:cubric-models/vision/models/<type>/file.safetensors" \
  --s3-no-check-bucket --multi-thread-streams 0 -P
```

**TRAP — a wrapping shell `echo "DONE"` masks rclone's non-zero exit.** Do NOT
trust "exit 0" from a compound command. ALWAYS verify the upload landed:
```bash
rclone --config "$CONF" lsf -R "cubric-r2:cubric-models/vision/models/<type>/" --s3-no-check-bucket
# and a public HTTP HEAD (content-length must be non-empty + match the local size):
curl -sIL "https://models.cubric.studio/vision/models/<type>/file.safetensors" | grep -i content-length
```

R2 deletes need explicit user approval (capability rule).

### Fill hashes

After upload verifies, run `/mpic-compute-dep-hashes` (→ `python scripts/computeDepHashes.py`)
to replace every `sha256: null` with the real hash. Do NOT leave nulls — the
download manager needs them for integrity checks.

---

## 4b. Status-bar stage count (`progressStages.js`)

The status bar fills 0→100% **once per tqdm bar** and shows `Stage N/M`. `M` is the
number of times the bar restarts at 0 in a full run — it **cannot** be derived from
the workflow JSON, so every workflow needs an entry in `js/data/progressStages.js`
(`PROGRESS_STAGES`), keyed by workflow filename (the `_stage2` suffix is stripped by
the lookup).

`M` depends on the **run mode** (same file, different bar counts):
`single` (single-stage op, or a multi-stage op run straight to finish),
`preview` (multi-stage `previewOnly`), `stage2` (the `_stage2` file).

Bar counts vary per workflow — there is no universal number:
- LTX = `{ single: 3, preview: 2, stage2: 1 }` (load + sampler-A + sampler-B)
- Wan 14B / SDXL = `{ single: 2 }` (load bar + one sampler)
- Wan 5B (single-stage, one sampler pass) = `{ single: 1 }` (shows `1/1`)
- Upscalers/detailers = variable (per-tile passes; UltimateSDUpscale has its own)

Note the count is the number of tqdm bars that actually restart, NOT
samplers×something — Wan 5B's one pass is a single bar (`1/1`), even though other
models count a separate model-load bar. Never set a count higher than the real bar
restarts (a `2/1` is worse than no total).

**COUNT IT LIVE — do not guess.** Run the workflow in each applicable mode, watch
the ComfyUI terminal, count how many times a tqdm bar restarts at 0 (INCLUDING the
`0/1` model-load bar). No entry → the counter still ticks but shows no total
(`· 2`, not `· 2/3`). A wrong count shows a wrong denominator to the user.

## 5. Model registry entry (`models.js`)

Copy the closest existing entry (LTX for combined-op, Wan-22 for separate-op).
Key fields, with the 5B choices:

```js
{
    id: 'wan22-5b',
    sizeTier: 'low',              // UI badge (L/B/H); does NOT drive footprint math
    modelFamily: 'Wan-2.2',       // soft grouping for tier-variant clustering
    name: 'Wan 2.2 5B',
    dropdownMeta: 'VIDEO',
    mediaType: 'video',
    tier: 1,
    capabilities: { multiStage: false, audio: false },  // omit branchingContinue → Finish-only; omit motion → no motionIntensity control
    type: 'wan5b',                // see §6 — a new type needs a consumer sweep
    loraStrengths: ['model'],     // Wan/LTX read strength_model only
    enhanceRecipe: 'wan',         // reuse an existing Cubric Prompt recipe (no 'wan5b' recipe exists)
    supportedOps: ['t2v', 'i2v'],   // single-stage → NOT t2v_ms/i2v_ms (see §0 trap)
    gen_speed: 'fast',
    description: '...',
    workflows: { t2v: 'Wan5B_t2v.json', i2v: 'Wan5B_i2v.json' },
    dependencies: [ /* flat — combined-op */ ],
}
```

- **No `video:`** until a real preview clip for THIS model exists. Never reuse
  another model's clip (misrepresents the model).
- **`capabilities` gates UI, not `type`:** `audio` → audio slot; `motion` →
  motionIntensity control; `branchingContinue` → Continue button. Set/omit to match
  the workflow's actual nodes.
- **VRAM/RAM table is automatic:** `footprint.js` sums dep `size` fields →
  `vramFloor = max(8, totalWeights*0.25)`, `ram = ceil(max(0, weights+1.3-vram)/8)*8`.
  Get the dep `size` strings right and the hover trade-table is correct. `sizeTier`
  is only a badge.

---

## 6. New `model.type` → sweep the consumers (trap)

Most UI is gated on `capabilities.*` or `loraStages` (type-agnostic, safe).

**Ratios + quality tiers are declared on the ModelDef (MPI-174).** A new `type`
sets two optional fields in `js/data/modelConstants/models.js`:

- `ratios` — the ratio table, keyed by quality tier (quality-mode) or
  `portrait`/`landscape` (orientation-mode).
- `qualityTiers` — ordered tier ids, e.g. `['low','medium','high']`. Presence ⇒
  quality UI mode (tier radio); `ratios` without it ⇒ orientation mode.

`js/utils/ratios.js` picks both up at load (`getModelRatios`, `RATIO_MODES`,
`qualityTiersFor`), and the v3 migration reads `qualityTiers` from the registry —
no edits in ratios.js, MpiOptionSelector, or projectMigrations for a new type.
The built-in families (flux/sdxl/wan/wan5b/ltx) keep their hardcoded tables in
ratios.js; do NOT redeclare those on their ModelDefs.

Still hardcoded — grep for the new type and fix:

- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` — `enhanceRecipe ?? type`
  is sent to Cubric Prompt; set `enhanceRecipe` on the model def to reuse a known
  recipe if Prompt has none for the new type.

For MPI-172 (`wan5b`, pre-MPI-174) all four then-hardcoded spots were handled:
ratios (MPI-171), the two `tiersFor` maps (`wan5b: ['low','medium','high']`), and
`enhanceRecipe: 'wan'`.

---

## 7. Verify (Definition of Done)

1. **Parse + cross-reference** (no app needed):
   ```bash
   node --input-type=module -e "import {DEPS} from './js/data/modelConstants/dependencies.js'; import {MODELS} from './js/data/modelConstants/models.js'; const m=MODELS.find(x=>x.id==='<id>'); m.dependencies.forEach(d=>{if(!DEPS[d])throw new Error('missing dep '+d)}); console.log('OK')"
   ```
2. **Workflow files exist** in `comfy_workflows/` and their loader paths match dep filenames (§3).
3. **Upload verified** via HTTP HEAD (§4) and **no `sha256: null`** remains.
4. **Launch the app**, confirm the model card appears, the quality tiers are the
   right set, and (best) run one gen per op.

---

## 8. Image upscaler / new-op model with a runtime in-workflow selector (PiD pattern, MPI-182)

A prompt-box-driven model that adds a NEW op + a runtime switch inside ONE workflow
(no per-op file split). PiD = the worked example: one workflow, a 4-path VAE selector +
an output-size selector, both `MpiAnySwitch` picked at submit time. Lessons that cost real
debugging:

- **Image output CAPTURE node MUST be titled exactly `Output`** (case-insensitive) — NOT
  `Output_Image` or any other `Output_*`. Set this title IN ComfyUI and re-export — do NOT
  hand-edit the workflow JSON (workflows change only via authoring/scripts; a manual JSON edit
  is silently lost on the next re-export → the bug returns). The IMAGE capture
  (`commandExecutor.js` ~L970: `_captureTitle = 'output'`) matches bare `output`. Video is the
  only split — `Output_Video` / `Output_Audio` are special-cased there; IMAGE stays bare
  `Output`. `output_image` is recognized NOWHERE. A node titled `Output_Image` runs fine,
  lands in ComfyUI `/history` with `images`, but the app reports **"Generation completed but
  no output returned"** because capture never fires. EVERY shipped image workflow (t2i,
  upscaler, detailer, image_upscale, img_auto_mask) titles its `PreviewImage` exactly `Output`.
  (Use `PreviewImage`, not `SaveImage` — all Cubric image workflows use PreviewImage, type
  `temp`; the app builds a `/view?...type=temp` URL fine.)
- **Injecting an `MpiAnySwitch` needs `'select'` in the injector target list.** The switch's
  selector input is `select` (int). `comfyController.js` `_inject` targets did NOT include it
  until MPI-182 — injection matched the node by title but wrote nothing → the dropdown
  silently no-op'd. If you author ANY MpiAnySwitch driven by a control, confirm `'select'` is
  in that target array. **MpiAnySwitch is 1-INDEXED** (select starts at 1) — the control must
  inject 1-based values or it picks the wrong branch.
- **A runtime in-workflow selector = a `PROMPT_BOX_CONTROLS` entry + a `commandRegistry`
  component.** Clone the `upscaleFactor` control (an `MpiRadioGroup` whose
  `getInjectionParams()` returns `{ <Node_Title>: value }`). Add the control id to the op's
  `components` array and a default to `promptControlDefaults.js`. The control's `nodeTitle`
  must equal the switch node's `_meta.title`. Values already `Input_`-prefixed skip the
  tier-2 alias (they inject as-is); a bare title (e.g. `Denoise`) gets an `Input_Denoise`
  alias for free — so an app slider can drive a differently-named workflow field.
- **Image gating is FREE** — an image-required op declares `requiresImages: 1` +
  `mediaInputs:[{ key:'inputImage', title:'Input_Image', required:true }]` (clone `upscale`).
  That inherits the block-Run-if-no-image toast (`generationService.js`) + auto-op-switch. No
  new gating code. The workflow's `LoadImage` node MUST be titled `Input_Image` to receive it.
- **Hide the model-settings gear** for a model that configures no upscale-model and no LoRAs:
  set `showSettings: false` on the ModelDef (honored in `MpiPromptBox.js` beside
  `props.showSettings`). Prevents an empty/irrelevant settings popup.
- **A NEW op adds to `operation_registry.json` AND `js/core/operationRegistry.js`** (two
  mirrors), `appVersionIntroduced` = current `APP_VERSION`. NOT `js/data/operationRegistry.js`
  (doesn't exist). Adding a model/op is still NOT an app version bump.
- **Shared VAE/encoder deps get RESOURCE-named ids, not model-scoped.** `vae-flux-ae`,
  `vae-sdxl`, `vae-qwen-image` — because `ae.safetensors` will back Flux/Chroma/Z-Image/+ and
  the Qwen VAE backs Qwen-Image/Edit/+. A model-scoped id (`pid-vae-flux`) forces the next
  model to re-declare or reference a confusingly-named dep. Weights that ARE model-specific
  (the PiD checkpoints, the pixeldit Gemma encoder) keep the model prefix (`pid-*`). Dedup by
  id is automatic (`resolveModelDeps.js` `dedupeStable`) — list a shared id once.
- **VAE FILE must be the ComfyUI-repackaged safetensors**, not a community convert or raw
  NVIDIA `.pth`. Wrong-arch converts fail VAELoader with a `conv_in` shape mismatch; a `.pth`
  fails because VAELoader wants a `vae.`-prefixed safetensors state_dict. (PiD's qwen VAE took
  3 tries — see `docs/builder/research/pid-upscaler.md`.)

## Checklist (copy per model)

- [ ] Decide shape: combined (`dependencies[]`) vs separate (`commonDeps`+`operations{}`); single vs multi-stage
- [ ] Output capture node titled EXACTLY `Output` (§8) — not `Output_*`; strict-match capture
- [ ] Author + save the workflow template in `comfy_workflows/`
- [ ] Verify the op-boolean feeds only the MpiIfElse; normalize all loader file paths to bare filenames (§3)
- [ ] Write/run the generator → runtime files in `comfy_workflows/`
- [ ] Add `progressStages.js` entry — COUNT tqdm bar restarts live per run mode (§4b); wrong = wrong `N/M` in status bar
- [ ] Add dep entries (`dependencies.js`), reuse shared deps, `sha256: null`
- [ ] Upload new weights to R2 with `--s3-no-check-bucket`; VERIFY with lsf + HTTP HEAD (don't trust exit code)
- [ ] `/mpic-compute-dep-hashes` → fill all sha256
- [ ] Add the `ModelDef` (`models.js`); set capabilities, workflows, dependencies, enhanceRecipe
- [ ] New `type`? Sweep the four consumers (§6)
- [ ] New OP? Add to BOTH `js/core/operationRegistry.js` + `operation_registry.json` (§8), `appVersionIntroduced` = current APP_VERSION
- [ ] Runtime in-workflow selector? Add a `PROMPT_BOX_CONTROLS` entry + `commandRegistry` component + `promptControlDefaults` (§8); `nodeTitle` == switch title; MpiAnySwitch needs `select` in the injector + 1-indexed values
- [ ] Model with no upscale-model/LoRA config? `showSettings: false` on the ModelDef (§8)
- [ ] Shared VAE/encoder deps? RESOURCE-named ids (`vae-*`), not model-scoped (§8)
- [ ] Verify: parse cross-ref, loader paths, upload HEAD, app launch
- [ ] NO app version bump (adding a model/op ≠ version bump)
