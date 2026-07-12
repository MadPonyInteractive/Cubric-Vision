# Integrate NVIDIA PiD as a prompt-box image upscaler model

## Current State

Project mode: scalable-foundation (full guardrails — rules, factory, events, state proxy).

PiD (Pixel Diffusion Decoder, NVIDIA PixelDiT) is a 4-step DMD2-distilled generative
upscaler: latent → pixel-space diffusion → 4× super-res. Research complete and captured in
`docs/builder/research/pid-upscaler.md` (compat, tiers, knobs, per-path character, product
direction). All 4 paths tested and working locally.

**Decided architecture** (see research doc § Product direction / Registration shape):
- PiD = ONE model entry in the registry, prompt-box driven (it REQUIRES a prompt → can't be a
  tool). Not the placeholder upscale tool (that's ≈ a resize; unchanged).
- Internal 4-path VAE selector (SDXL / Flux / SD3 / Qwen) INSIDE the workflow, mapped to a
  prompt-box control dropdown. One install (~16 GB), all paths.
- Image-only. Video upscale stays a separate future effort (no Wan-VAE checkpoint; per-frame
  4K pixel diffusion too slow).

**Models staged** on disk at `G:\CubricModels` (byte-verified 2026-07-03), NOT yet on R2:
- `diffusion_models/`: pid_flux1_1024, pid_sdxl_1024, pid_sd3_1024, pid_qwenimage_1024 (2.72 GB ea)
  (+ pid_flux1_512, pid_sd3_512 exist — 512 tiers not used in the 1024→4096 upscale path)
- `vae/`: ae.safetensors, sdxl_vae, sd3_vae, qwen_image_vae
- `text_encoders/`: gemma_2_2b_it_elm_bf16 (4.87 GB, SHARED across all 4 paths)

**Investigation findings** (app already has the machinery — agent-verified 2026-07-03):
- SDXL model def (`sdxl-realistic`, `models.js`) = the image-model template (flat
  `dependencies[]`, `mediaType:'image'`, `supportedOps:['t2i','upscale','detail']`).
- `upscale` op already exists w/ a `denoise` control (default 0.20) + `upscaleFactor` radio —
  the radio is the exact pattern for the path selector.
- Injection: UI control `getInjectionParams()` → `{ NodeTitle: value }` → merged in
  `commandExecutor._buildParams` → matched by `_meta.title` in `comfyController.runWorkflow`
  (tier-2 pass also aliases bare `Foo` → `Input_Foo`). So node `_meta.title`s in the template
  are the contract.
- Dep dedup is automatic by dep id (`resolveModelDeps.js` `dedupeStable`) — list shared Gemma
  once → downloaded once. No per-path duplication (single flat model).

## Front-loaded decisions (resolved, no open forks)

- **New `pid` op** (not reuse `upscale`) — scopes the path-selector control to PiD only, keeps
  SDXL's upscale surface untouched. Costs one op in commandRegistry/operationRegistry(+json).
- **`pid` op default denoise = 0.0** (faithful; upscale default 0.20 is wrong for PiD).
- **denoise slider drives degrade_sigma** — title the workflow's degrade_sigma node
  `Input_Denoise` so the EXISTING denoise control injects it with zero new UI. BasicScheduler
  `denoise` is HARDCODED 1.0 in the template (lowering breaks the 4-step schedule).
- **Path selector = new `pidVariant` control** (clone `upscaleFactor` MpiRadioGroup) → injects
  the path string into the workflow's selector node.
- **Registration = single flat model** (`dependencies[]`, like sdxl-realistic), `mediaType:
  'image'`, `supportedOps:['pid']`.
- **NO template/generator/orchestrate handler.** PiD = one op, no per-op boolean split; the
  4-path + resolution switch at runtime via injection. The exported JSON IS the runtime file
  (`comfy_workflows/NVIDIA_PID.json`). Skip `_template.json`, `generate_pid.py`, registry.py
  HANDLERS. (ponytail: generator machinery is for boolean-split models; PiD has nothing to bake.)
- **Image gating = FREE.** `pid` op declares `requiresImages: 1` + `mediaInputs` `required:true`
  → inherits the existing block-Run-if-no-image toast + auto-op-switch. No new gating code.

## Injection contract (VERIFIED against exported `comfy_workflows/NVIDIA_PID.json`, 2026-07-03)

Workflow EXPORTED (44 nodes, API format) straight to the RUNTIME location
`comfy_workflows/NVIDIA_PID.json` — **NO template/generator/orchestrate handler needed** (PiD
has ONE op, no per-op boolean split; the 4-path + resolution are runtime-injected via
MpiAnySwitch, not baked). ModelDef `workflows: { pid: 'NVIDIA_PID.json' }`.

**CRITICAL: both selectors are MpiAnySwitch = 1-INDEXED** (select starts at 1). Inject 1-based.

| Control | Node title (verified) | id | class | Values |
|---|---|---|---|---|
| Path / VAE selector | `Input_Type` | 1607 | MpiAnySwitch | 1=flux, 2=sd3, 3=qwen, 4=sdxl |
| Output resolution | `Input_Resolution` | 1614 | MpiAnySwitch | 1=1K, 2=2K, 3=4K (passthrough) |
| Degrade sigma (strength) | `Input_Denoise` | 1606 | MpiFloat | 0.0–~0.8 → reuse denoise control |
| Prompt | `Input_Positive` | 1587 | MpiText | reuse-prompt (empty works — proven) |
| Input image | `Input_Start_Frame` | 1583 | LoadImage | ⚠️ see flag below |
| Output | `Output_Image` | 1580 | PreviewImage | — |

**Loaders all BARE filenames ✅** (no subfolder trap): unet=pid_flux1/sd3/qwen/sdxl_1024_...,
vae=ae/sd3_vae/qwen_image_vae/sdxl_vae, clip=gemma_2_2b_it_elm_bf16. Match dep filenames.
Workflow loads ALL 4 unets + 4 vaes; MpiAnySwitch selects the live branch.

**⚠️ BLOCKER — injector does NOT handle `select` (MpiAnySwitch field).** The MpiAnySwitch
selector input is `select` (int), but `comfyController.js:1035-1040` `_inject` target list does
NOT include `'select'`. So injecting `Input_Type`/`Input_Resolution` finds the node by title
but writes NOTHING → switch stays at baked default → path/resolution dropdowns silently do
nothing. **REQUIRED FIX: add `'select'` to the `targets` array in `comfyController.js` _inject
(~line 1036).** This is a real injector gap (PiD is the first model to inject an MpiAnySwitch),
not a PiD hack. Low risk — injection only fires on title match; `select` is a rare input.

**VRAM (measured 2026-07-03, user system):** ~12 GB used with the active path. The 4 UNETLoaders
are NOT all resident (would be ~20 GB+) → ComfyUI lazy-loads only the switched branch ✅. Cost =
active unet 2.72 GB + gemma 4.87 GB + VAE + the 4096²×3 pixel-space activation (big at 4K,
inherent to PiD). Lower-VRAM systems (8 GB): aimdo dynamic-VRAM offloads to RAM (slower, works).
footprint.js computes the floor from dep `size` fields — set those right and the hover table is
correct.

**FLAGS to resolve before/at wiring:**
1. **Image node title mismatch.** LoadImage is titled `Input_Start_Frame`, but the standard
   media slot title is `Input_Image` (commandRegistry `mediaInputs[].title`). FIX: either
   rename node 1583 → `Input_Image` (recommended — it's an upscaler, not a video frame), OR
   set the `pid` op `mediaInputs.title: 'Input_Start_Frame'`. Pick one so the app injects the
   user's image into the right node.
2. **Prompt injection target.** App sends `Positive`; node is titled `Input_Positive`. The
   tier-2 alias (`Positive` → `Input_Positive`) SHOULD bridge it — verify at wiring.
3. **VRAM check.** Workflow declares all 4 UNETLoaders. Confirm ComfyUI lazy-loads only the
   switched branch (dragon test ran fine → likely lazy) and does NOT preload ~16 GB of unets.
4. **`image = imageUpscale_001.png`** baked in node 1583 = test file. App overwrites it via
   media injection at submit (required-image gate ensures a real one). No placeholder needed
   (placeholder.png is for models with UNUSED media nodes — PiD always uses its image).

## Image-required gating = FREE (already exists — investigation-confirmed 2026-07-03)

The app ALREADY blocks Run when a required image is missing. `pid` op inherits it by
declaring `requiresImages: 1` + a `mediaInputs` slot `required: true` (clone `upscale`).
Mechanism (`generationService.js:495-505`): missing image → `ui:warning` toast "Add an image
before generating — this workflow needs one." + aborts (returns null). Plus: op dropdown
disables image-ops when no image; auto-switches op on image add/remove. NO new gating code.

- Output 4K = native PiD 4096 passthrough (no downscale — never throw away the native 4×).
  1K/2K = lanczos downscale of the 4096 (Mpi Scaled Dimensions use_max + Upscale Image, NO
  crop, NO ÷16 on output — ÷16 is a model-input constraint only, irrelevant post-PiD).
- Input normalize (before PiD): Mpi Scaled Dimensions (size 1024, use_max) → Resize Image v2
  (divisible_by 16, lanczos) — any-size input → 1024-tier ÷16. Downscale-then-PiD, single
  pass, NO tiling (v1; tiling = future for huge external images, YAGNI).
- **NON-SQUARE FIX (critical — live-proven 2026-07-03):** `EmptyChromaRadianceLatentImage`
  width/height MUST be driven dynamically = 4× the normalized input dims, NOT hardcoded 4096².
  Wiring: a 2nd `Mpi Scaled Dimensions` (size 4096, side use_max) reads the input image →
  outputs the 4× canvas per-axis → feeds EmptyChromaRadiance w/h. Proven: 2016×1152 input →
  4096×2304 output (16:9 preserved). ÷16 preserved automatically (÷16 input × 4 stays ÷16).
  **The generator must NOT re-hardcode 4096×4096** — keep the dynamic w/h wiring or every
  non-square input comes out square-cropped.
- **`pidVariant` control** injects into `Input_Type` (1–4); **new `pidResolution` control** (or
  reuse a radio) injects into `Input_Resolution` (1–3). Both 1-indexed — off-by-one = wrong
  path/size silently.

## Gating dependency

**User is authoring + testing the workflow template** (`NVIDIA_PID_template.json`). Node
titles above are provisional until the template is final + exported. Also pending:
- Confirm degrade_sigma node title (recommend `Input_Denoise` to reuse the slider).
- `progressStages.js` bar count MUST be counted live from the finished workflow (§4b).
- User testing varied INPUT sizes (any-size → normalize path) — confirm quality holds before
  wiring.

## Implementation

- [ ] **Injector fix (BLOCKER):** add `'select'` to the `_inject` `targets` array in
      `js/services/comfyController.js` (~line 1036) so MpiAnySwitch `select` fields inject.
      Without this the path/resolution dropdowns silently no-op. (PiD is the first model to
      inject an MpiAnySwitch — this is a real injector gap, ships app-wide.)
- [ ] **New `pid` op:** commandRegistry.js + operationRegistry.js + operation_registry.json.
      Clone `upscale`: `mediaType:IMAGE`, `requiresImages:1`, `mediaInputs:[{key:'inputImage',
      title:'Input_Image', required:true}]`, `promptRequired:false`,
      `components:['pidVariant','pidResolution','denoise']`, `defaults:{denoise:0.0}`. Image
      gating is then inherited free.
- [ ] **Controls in `PromptBoxControls.js`:** `pidVariant` (clone `upscaleFactor` MpiRadioGroup,
      4 opts flux/sd3/qwen/sdxl → inject `Input_Type` 1-4) + `pidResolution` (3 opts 1K/2K/4K →
      inject `Input_Resolution` 1-3). BOTH 1-INDEXED. denoise control already exists (→
      `Input_Denoise`).
- [ ] **Deps (`dependencies.js`):** 4 checkpoints (pid_flux1/sdxl/sd3/qwenimage_1024) + 4 VAEs
      (ae/sdxl_vae/sd3_vae/qwen_image_vae) + shared gemma_2_2b_it_elm_bf16. `sha256:null`, url =
      `https://models.cubric.studio/vision/models/<filename>`. Reuse existing dep ids if
      ae/sdxl_vae already declared for other models (dedup automatic).
- [ ] **R2 upload** — IN FLIGHT (bg task, started before wiring). VERIFY landed via lsf + HTTP
      HEAD (content-length), NOT exit code (§4 wrapping-echo trap). Then `/mpic-compute-dep-hashes`.
- [ ] **ModelDef (`models.js`):** flat (clone `sdxl-realistic`), `mediaType:'image'`,
      `supportedOps:['pid']`, `workflows:{pid:'NVIDIA_PID.json'}`, dependencies[] = the 9 dep ids.
- [ ] **`progressStages.js`** entry keyed `NVIDIA_PID.json` — COUNT tqdm bar restarts LIVE
      (load bar + 4-step sampler; verify).
- [ ] Confirm loader paths bare + dep-matched (§3 — already verified in export).

**Verify:** app launches, PiD card appears, upscale runs per path (flux/sd3/qwen/sdxl via the
dropdown), resolution dropdown (1K/2K/4K) works, denoise slider changes degrade behavior,
non-square input stays non-square, Run blocked with toast when no image. Output matches local
bench. No version bump. No template/generator (runtime JSON is the exported file).

## Completed

- Workflow exported + verified (`comfy_workflows/NVIDIA_PID.json`).
- Injector `select` fix (`comfyController.js` _inject targets).
- `pid` op in all 3 registries (commandRegistry.js, core/operationRegistry.js,
  operation_registry.json; `appVersionIntroduced:'1.0.0'`).
- `pidVariant` + `pidResolution` controls (`PromptBoxControls.js`) + defaults
  (`promptControlDefaults.js`).
- 9 deps in `dependencies.js` (sha256:null pending upload).
- ModelDef `nvidia-pid` (`models.js`) + §6 sweep (only fix needed: `enhanceRecipe:'sdxl'`;
  ratios/tiers N/A — pid op has no ratio component).
- Self-verified: parse cross-ref (11 deps resolve), ESLint clean (7 files),
  `getCommandComponents('pid')` → correct controls, injection keys reach workflow (tier-2
  alias skips `Input_`-prefixed; denoise→Input_Denoise bridges).

## Remaining Work

- R2 upload (IN FLIGHT) → verify lsf+HEAD → `/mpic-compute-dep-hashes` fills 9 `sha256:null`.
- `progressStages.js` entry keyed `NVIDIA_PID.json` — count tqdm bars from a LIVE run.
- In-app verify (user-ux): 4 paths, 1K/2K/4K, denoise, non-square, no-image gating.

## Plan Drift

- 2026-07-03: `operationRegistry` is `js/core/operationRegistry.js` (NOT `js/data/`) + the
  `operation_registry.json` mirror — both updated. New op `pid` uses `appVersionIntroduced:
  '1.0.0'` (current APP_VERSION). No app version bump (adding a model/op ≠ version bump).
- 2026-07-03: rgthree Image Comparer was test-only — NOT in the export. Node deps =
  ComfyUI-MpiNodes + comfyui-kjnodes (both pre-existing, reused).
- 2026-07-03 (user, scalability): VAE dep ids renamed from PiD-scoped → resource-named
  (`vae-flux-ae`/`vae-sdxl`/`vae-sd3`/`vae-qwen-image`) since VAEs are SHARED across many
  future models (ae backs Flux/Chroma/Z-Image/+; qwen vae backs Qwen-Image/Edit/+). Checkpoints
  stay `pid-*` (PiD-specific weights); `pid-gemma` stays (pixeldit-specific encoder). Future
  models reference the shared vae ids → automatic dedup.

## Verification

**Verify mode:** user-ux

Has a real UI/UX surface (prompt-box control, path dropdown, denoise→degrade_sigma feel) the
user must judge in the running app. After wiring: launch app, install PiD, run an upscale on a
history image via each of the 4 paths, confirm the path dropdown + denoise slider behave, and
that output matches the local ComfyUI bench. Cross-ref parse (§7.1), loader paths (§3), R2
HEAD (§4), no `sha256:null`.

## Preservation Notes

- `docs/builder/research/pid-upscaler.md` is the source of truth — keep it synced if decisions
  shift during implementation.
- `docs/add-model-playbook.md` § 0a already documents the local test folder + models dir.
- Node `_meta.title` contract: the template's selector + degrade_sigma titles must match the
  control `nodeTitle`s — cross-check before trusting injection (playbook §3 loader trap +
  §2/§4 injection).
- Gemma dep is SHARED — list once (dedup is automatic). Don't split the model into 4 ops/entries.
