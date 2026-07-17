# Add a New Model — End-to-End Playbook

> The single procedure for wiring a new model into Cubric Vision. This README is the
> orientation hub + the master checklist; the deep reference is split across the
> section files below. **Read this file first, then the section for the step you're on.**
>
> Enforced by the `/mpi-add-model` skill. A handoff or a model-scoped research doc
> (`docs/models/<model>/`) assumes this playbook — it does not replace it.
>
> **Models are NOT version-bumped.** Adding a model does not touch `appVersion.js`.
> A new model that reuses existing ops (`t2v_ms`/`i2v_ms`) does NOT touch
> `operationRegistry.js` / `commandRegistry.js` / `operation_registry.json` either —
> those change only for a NEW operation type.
>
> **Cross-cutting reference:** skim [../common/README.md](../common/README.md) first —
> the hard rules, raw→API sync, op registration, inject-title guard, and output-capture
> naming law are shared with the add-app playbook and have their canonical detail there.
> This playbook's inline notes override the shared files where they diverge.

Worked example throughout: **Wan 2.2 TI2V-5B** (MPI-172) — a combined-op,
single-stage, low-tier video model. Krea2 (MPI-242) is the worked example for the
style-LoRA + shared-graph + `Output_prompt` sections.

## Sections — read on demand, not all at once

> **Read THIS hub in full; open a section file only when you reach its step.** The table
> routes each topic to its file. Reading all six up front wastes context — a model with no
> style rack never needs `05`, a combined-op model never needs the separate-op notes.

(§-numbers = the legacy anchors code comments still cite.)

| File | Covers | Legacy § |
|---|---|---|
| [01-workflow-split.md](01-workflow-split.md) | Author locally first; template → per-op runtime files; media-input placeholder; loader-path == dep-path | §0a, §1, §2, §3 |
| [02-dependencies-r2.md](02-dependencies-r2.md) | Dep entry shape; baked LoRAs; **≥20 GB hot-store gate**; R2 upload + traps; hashes; `progressStages` bar count | §4, §4b |
| [03-model-registry.md](03-model-registry.md) | The `ModelDef` in `models.js`; new-`type` consumer sweep | §5, §6 |
| [04-ops-and-controls.md](04-ops-and-controls.md) | New-op runtime selector (PiD); one graph → many ops via baked booleans (Krea2) | §8, §11 |
| [05-prompt-and-styles.md](05-prompt-and-styles.md) | **§9** style-LoRA system; **§10** `Output_prompt` (workflow owns the saved prompt) | §9, §10 |
| [06-verify.md](06-verify.md) | Definition of Done — parse cross-ref, loader paths, upload HEAD, app launch | §7 |

Model-specific research (LTX tiers, Krea2 samplers, PiD facts) lives in
`docs/models/<model>/`, NOT here — this playbook is the model-agnostic *how*.

The **cross-cutting workflow machinery** (the MpiNodes pack, the injector target list,
the template→runtime generator + tier-selector patterns) is shared with the app system
and lives in [../../workflow-authoring/README.md](../../workflow-authoring/README.md).
This playbook links into it; read it when you're authoring the graph itself or adding a
new injectable node/control.

## Phase 0 — Research & scaffold BEFORE authoring (greenfield models)

This playbook's checklist is the **wiring** phase. It assumes a proven graph and a
scaffolded research home already exist. For a greenfield model (no `docs/models/<model>/`,
no proven workflow), do the front-end first — the `/mpi-add-model` skill's **PHASE 0**
enforces it:

1. **Currency + version-match research.** Confirm the latest generation and that base /
   text-encoder / VAE / accelerator-LoRA files are the right + MATCHED versions. An
   older-generation accelerator LoRA on a newer base silently degrades quality.
2. **Dep-reuse pass.** Grep `assetDeps.js` + `dependencies.js` — VAEs/text encoders are
   often already hosted. Classify each slot REUSE vs NEW; flag any single file ≥20GB now.
3. **Scaffold the card** (`doing`/`in-progress`) and the two research homes:
   `.agents/mpi-kanban/tasks/MPI-<n>/research/` (raw) + `docs/models/<model>/` (settled,
   mirror `docs/models/krea2/`).
4. **Author + prove the graph locally** (§0a), then the user saves it to
   `comfy_workflows/raw/`. Only then start the checklist below.

## 0a. Author & prove the workflow in the LOCAL ComfyUI FIRST

Before any app wiring, build and prove the ComfyUI graph in the standalone local
ComfyUI (see [01-workflow-split.md](01-workflow-split.md) § 0a). A workflow graduates
to app wiring only after it passes on the local folder; the in-app engine run is the
second gate.

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

## The traps that actually bite (all detailed in the section files)

| trap | where |
|---|---|
| Capture title is `Output_Image` (image) / `Output_Video` (video) / `Output_Preview` (multi-stage preview). Single naming law (MPI-252); no bare `Output` | [04](04-ops-and-controls.md) |
| Media inputs (image/mask/video/audio) are path→string loaders that self-gate on empty — no placeholder (MPI-272). Only `LoadLatent` still stages a baked default | [01](01-workflow-split.md) |
| **Baked LoRAs are normal deps** (`size`, **no `type`**, `loras/<family>/` subfolder). Not user slots. LTX ships 3, Wan-5B 1 | [02](02-dependencies-r2.md) |
| `isWeightDep()` counts every LoRA dep toward `totalWeightsGb()` — over-counts mutually-exclusive style LoRAs. **Measure before special-casing** | [02](02-dependencies-r2.md) |
| VRAM/RAM table is **computed**, never authored. Get the dep `size` strings right and it is correct. `sizeTier` is only a badge | [03](03-model-registry.md) |
| Loader path == dep `filename` == on-disk path. Subfoldered LoRAs list with **backslashes** | [01](01-workflow-split.md) |
| Workflow filenames are **all-lowercase** — raw/runtime/template/`registry` prefix/`models.js` key are one name; the Pod FS is case-sensitive so a mixed-case name works on Windows and 404s remotely. `sync-raw-workflows` gates on it | [01](01-workflow-split.md) |
| R2: `--s3-no-check-bucket` (else 403) + `--bwlimit 3M`. Verify with `lsf` + HTTP HEAD — a wrapping `echo` masks rclone's exit code | [02](02-dependencies-r2.md) |
| Any single weight file **≥ 20 GB** ⇒ 🛑 **STOP and ask the user** (Pod hot-store + container-disk budget) | [02](02-dependencies-r2.md) |
| `progressStages.js` bar counts **must be counted live** per run mode. Never guess | [02](02-dependencies-r2.md) |
| Injection **silently skips** a param whose `Input_*` title matches no node (hid `Input_Is_i2i` + `Input_Batch` for 4 sessions) | [04](04-ops-and-controls.md) |
| Style-LoRA set ⇒ assert `len(MpiPromptList.options) == number of style LoRAs`. A missing trigger line is a silent half-application | [05](05-prompt-and-styles.md) |
| Models are **NOT** version-bumped | this file |

## Hard rules

The two universal hard rules (never hand-edit a workflow JSON; a covered-but-asked
question is a failure) are canonical in [../common/hard-rules.md](../common/hard-rules.md).
Model-specific additions:

- **R2 uploads need explicit user approval** before you run them. R2 *deletes* likewise.
- **Ask the user to save the ComfyUI canvas** before you read any workflow they just edited.

## Checklist (copy per model)

- [ ] **READ THIS PLAYBOOK FIRST.** Do not work from a handoff or a model-scoped doc alone — they
      assume the playbook, they do not replace it.
- [ ] Decide shape: combined (`dependencies[]`) vs separate (`commonDeps`+`operations{}`); single vs multi-stage
- [ ] Output capture titled `Output_Image` (image) / `Output_Video` (video) / `Output_Preview` (multi-stage preview) — [04](04-ops-and-controls.md). Single naming law (MPI-252); no bare `Output`
- [ ] Author + save the workflow template in `comfy_workflows/scripts/workflow_generation/`
- [ ] Verify the op-boolean feeds only the MpiIfElse; normalize all loader file paths to bare filenames — [01](01-workflow-split.md)
- [ ] **Workflow filenames all-lowercase** (raw + runtime + template + `registry` prefix + `models.js` key agree byte-for-byte) — case-sensitive Pod FS. `sync-raw-workflows` gates on it — [01](01-workflow-split.md)
- [ ] **Media inputs** are path→string loaders (`MpiLoadImageFromPath`/`MpiLoadAudio`/`MpiLoadVideo`) that self-gate on empty — no placeholder (MPI-272). Any `LoadLatent`? Bake its latent AND confirm `_prepareWorkflowInputs` stages it — [01](01-workflow-split.md)
- [ ] Write/run the generator → runtime files in `comfy_workflows/`
- [ ] Add `progressStages.js` entry — COUNT tqdm bar restarts live per run mode — [02](02-dependencies-r2.md); wrong = wrong `N/M` in status bar
- [ ] Add dep entries (`dependencies.js`), reuse shared deps, `sha256: null`
- [ ] **Baked LoRAs** (workflow-loaded, not user slots)? Declare as normal deps — `size`, no `type`, per-family `loras/<family>/` subfolder — [02](02-dependencies-r2.md)
- [ ] **Style LoRA set?** Follow [05 §9](05-prompt-and-styles.md) — assert `len(MpiPromptList.options) == number of style LoRAs`, gate controls per-op AND per-model
- [ ] **Graph rewrites the prompt** (enhancer, or anything between box and encoder)? Follow [05 §10](05-prompt-and-styles.md) — add a `PreviewAny` titled `Output_prompt`, tapped UPSTREAM of the style concat. `promptEnhance` requires a CLIP with `.generate()` (Qwen3-VL/Gemma ✅, T5/umT5 CRASHES). The system prompt is the deliverable, not the wiring
- [ ] `/mpic-compute-dep-hashes` → fill all sha256 — hashes from the LOCAL copy under
      `G:\CubricModels`, so this does NOT wait for the upload; run it in parallel — [02](02-dependencies-r2.md)
- [ ] Upload new weights to R2 with `--s3-no-check-bucket`; VERIFY with lsf + HTTP HEAD (don't trust exit code) — [02](02-dependencies-r2.md). Upload is ship-prep (end-user download), NOT test-prep — the app tests locally before it finishes
- [ ] Add the `ModelDef` (`models.js`); set capabilities, workflows, dependencies, enhanceRecipe — [03](03-model-registry.md)
- [ ] New `type`? Sweep the consumers — [03](03-model-registry.md)
- [ ] **One graph serving several ops** (t2i + i2i + poseReference)? Follow [04](04-ops-and-controls.md) — each op flips ONE baked-`false` boolean via `commandRegistry.injectParams`. **Injection SILENTLY SKIPS a title that matches no node** (this hid `Input_Is_i2i` and `Input_Batch` for four sessions). The injection key is `Input_<Name>` — exact, never abbreviated (`Batch_Size` → `Input_Batch_Size`). Run `tests/inject-params-titles.test.cjs`
- [ ] **i2i op?** It needs the `denoise` control + a per-op `defaults.denoise` — [04](04-ops-and-controls.md) — but only after tracing that the denoise node is reachable on the i2i branch. On Krea2 it sits behind the `Input_Is_i2i` gate, so t2i/poseReference must NOT mount it
- [ ] New OP? Add to BOTH `js/core/operationRegistry.js` + `operation_registry.json` — [04](04-ops-and-controls.md), `appVersionIntroduced` = current APP_VERSION
- [ ] Runtime in-workflow selector? Add a `PROMPT_BOX_CONTROLS` entry + `commandRegistry` component + `promptControlDefaults` — [04](04-ops-and-controls.md); `nodeTitle` == switch title; MpiAnySwitch needs `select` in the injector + 1-indexed values
- [ ] Model with no upscale-model/LoRA config? `showSettings: false` on the ModelDef — [04](04-ops-and-controls.md)
- [ ] Shared VAE/encoder deps? RESOURCE-named ids (`vae-*`), not model-scoped — [04](04-ops-and-controls.md)
- [ ] Verify: parse cross-ref, loader paths, upload HEAD, app launch — [06](06-verify.md)
- [ ] NO app version bump (adding a model/op ≠ version bump)

## Removing or re-tiering a model (reverse the add)

Dropping a model/tier (or swapping a weight) touches the SAME surfaces in reverse.
Miss one and you ship a dangling ref or a stale card. Order (MPI-266 dropped Boogu's
fp8_scaled Balanced tier, collapsed 3→2):

1. **Generator + template** — remove the tier's row from `MODEL_VARIANTS`; edit the
   template (user-owned, never hand-edit JSON) to drop that tier's loader/sampler chain.
   Renumber remaining `Input_Tier` values if the count changed; keep the generator's baked
   tier ints in sync.
2. **Regen + delete stale runtime JSON** — rerun the generator, then `git rm` the runtime
   file(s) no longer produced. Confirm `ls` shows only the surviving tiers.
3. **dependencies.js** — delete the dropped weight's dep entry. If a surviving tier is
   re-slotted, rename its dep id to match the new tier.
4. **models.js** — delete the dropped `ModelDef`; re-slot a promoted tier (`id`, `sizeTier`,
   `image`, `gen_speed`, `workflows`, `dependencies`, capabilities like `negativePrompt`).
5. **progressStages.js** — drop the removed file's key; re-key a renamed file.
6. **display webp** — the card `image` must show the SURVIVING tier's weight output, not the
   dropped one. Overwrite/rename the webp; `git rm` the orphan.
7. **Consumer sweep** — grep the old dep id / filename / tier id across `js/`,
   `operation_registry.json`, docs. Zero orphans.
8. **R2 delete (approval gate)** — remove the dropped weight from R2 (`rclone deletefile
   --s3-no-check-bucket`); verify HEAD 404. Weight is re-uploadable from `G:\CubricModels`.
9. **Changelog** — if the model's UNRELEASED entry named the dropped tier, UPDATE that entry
   (don't add a new one). A stale "three tiers" note ships silently otherwise.

No version bump (still a model change).
