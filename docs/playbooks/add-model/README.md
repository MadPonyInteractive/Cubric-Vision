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
> naming law are shared with the add-flow playbook and have their canonical detail there.
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
| [02-dependencies-r2.md](02-dependencies-r2.md) | Dep entry shape; baked LoRAs; Pod hot-store (no size gate); R2 upload + traps; hashes; `progressStages` bar count | §4, §4b |
| [03-model-registry.md](03-model-registry.md) | The `ModelDef` in `models.js`; new-`type` consumer sweep | §5, §6 |
| [04-ops-and-controls.md](04-ops-and-controls.md) | New-op runtime selector (PiD); one graph → many ops via baked booleans (Krea2) | §8, §11 |
| [05-prompt-and-styles.md](05-prompt-and-styles.md) | **§9** style-LoRA system; **§10** `Output_prompt` (workflow owns the saved prompt) | §9, §10 |
| [06-verify.md](06-verify.md) | Definition of Done — parse cross-ref, loader paths, upload HEAD, app launch | §7 |

Model-specific research (LTX tiers, Krea2 samplers, PiD facts) lives in
`docs/models/<model>/`, NOT here — this playbook is the model-agnostic *how*.

The **cross-cutting workflow machinery** (the MpiNodes pack, the injector target list,
the template→runtime generator + tier-selector patterns) is shared with the Flow system
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
   often already hosted. Classify each slot REUSE vs NEW.
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
| Pod hot-store has **no size gate** — everything ≥0.1 GB stages; the only per-file skip is a file bigger than pod VRAM. Nothing to ask the user | [02](02-dependencies-r2.md) |
| `progressStages.js` bar counts **must be counted live** per run mode. Never guess | [02](02-dependencies-r2.md) |
| Injection **silently skips** a param whose `Input_*` title matches no node (hid `Input_Is_i2i` + `Input_Batch` for 4 sessions) | [04](04-ops-and-controls.md) |
| Style-LoRA set ⇒ assert `len(MpiPromptList.options) == number of style LoRAs`. A missing trigger line is a silent half-application | [05](05-prompt-and-styles.md) |
| A model that BREAKS A SHIPPED CONVENTION — a new node class, a missing twin file, a different filename shape — must have that convention **grepped for in the app before testing**. The app ENCODES conventions in shared resolvers, and each one is a silent half-wire | this file |
| Models are **NOT** version-bumped | this file |

## Hard rules

The two universal hard rules (never hand-edit a workflow JSON; a covered-but-asked
question is a failure) are canonical in [../common/hard-rules.md](../common/hard-rules.md).
Model-specific additions:

- **R2 uploads need explicit user approval** before you run them. R2 *deletes* likewise.
- **Ask the user to save the ComfyUI canvas** before you read any workflow they just edited.
- **If the model breaks a convention every shipped model follows, grep the app for the code
  that ENCODES that convention — before you test, not after.** The app has shared resolvers
  that assume the fleet's shape, and each unswept one is a silent half-wire: no error, a
  plausible-looking result, and a fallback path that hides it. MiniMax H3 cost two in one
  session (MPI-452) by being the first model to ship ONE workflow for both stages and the
  first to use `MpiSaveLatent`: `saveLatentNodeIds` in `js/services/commandExecutor.js`
  matched only `class_type === 'SaveLatent'`, so **every** preview silently re-ran the whole
  workflow instead of resuming; and `resolveWorkflowFile` in
  `js/data/modelConstants/resolveModelDeps.js` appends `_stage2` unconditionally, so Finish
  404'd on a twin that deliberately does not exist. Both were found by running the app, not
  by reading the graph. Start the grep from the new thing's name (`MpiSaveLatent`,
  `_stage2`) and read every hit.

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
- [ ] New OP? Add to BOTH `js/core/operationRegistry.js` + `operation_registry.json` — [04](04-ops-and-controls.md), `appVersionIntroduced` = current APP_VERSION. **Write the JSON entry BY HAND** — nothing generates that file and `/mpi-version-bump` never runs for a model — then `npm run release:check` (MPI-300 shipped the JS half only)
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
3. **dependencies.js — KEEP the dep entry, do not delete it** (corrected 2026-08-07; the
   old "delete the dep entry" step predates the orphan sweep and both MPI-470 and MPI-466
   did the opposite on the same day). `_orphanedDepIds` (`routes/downloadManager.js`,
   MPI-462/464) iterates `DEPS` and trashes what no model's dep list protects — so the
   entry surviving is exactly what lets an uninstall reclaim the weight from users who
   ALREADY downloaded it. Delete it and the sweep goes blind: the file strands forever,
   untracked, with nothing in the app able to remove it. Mark the entry
   `// ── DEPRECATED (MPI-nnn)` and say why it stays. If a surviving tier is re-slotted,
   rename its dep id to match the new tier.
4. **models.js** — delete the dropped `ModelDef`; re-slot a promoted tier (`id`, `sizeTier`,
   `image`, `gen_speed`, `workflows`, `dependencies`, capabilities like `negativePrompt`).
5. **progressStages.js** — drop the removed file's key; re-key a renamed file.
6. **display webp** — the card `image` must show the SURVIVING tier's weight output, not the
   dropped one. Overwrite/rename the webp; `git rm` the orphan.
7. **Consumer sweep** — grep the old dep id / filename / tier id across `js/`,
   `operation_registry.json`, docs. Zero orphans. **Grep `tests/` too** — see below.
8. **R2 + the HF mirror — the user's call, and the default is LEAVE THEM UP.** A released
   build still lists the dep, so deleting the object turns its install into a 404 rather
   than a clean skip. Delete only when the user says so (`rclone deletefile
   --s3-no-check-bucket`, verify HEAD 404; re-uploadable from `G:\CubricModels`).
9. **Changelog** — if the model's UNRELEASED entry named the dropped tier, UPDATE that entry
   (don't add a new one). A stale "three tiers" note ships silently otherwise. Also grep
   UNRELEASED for the thing as a worked EXAMPLE in someone else's entry — MPI-470 left a
   fix note explaining itself through an op that no longer exists.

No version bump (still a model change).

### Deprecating ONE operation on a surviving model

Same list, but the model stays. Steps 1–3 and 7–9 apply unchanged; 4/6 do not (the
`ModelDef` and its webp survive). The op-specific part (MPI-470, Wan 2.2 `t2v_ms`):

- **`models.js` — remove the op from all THREE lists**: `supportedOps`, `workflows`, and
  `operations{}`. A leftover in any one of them is still offerable or still resolvable.
  Assert all three in a test; a half-removal reads as done.
- **The dispatch path needs nothing new.** A legacy history item naming the dead op hits
  `resolveWorkflowFile` → `null` and `commandExecutor` `_failBail`s with
  `No workflow registered for model "x", operation "y"`. A stale
  `s_modelOpDraftByModel` entry is filtered out by `expandRequiredOps`; a remembered op is
  re-checked against `supportedOps`. Verify these still hold — do not add guards for them.
- **Leave the op key in `operationRegistry.js`** while any model still uses it (`t2v_ms`
  is shared by LTX/H3). Only the LAST model dropping a key earns a `deprecated: true`
  entry, and that is so old history items keep validating — nothing may WRITE it again.
- **Tests pinned to REAL registry data are the ones that break.** Deprecating the last
  model with a given shape (wan-22 was the only 2-op model) breaks every test that did
  `MODELS.find(...)` for that shape. Rebuild the removed shape as a local fixture and
  say why in a comment — the guard must survive, not the exemplar. Watch for magic-number
  floors (`assert.ok(swept >= 8)`): rewrite as coverage ("every model in the fleet
  contributed"), which does not break when a parallel session collapses graphs.
  See memory `feedback_deprecating_the_last_exemplar`.
- **Docs use the model as a worked example.** `docs/data.md`, `docs/generation-lifecycle.md`
  and `docs/model-library.md` all illustrated partial installs with "Wan 2.2 with only
  t2v". Mark the example historical rather than deleting the mechanism's docs.
