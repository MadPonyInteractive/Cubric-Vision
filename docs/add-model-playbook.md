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

  **Only OPTIONAL media inputs need any of this.** The distinction that decides whether you
  care:

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

**BAKED LoRAs are normal deps.** A LoRA the *workflow* loads (not a user slot) travels with
the model and is declared exactly like a weight: `filename: 'loras/<family>/<file>.safetensors'`,
a `size` string, `sha256`, and **no `type` field** — only `custom_nodes` and `json` carry `type`.
Precedent: LTX-2.3 ships three (`ltx23-lora-merged`, `-transition`, `-talkvid`), Wan-5B one
(`wan22-5b-turbo-lora`). Put them in a per-family lora subfolder (`loras/ltx-2.3/`,
`loras/wan-2.2-5b/`, `loras/krea-2/…`); R2 mirrors that path. Do NOT confuse these with the
user LoRA slots (`Input_Lora_1..N`), which are runtime files the user supplies and are never deps.

> **TRAP — `isWeightDep()` counts EVERY LoRA dep toward `totalWeightsGb()`.** That is correct
> when the workflow loads them all every run (LTX). It **over-counts** when the LoRAs are
> *mutually exclusive* — e.g. Krea2's 9 style LoRAs, where an `MpiMath` gate zeroes all but one
> and `MpiLoraModel.apply_lora` short-circuits at `strength_model == 0` (`loras.py:100`, returns
> before `load_lora_cached`). Only ONE is ever resident. Before special-casing `footprint.js`,
> **measure**: Krea2's over-count is 3.50 GB and changes **no row** of the table (the floor is
> pinned by `MIN_FLOOR = 8` and `ceil(spill/8)*8` absorbs the rest). Only act if a future
> model's idle LoRAs push `totalWeights` across a floor or row boundary.

**Custom-node dep + node-bump flow (MPI-222).** A model that needs a custom node
adds `type: 'custom_nodes'` — it's universal by type (no `installOnEngine` flag;
that's deleted). Pin its commit in `dev_configs/node_lock.json` (`source:
git-commit`). Set `installRequirements: true` iff the node ships a `requirements.txt`
— that flag ALSO decides the Pod split: `true` = baked into the image, `false` =
installed on the volume at connect. **To bump a node later:** edit its commit in
`node_lock.json` ONLY. The `.mpi_node_commit` drift ladder reinstalls it at the new
commit on both engines. **Rebuild the Pod image ONLY if the bumped node is baked**
(`installRequirements: true`) — a volume node (`false`) heals with no rebuild. A
baked-node bump also needs `POD_IMAGE_VERSION` bumped + an app restart; the app warns
"Pod image is stale" if it detects a baked node adrift.

**In-folder weights — `targetPath`.** A weight whose node hard-codes its scan dir
(RIFE reads only `custom_nodes/comfyui-frame-interpolation/ckpts/rife/`) can't live in
`mpi_models/`. Give its dep `engineAsset: true` + `targetPath:
'custom_nodes/<node>/<subdir>'` (bare `filename`, no type-subdir prefix) — it installs
inside the node folder, boot-installs + self-heals like any `engineAsset`, and is
image-resident on remote. See `.claude/rules/comfy_engine.md` § 2.5c.

> **🛑 PING THE USER — any single weight file ≥ 20 GB (Pod hot-store + disk budget, MPI-194).**
> RunPod **volume** pods keep weights on a 750 MB/s network volume; re-reading a huge file
> every gen-stage was the LTX slowdown. The fix (MPI-194) STAGES any single file **≥ 20 GB**
> from the volume onto the pod's container disk on first use (sticky, LRU-evicted). The
> container disk is **50 GB** and today fits exactly ONE ≥20GB model (LTX's 41GB transformer).
> So when you add a model whose dep list has a file **≥ 20 GB**, STOP and tell the user BEFORE
> shipping — two things need a call:
> 1. **Disk budget.** If the new ≥20GB hot-set does NOT fit in the free container-disk space
>    (e.g. a 60–70GB weight, or a 2nd big model that must coexist with LTX), `CONTAINER_DISK_GB`
>    in `routes/remotePodLifecycle.js` (create payload) must be bumped. ~$0.004/hr per +30GB.
> 2. **Confirm it's genuinely ≥20GB per FILE**, not per set. Reference (2026-07-05): LTX
>    transformer 41GB → hot-stored; LTX Gemma TE 9.45GB, every Wan file ≤13.55GB → NOT (under 20,
>    stay on the volume). Threshold constant = `HOT_STORE_MIN_GB = 20` (binary GB via
>    `sizeToGb`) in `js/services/commandExecutor.js`.
>
> Files **under 20 GB need no action** — they stay on the volume, no disk/cost impact. This gate
> is ONLY about the ≥20GB ones.

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

**ALWAYS cap upload bandwidth: `--bwlimit 3M`.** Fabio's uplink is ~4 MB/s; an
uncapped upload saturates it and blocks his system. Cap at **3 MB/s** to leave
~1 MB/s of headroom. The cap is GLOBAL across concurrent transfers, so upload
multiple weights **sequentially in one job** (not parallel jobs — two jobs each
capped 3M = 6M total, defeating the cap). rclone resumes partials, so re-issuing
a capped command after an uncapped run loses no progress.

```bash
CONF="C:/Users/Fabio/.secrets/rclone-r2.conf"
rclone --config "$CONF" copyto "LOCAL/file.safetensors" \
  "cubric-r2:cubric-models/vision/models/<type>/file.safetensors" \
  --s3-no-check-bucket --multi-thread-streams 0 --bwlimit 3M -P
```

**TRAP — a wrapping shell `echo "DONE"` masks rclone's non-zero exit.** Do NOT
trust "exit 0" from a compound command. ALWAYS verify the upload landed:
```bash
rclone --config "$CONF" lsf -R "cubric-r2:cubric-models/vision/models/<type>/" --s3-no-check-bucket
# and a public HTTP HEAD (content-length must be non-empty + match the local size):
curl -sIL "https://models.cubric.studio/vision/models/<type>/file.safetensors" | grep -i content-length
```

**TRAP — every KILLED upload leaves an orphaned multipart session in R2.** Each
time you stop + restart an rclone upload (e.g. to re-apply `--bwlimit`), the
aborted run leaves an incomplete multipart upload behind. These are NOT the final
object (a completed upload is fine + reachable) but they consume bucket space and
show as "Ongoing Multipart Upload" rows in the Cloudflare dash — easy to mistake
for a failed upload. **After any kill-and-restart, clean them up** (R2 delete-class
op → needs user approval first). `rclone cleanup` has a default 24h age filter, so
a same-day orphan needs `-o max-age=0`:
```bash
# list pending (verify what you're about to abort):
rclone --config "$CONF" backend list-multipart-uploads cubric-r2:cubric-models
# abort ALL incomplete uploads regardless of age (final objects are untouched):
rclone --config "$CONF" backend cleanup cubric-r2:cubric-models -o max-age=0
```
Better: let an upload run to completion the first time (cap bandwidth UP FRONT so
you never need to kill + restart).

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

- **Image output CAPTURE node title is `Output_Image` (single naming law — MPI-252).**
  The old two-tier system (a `tier` field on `models.js`, bare vs `Input_`/`Output_`) is GONE:
  tier-1 dropped, the `tier` field removed, the whole fleet converted.

  **Image capture title is `Output_Image` (single law — MPI-252).** The whole fleet was
  converted; there is no more tier-1 bare `Output` on an image workflow. Matched by
  `commandExecutor.js` `_imageOutputTitle = 'output_image'`, **case-insensitive** so
  `Output_image` also resolves (Chroma's detailer/upscaler use that spelling). The bare
  `'output'` base string survives in the matcher only as a defensive fallback — no shipping
  image workflow relies on it.
  - Preview capture (multi-stage `previewOnly` runs) titles its node `Output_Preview`.
  - Set the title IN ComfyUI and re-export — do NOT hand-edit the workflow JSON (a manual
    edit is silently lost on the next re-export → the bug returns).
  - Use `PreviewImage`, not `SaveImage` — all Cubric image workflows use PreviewImage, type
    `temp`; the app builds a `/view?...type=temp` URL fine.
  - **TRAP (MPI-217):** the match is on the EXACT lowercased title. A typo (`Ouptput_Image`)
    matches nothing → the run completes with no error, reporting "Generation completed but no
    output returned." If a workflow generates fine (`Prompt executed in N seconds`) but the app
    captures nothing, check the capture node's title first.
- **Injecting an `MpiAnySwitch` needs `'select'` in the injector target list.** The switch's
  selector input is `select` (int). `comfyController.js` `_inject` targets did NOT include it
  until MPI-182 — injection matched the node by title but wrote nothing → the dropdown
  silently no-op'd. If you author ANY MpiAnySwitch driven by a control, confirm `'select'` is
  in that target array. **MpiAnySwitch is 1-INDEXED** (select starts at 1) — the control must
  inject 1-based values or it picks the wrong branch.
- **A runtime in-workflow selector = a `PROMPT_BOX_CONTROLS` entry + a `commandRegistry`
  component.** Clone the `upscaleFactor` control (an `MpiRadioGroup` whose
  `getInjectionParams()` returns `{ <Node_Title>: value }`). Add the control id to the op's
  `components` array and a default to `promptControlDefaults.js`. The control's
  `getInjectionParams()` return key must equal the switch node's `_meta.title` (an `Input_*`
  title). `_buildParams` renames any bare control key to its `Input_` form before injection
  (MPI-252), but author the control to return the `Input_*` key directly — the node title is
  the contract.
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

---

## 9. Style-LoRA system (Krea2 pattern, MPI-242) — scalable to any model

A model that ships a **set of mutually-exclusive style LoRAs** with trigger phrases. Krea2 is
the first; LTX is next. The whole system is driven by **two injected scalars** — never a
filename, never a trigger string.

**In the workflow:**
- N `MpiLoraModel` nodes titled `Input_style_lora_1..N`, each with its **`lora_name` hardcoded**
  and its `strength_model` **linked** (not a widget).
- Each strength comes from an `MpiMath` evaluating `b if a == N else 0.0`, where
  `a ← Input_Style` (`MpiInt`) and `b ← Input_Stylization` (`MpiFloat`).
  ⇒ Selecting style N sets slot N to the slider value and **zeroes the other N-1**.
  `Input_Style = 0` zeroes all of them.
- The **same int** feeds `MpiPromptList.specific_item` (1-indexed; `options` holds the trigger
  phrases newline-joined, `prefix: ", "`, `suffix: "."`), whose output flows through
  `MpiPromptProcessor` → `StringConcatenate.string_b`, with `Input_Positive` as `string_a`.

**Why this shape:** one integer drives BOTH the LoRA choice and the trigger phrase, so the two
lists cannot drift. Do not port the upstream `CustomCombo` + `RegexExtract` two-list design —
it ships already drifted.

**Traps:**
- **`options` line count MUST equal the LoRA count.** A missing line means that style loads its
  LoRA but appends no trigger — a *silent half-application* that reads as "the LoRA is weak."
  (Krea2 shipped 8 lines for 9 LoRAs; caught by diffing the two.) **Assert `len(options) == N`.**
  Krea2 now asserts this **at build time** in `generate_krea2.py::_assert_style_rack`, which also
  checks that slot `N`'s `strength_model` is gated by the `MpiMath` reading `b if a == N` — a
  swapped gate silently loads the wrong LoRA. Copy that function for the next style rack.
- **`MpiLoraModel.apply_lora` short-circuits at `strength_model == 0`** (`loras.py:100` — returns
  before `load_lora_cached`). So only ONE style LoRA is ever resident. See the `isWeightDep()`
  over-count note in §4.
- The style LoRAs are **deps** (they travel with the model), not user slots. The user rack stays
  `Input_Lora_1..6`.

**In the app:**
- Two `PROMPT_BOX_CONTROLS` entries: a style dropdown (`nodeTitle: 'Input_Style'`, injects the
  **index**) and a Stylization slider (`nodeTitle: 'Input_Stylization'`, float). Disable the
  slider at index `0`.
- **Labels** = the filename stem after the model prefix, title-cased
  (`krea2_softwatercolor` → `Soft Water Color`). Index `0` = `No Style`.
- **Gate the controls on BOTH the op and the model**, exactly like `previewStage`:
  add the control ids to the relevant ops' `components` arrays in `commandRegistry.js`, and
  capability-gate per model inside `MpiPromptBox._refreshOpSlot()` so models without styles
  never mount them. Krea2's detailer/upscaler have no style rack ⇒ styles appear on `t2i`/`i2i`
  only.

---

## 10. `Output_prompt` — the workflow owns the saved prompt (MPI-242)

Applies to **any** workflow whose graph rewrites the prompt between the box and the
text encoder. Krea2 is the first; every later model with the same feature follows this
shape, and the app-side plumbing already handles it — you add nodes, not code.

**The contract.** A workflow that carries a `PreviewAny` node titled **`Output_prompt`**
declares: *the string I encoded is the prompt of record.* The app then reads the saved
prompt from that node instead of the prompt box — always, whether or not any toggle is on.

Without it, the app saves whatever text sat in the prompt box, which is wrong the moment
the graph expands, rewrites, or decorates the prompt.

**In the workflow:**
- A `PreviewAny` node (display name *"Preview as Text"*) titled `Output_prompt`.
- **Tap it upstream of the style concat**, at the point where the prompt is final but
  before any style trigger is appended. Krea2 taps the enhancer's `MpiIfElse` output
  (node 241), which is the last node carrying only the prompt.
  ⇒ The saved prompt has **no trigger phrase**, so *Reuse Prompt* restores the text and
  leaves the style free to change. Tapping the `StringConcatenate` instead bakes the
  trigger in and double-appends on the next run.
- `PreviewAny` is `OUTPUT_NODE = True` and returns `{"ui": {"text": (value,)}}`
  (`comfy_extras/nodes_preview_any.py`), so the string arrives on the `executed` message
  as `text: [str]`. It carries **no file dict** — it is not a `/view` URL.

**The prompt enhancer (the reason the node exists).**
- `Input_Enhance_Prompt` (`MpiIfElse`, `inputs.boolean`) switches between the raw prompt
  and a `TextGenerate` expansion. Bake it `false`.
- `TextGenerate` runs the **LM head of the text encoder the workflow already loaded** —
  no second model, no extra VRAM, no new dep, no image rebuild.
- ⚠ **Eligibility is a hard capability limit, not a policy choice.** It works iff the
  loaded CLIP implements `.generate()`. Qwen3-VL (Krea2) ✅, Gemma3/Gemma-4 (LTX-2) ✅,
  **T5 / umT5 (Chroma, Wan) ✗ — the node raises `AttributeError`, it does not degrade.**
  Never wire it on a T5 model.
- ⚠ **The system prompt IS the feature.** Qwen3-VL's default chat template has no system
  role, so a naked `use_default_template` expansion free-associates and drifts from intent
  (this is why enhancement was cut once). Escape hatch: a prompt string starting with
  `<|im_start|>` sets `skip_template=True` and passes through raw, so a real system turn
  can be built — feed it in via a `Text String` → `StringConcatenate` ahead of
  `TextGenerate`. Put the faithfulness rules there. Expect to tune the wording.
- The `image` socket is honoured by Qwen3-VL; `video`/`audio` are **silently swallowed**
  (they fall into `**kwargs` and die in `SDTokenizer`). Do not wire them.

**In the app — already implemented, nothing to add per model:**
- `commandExecutor` builds an `outputPromptNodeIds` set (title-scoped, case-insensitive),
  reads the string with `readComfyOutputText()`, and rides it out on the existing
  side-outputs bag: `exec.onComplete(urls, { latents, audioUrl, promptText })`.
- `generationService.exec.onComplete` shadows `positive` with
  `outputInfo.promptText || _positiveFromBox` — one read path, no branch. All six
  sidecar/history writes inherit it. A workflow with no such node yields `null` and the
  prompt-box text is used, exactly as before.
- **Progress bars.** The enhancer emits its own tqdm bar, but only when the toggle is on,
  so the static `progressStages` table cannot express it. `stagesFor(file, mode, extraBars)`
  takes a per-run delta; `commandExecutor` passes `1` when `Input_Enhance_Prompt` is true.
  Omit this and an enhanced run shows `3/2` — the counter climbs past its own total, which
  reads as a hang precisely when the run is genuinely slower. An *unrecorded* workflow
  stays `0`; a delta on top of "unknown" is still unknown.
- **Prompt-box controls** (`enhancePrompt` toggle) are gated on the op's `components[]`
  **and** on `capabilities.promptEnhance` (defaults **false** — a model opts in). Add the
  toggle only to ops whose graph actually has the nodes.

**Traps:**
- The saved prompt is now the graph's, even with the enhancer **off** (the `MpiIfElse`
  passes the raw text through). That is intentional — one read path — but it means the node
  must always be reachable, never bypassed (`mode:4`) or muted (`mode:2`).
- `readComfyOutputText` returns `null` (never `''`) for an empty capture, because
  `generationService` falls back on falsy. An empty string would silently blank the prompt.
- The text must never join the image/gif/video `target` array. It has no file dict; every
  downstream media consumer would choke on a bare string.
- Latency is real and user-visible (up to `max_length` autoregressive steps through a 4B
  model). The toggle's `info` string must name the cost; keep it opt-in.

Guard: `tests/output-prompt-capture.test.cjs`.

---

## 11. One graph, several ops — branch booleans + i2i denoise (Krea2 pattern, MPI-242)

A single `<model>_t2i.json` can serve `t2i`, `i2i` and `poseReference`. Each op selects its
branch by flipping ONE boolean that is **baked `false`** in the graph. Read this before
adding i2i (or any second op) to an existing image workflow.

### The mechanism: `CommandDef.injectParams`

Declare the op's constant params in `commandRegistry.js`, keyed by node title:

```js
i2i:           { …, injectParams: { Input_Is_i2i: true } },
poseReference: { …, injectParams: { Input_pose_reference: true } },
t2i:           { …  /* no injectParams — both booleans stay baked false */ },
```

`commandExecutor._buildParams` merges `COMMANDS[op].injectParams` **before** the user's
`injectionParams`, so a control can still override. One declarative line per op; no
per-op branching in the executor.

### THE TRAP THAT ATE TWO DAYS: injection silently skips unmatched titles

`comfyController` matches params to nodes by `_meta.title` (case-insensitive) and
**drops any param whose title matches no node — no error, no log, no toast.** Two
production bugs came from this, both invisible:

- **`Input_Is_i2i` was never injected.** It appeared in three source *comments* and in
  the graph, but no code ever set it. Krea2's `i2i` ran as `t2i`, silently ignoring the
  input image. Nobody noticed for four sessions.
- **`Input_Batch` never matched.** The `batch` control emits `Input_Batch_Size`. A node
  titled `Input_Batch` matches nothing, so **batch N rendered 1 image** — in Krea2 *and* in
  shipped Chroma.

**The injection key is `Input_<Name>` — exact.** `_buildParams` renames a bare control key to
its `Input_` form (`Batch_Size` → `Input_Batch_Size`) and does NOT abbreviate. Title the node
`Input_<Name>` to match, or it dies quietly. Params objects built OUTSIDE `_buildParams`
(`runAutoMask`) get no rename — they must use `Input_*` keys directly (MPI-253).

Guard: **`tests/inject-params-titles.test.cjs`** asserts every `injectParams` title exists
in every workflow its op can run. It is the diagnostic the injector refuses to give you.

### i2i needs the denoise slider — and it must be gated

i2i is a latent-space op: without `denoise` the user cannot control how far the result
departs from the source. The graph exposes it as an `MpiFloat` titled **`Input_denoise`**
(lowercase `d` is fine — matching is case-insensitive; the `denoise` control emits
`Input_Denoise`).

Wire it **only on i2i**:

```js
i2i: {
    injectParams: { Input_Is_i2i: true },
    components: [ …, 'denoise', 'ratio', 'batch' ],
    defaults: { denoise: 0.30 },   // match the graph's baked value
},
```

**Why not on t2i / poseReference:** in the Krea2 graph `Input_denoise` reaches the sampler
only through the `Input_Is_i2i` gate (`MpiIfElse`). On the other ops the node is inert, so
mounting the slider there would be dead UI. **Verify this per graph** — trace the denoise
node's consumer before deciding. If your graph feeds denoise unconditionally, it belongs on
every sampling op.

`defaults` is per-op (`commandRegistry.commands[op].defaults`), read by `scope:'perOp'`
controls. `upscale` uses 0.20, `detail` 0.30, `pid` 0.0 — pick the value your graph bakes.

### Checklist for a shared-graph op

- [ ] Boolean node is baked **`false`** and titled `Input_<Name>` (naming law)
- [ ] Op declares `injectParams: { Input_<Name>: true }` — the ONLY thing that sets it
- [ ] `models.js`: add the op to `supportedOps` **and** map `workflows.<op>` to the same file
- [ ] Media slot declared if the op needs one (`requiresImages`, `mediaInputs`)
- [ ] i2i (or any latent-space op): add `'denoise'` to `components` + a `defaults.denoise`,
      **after** tracing that the denoise node is reachable on that branch
- [ ] `progressStages.js`: keyed by **FILE**, not op — a shared graph needs no new entry.
      (If a branch adds its own tqdm bar — e.g. a depth preprocessor — it needs a per-op split.)
- [ ] `js/core/operationRegistry.js`: new op → entry with `appVersionIntroduced` = current
      APP_VERSION. `operation_registry.json` is generated (`/mpi-version-bump`), never hand-edited
- [ ] Run `tests/inject-params-titles.test.cjs`

### Known live bug (not yours to fix here)

`MpiPromptBox.setModelList()` re-runs `_pickOpForModel` on every model-list refresh, so a
workspace switch silently reverts the user's chosen op to the first entry in `supportedOps`
that matches the current media state (image chip present → `i2i`; no chip → `t2i`).
Adding ops makes it more visible. Tracked as **MPI-247** — do not "fix" it inside a model card.

---

## Checklist (copy per model)

- [ ] **READ THIS PLAYBOOK FIRST.** Do not work from a handoff or a model-scoped doc alone — they
      assume the playbook, they do not replace it.
- [ ] Decide shape: combined (`dependencies[]`) vs separate (`commonDeps`+`operations{}`); single vs multi-stage
- [ ] Output capture titled `Output_Image` (image) / `Output_Video` (video) / `Output_Preview` (multi-stage preview) — §8. Single naming law (MPI-252); no bare `Output`
- [ ] Author + save the workflow template in `comfy_workflows/`
- [ ] Verify the op-boolean feeds only the MpiIfElse; normalize all loader file paths to bare filenames (§3)
- [ ] **Any OPTIONAL media input** (a `Load*` on a graph that can run without it)? Bake `placeholder.png` AND confirm `_prepareWorkflowInputs` stages it for this op's `mediaType` (§2). Required inputs need neither
- [ ] Write/run the generator → runtime files in `comfy_workflows/`
- [ ] Add `progressStages.js` entry — COUNT tqdm bar restarts live per run mode (§4b); wrong = wrong `N/M` in status bar
- [ ] Add dep entries (`dependencies.js`), reuse shared deps, `sha256: null`
- [ ] **Baked LoRAs** (workflow-loaded, not user slots)? Declare as normal deps — `size`, no `type`, per-family `loras/<family>/` subfolder (§4)
- [ ] **Style LoRA set?** Follow §9 — assert `len(MpiPromptList.options) == number of style LoRAs`, gate controls per-op AND per-model
- [ ] **Graph rewrites the prompt** (enhancer, or anything between box and encoder)? Follow §10 — add a `PreviewAny` titled `Output_prompt`, tapped UPSTREAM of the style concat. `promptEnhance` requires a CLIP with `.generate()` (Qwen3-VL/Gemma ✅, T5/umT5 CRASHES). The system prompt is the deliverable, not the wiring
- [ ] Upload new weights to R2 with `--s3-no-check-bucket`; VERIFY with lsf + HTTP HEAD (don't trust exit code)
- [ ] `/mpic-compute-dep-hashes` → fill all sha256
- [ ] Add the `ModelDef` (`models.js`); set capabilities, workflows, dependencies, enhanceRecipe
- [ ] New `type`? Sweep the four consumers (§6)
- [ ] **One graph serving several ops** (t2i + i2i + poseReference)? Follow §11 — each op flips ONE baked-`false` boolean via `commandRegistry.injectParams`. **Injection SILENTLY SKIPS a title that matches no node** (this hid `Input_Is_i2i` and `Input_Batch` for four sessions). The injection key is `Input_<Name>` — exact, never abbreviated (`Batch_Size` → `Input_Batch_Size`). Run `tests/inject-params-titles.test.cjs`
- [ ] **i2i op?** It needs the `denoise` control + a per-op `defaults.denoise` (§11) — but only after tracing that the denoise node is reachable on the i2i branch. On Krea2 it sits behind the `Input_Is_i2i` gate, so t2i/poseReference must NOT mount it
- [ ] New OP? Add to BOTH `js/core/operationRegistry.js` + `operation_registry.json` (§8), `appVersionIntroduced` = current APP_VERSION
- [ ] Runtime in-workflow selector? Add a `PROMPT_BOX_CONTROLS` entry + `commandRegistry` component + `promptControlDefaults` (§8); `nodeTitle` == switch title; MpiAnySwitch needs `select` in the injector + 1-indexed values
- [ ] Model with no upscale-model/LoRA config? `showSettings: false` on the ModelDef (§8)
- [ ] Shared VAE/encoder deps? RESOURCE-named ids (`vae-*`), not model-scoped (§8)
- [ ] Verify: parse cross-ref, loader paths, upload HEAD, app launch
- [ ] NO app version bump (adding a model/op ≠ version bump)
