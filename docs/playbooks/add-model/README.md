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
| **Optional** media input (a `Load*` on a graph that can run without it) needs `placeholder.png` baked **and** staged. **Required** inputs need neither — the injector overwrites the widget | [01](01-workflow-split.md) |
| `_prepareWorkflowInputs` gates on `mediaType === 'video'` — an image model with an optional `LoadImage` never stages. Widen the gate | [01](01-workflow-split.md) |
| **Baked LoRAs are normal deps** (`size`, **no `type`**, `loras/<family>/` subfolder). Not user slots. LTX ships 3, Wan-5B 1 | [02](02-dependencies-r2.md) |
| `isWeightDep()` counts every LoRA dep toward `totalWeightsGb()` — over-counts mutually-exclusive style LoRAs. **Measure before special-casing** | [02](02-dependencies-r2.md) |
| VRAM/RAM table is **computed**, never authored. Get the dep `size` strings right and it is correct. `sizeTier` is only a badge | [03](03-model-registry.md) |
| Loader path == dep `filename` == on-disk path. Subfoldered LoRAs list with **backslashes** | [01](01-workflow-split.md) |
| R2: `--s3-no-check-bucket` (else 403) + `--bwlimit 3M`. Verify with `lsf` + HTTP HEAD — a wrapping `echo` masks rclone's exit code | [02](02-dependencies-r2.md) |
| Any single weight file **≥ 20 GB** ⇒ 🛑 **STOP and ask the user** (Pod hot-store + container-disk budget) | [02](02-dependencies-r2.md) |
| `progressStages.js` bar counts **must be counted live** per run mode. Never guess | [02](02-dependencies-r2.md) |
| Injection **silently skips** a param whose `Input_*` title matches no node (hid `Input_Is_i2i` + `Input_Batch` for 4 sessions) | [04](04-ops-and-controls.md) |
| Style-LoRA set ⇒ assert `len(MpiPromptList.options) == number of style LoRAs`. A missing trigger line is a silent half-application | [05](05-prompt-and-styles.md) |
| Models are **NOT** version-bumped | this file |

## Hard rules

- **Never hand-edit a workflow JSON.** Titles/values change in ComfyUI, then re-export.
  A manual edit is silently lost on the next export and the bug returns.
- **R2 uploads need explicit user approval** before you run them. R2 *deletes* likewise.
- **Ask the user to save the ComfyUI canvas** before you read any workflow they just edited.
- If the user tells you something this playbook already covers, that is a **playbook
  failure or a reading failure** — figure out which, and fix the playbook if it is the
  former. Do not let the knowledge live only in the conversation.

## Checklist (copy per model)

- [ ] **READ THIS PLAYBOOK FIRST.** Do not work from a handoff or a model-scoped doc alone — they
      assume the playbook, they do not replace it.
- [ ] Decide shape: combined (`dependencies[]`) vs separate (`commonDeps`+`operations{}`); single vs multi-stage
- [ ] Output capture titled `Output_Image` (image) / `Output_Video` (video) / `Output_Preview` (multi-stage preview) — [04](04-ops-and-controls.md). Single naming law (MPI-252); no bare `Output`
- [ ] Author + save the workflow template in `comfy_workflows/scripts/workflow_generation/`
- [ ] Verify the op-boolean feeds only the MpiIfElse; normalize all loader file paths to bare filenames — [01](01-workflow-split.md)
- [ ] **Any OPTIONAL media input** (a `Load*` on a graph that can run without it)? Bake `placeholder.png` AND confirm `_prepareWorkflowInputs` stages it for this op's `mediaType` — [01](01-workflow-split.md). Required inputs need neither
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
