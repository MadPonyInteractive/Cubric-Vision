---
name: mpi-add-model
description: Wire a NEW model into Cubric Vision end-to-end — workflow template→runtime split, dependencies.js entries, R2 upload, models.js ModelDef, progressStages, type-consumer sweep, style-LoRA system. Use when the user says "add a new model", "let's add <model>", "wire up <model>", "/mpi-add-model", or when onboarding any new ComfyUI model/workflow into the app. This skill ENFORCES the docs/playbooks/add-model/ playbook — it does not replace it.
user-invocable: true
---
# /mpi-add-model — add a new model, end-to-end

> **This skill exists because agents skip the playbook.** A handoff or a
> model-scoped doc (`docs/models/<model>/`) tells you the *what* for one model.
> The `docs/playbooks/add-model/` playbook is the *how* for every model, and it
> carries traps that cost real debugging. Reading one is not reading the other.

## PHASE 0 — Research & scaffold (front-end)

Adding a model is **research-then-wire**. This is the front-end; STEP 0 → STEP 2 below
are the wiring half. **Skip PHASE 0 only when `docs/models/<model>/` already exists AND the
workflow is proven locally** — then jump straight to STEP 0. Otherwise work these here
first (research steps 1–5 often span several sessions; use a handoff to resume):

1. **Transformer survey — what weights exist.** THE FIRST RESEARCH TASK. Map the full
   landscape for the main diffusion transformer before picking anything. Answer each:
   - **Latest generation?** Confirm this is the current release, not a superseded one.
   - **Raw vs distilled.** Is there a full/raw model AND distilled (turbo / lightning /
     hyper / lcm) variants? Distilled variants set the low/balanced TIERS — enumerate them
     and their step counts.
   - **Quant formats.** fp16/bf16 (full), fp8 (`_scaled`/`e4m3fn`/mixed), **int8**, gguf.
     Which the app ships is a size↔quality↔VRAM tradeoff per tier. Note byte sizes.
   - **Full weights available?** For the High/no-accel tier you need the undistilled base.
   Write the variant×format matrix into the research folder — it IS the tier plan.
2. **LoRA survey — what LoRAs exist for this model.** Hunt the ecosystem (the model's HF
   org, lightx2v, Civitai, community repos) for LoRAs in three buckets:
   - **Accelerator / speed** (lightning / turbo / hyper / lcm) — the ones that set the
     distilled tiers, version-MATCHED to the base generation (a LoRA from an older gen on a
     newer base silently degrades — always check).
   - **Quality / adherence** — LoRAs that improve detail, realism, hands, or prompt
     adherence. Candidate optional boosts.
   - **De-censor** — LoRAs that lift content restrictions on a censored base.
   List each candidate with source URL + version match; the user decides which ship.
4. **Accelerator-LoRA strength axes.** For each distilled/accelerator LoRA: does it take
   **model strength only**, or **model AND clip strength**? This picks the loader —
   model-only → `MpiLoraModel`; model+clip → a model+clip LoRA loader. Getting it wrong
   half-applies the LoRA silently. Check the LoRA's model card / the upstream workflow.
5. **Samplers, schedulers, steps, CFG, extra nodes.** Per variant: which sampler +
   scheduler, step count, CFG, and any **model-specific nodes** (e.g. a reference-latents
   node, a ModelSampling shift, a CFGNorm). Source the upstream reference workflow, not a
   guess. **Skippable when already known** — e.g. an already-tuned graph tells you the
   sampler/scheduler/steps; note "known: <values>" and move on.
6. **Dep-reuse pass.** Grep `js/data/modelConstants/assetDeps.js` + `dependencies.js` for
   every weight — VAEs and text encoders are often already hosted (`vae-*` shared ids).
   Classify each slot: REUSE existing dep vs NEW upload. Flag any single file **≥20GB**
   (hot-store gate) now, not at upload time.
7. **Scaffold the card.** Create an MPI card (`doing` / `in-progress`) — read
   `<mpi-lib>/templates/task.json` for schema, `<mpi-lib>/task-board-ops/mutate.md` for the
   board+event mutation contract. Note what the model blocks (e.g. a dependent app card).
8. **Scaffold the research homes** (mirror `docs/models/krea2/`):
   - `.agents/mpi-kanban/tasks/MPI-<n>/research/` — raw research dumps.
   - `docs/models/<model>/README.md` — the settled hub (copy Krea2's shape: variant table,
     dep-reuse note, topics table, hard rules, sources) + one topic file per settled finding.
9. **Author + prove the graph locally**, then the user saves it to `comfy_workflows/raw/` —
   see playbook **§0a**. Only a proven, saved graph graduates to wiring.

Dump findings as you go. Wiring's STEP 1 reads the SAVED JSON as truth — research notes
are context, not a substitute.

## STEP 0 — MANDATORY, BEFORE ANY OTHER TOOL CALL (PHASE 1 — wiring)

Read the **`docs/playbooks/add-model/README.md`** hub in full — ONLY the hub, not the
section files yet. The hub carries the shape decision, the trap table, the hard rules,
the master checklist, and a routing table (§ → section file). Then state, in one line each:

1. The model's **shape** (README § 0): combined `dependencies[]` vs separate
   `commonDeps` + `operations{}`; single- vs multi-stage.
2. Whether a **new `model.type`** is introduced (⇒ `03-model-registry.md` consumer sweep).
3. Whether a **new op** is introduced (⇒ two registry mirrors, `04-ops-and-controls.md`).

If you cannot answer all three from the hub + the workflow JSON, stop and ask.

**Then read section files ON DEMAND — do NOT slurp all six up front.** The hub's routing
table tells you which section each checklist step lives in. Open a section when you reach
its step (authoring the graph → `01`; deps/R2 → `02`; etc.). Reading `05-prompt-and-styles`
for a model with no style rack is wasted context. Read what the model in front of you needs.

**Do not skip Step 0 because the user pasted a handoff.** The handoff assumes the
playbook. Every trap below was hit by an agent who had a detailed handoff and had
not read the playbook.

## STEP 1 — Read the workflow(s), do not trust prior notes

Model-scoped research docs go stale the moment the user re-authors a graph. The
JSON is the truth.

- Parse every `comfy_workflows/<Model>_*.json`. They are **API format**
  (id-keyed `{"101": {inputs, class_type, _meta}}`).
- Enumerate the injection surface: every node whose `_meta.title` starts with
  `Input_` / `Output_`.
- **Check `mode` before claiming a node is live**: `4` = bypass, `2` = mute.
- **The saved `.json` lags the ComfyUI canvas.** Ask the user to save first.
- Map every `class_type` to its owning node pack; classify each as already-a-dep
  or new.
- Collect every loader path (`UNETLoader`, `CLIPLoader`, `VAELoader`,
  `MpiLoraModel`, `UpscaleModelLoader`, `*ControlLoRALoader`).

Then reconcile with the user's own count. If your inventory disagrees with what
they said, say so and re-check — do not silently pick one.

## STEP 2 — Work the playbook checklist

Follow the playbook README § "Checklist (copy per model)" verbatim, in order. The
README's **§ → section-file routing table** is the canonical index — open a section
file the moment you reach a step that needs it, and only that section. Do not improvise
an order, and do not pre-read sections you haven't reached.

## The traps that actually bite (all are IN the playbook — this is a pre-flight)

| trap | where |
|---|---|
| Capture title is `Output_Image` (image) / `Output_Video` (video) / `Output_Preview` (multi-stage preview). Single naming law (MPI-252); no bare `Output`. Never "normalize" one to another | 04 |
| **Optional** media input (a `Load*` on a graph that can run without it) needs `placeholder.png` baked **and** staged. **Required** inputs need neither — the injector overwrites the widget | 01 |
| `_prepareWorkflowInputs` gates on `mediaType === 'video'` — an image model with an optional `LoadImage` never stages. Widen the gate | 01 |
| **Baked LoRAs are normal deps** (`size`, **no `type`**, `loras/<family>/` subfolder). Not user slots. LTX ships 3, Wan-5B 1 | 02 |
| `isWeightDep()` counts every LoRA dep toward `totalWeightsGb()` — over-counts mutually-exclusive style LoRAs. **Measure before special-casing** | 02 |
| VRAM/RAM table is **computed**, never authored. Get the dep `size` strings right and it is correct. `sizeTier` is only a badge | 03 |
| Loader path == dep `filename` == on-disk path. Subfoldered LoRAs list with **backslashes** | 01 |
| R2: `--s3-no-check-bucket` (else 403) + `--bwlimit 3M`. Verify with `lsf` + HTTP HEAD — a wrapping `echo` masks rclone's exit code | 02 |
| Any single weight file **≥ 20 GB** ⇒ 🛑 **STOP and ask the user** (Pod hot-store + container-disk budget) | 02 |
| `progressStages.js` bar counts **must be counted live** per run mode. Never guess | 02 |
| Injection **silently skips** a param whose `Input_*` title matches no node (hid `Input_Is_i2i` + `Input_Batch` for 4 sessions) | 04 |
| Style-LoRA set ⇒ assert `len(MpiPromptList.options) == number of style LoRAs`. A missing trigger line is a silent half-application | 05 |
| Models are **NOT** version-bumped | README |

## Hard rules

- **Never hand-edit a workflow JSON.** Titles/values change in ComfyUI, then re-export.
  A manual edit is silently lost on the next export and the bug returns.
- **R2 uploads need explicit user approval** before you run them. R2 *deletes* likewise.
- **Ask the user to save the ComfyUI canvas** before you read any workflow they just edited.
- If the user tells you something the playbook already covers, that is a **playbook
  failure or a reading failure** — figure out which, and fix the playbook if it is the
  former. Do not let the knowledge live only in the conversation.

## Definition of Done

`docs/playbooks/add-model/06-verify.md` (§7), plus:

- [ ] Every checklist box ticked, or explicitly waived with a reason
- [ ] `sha256: null` remains nowhere
- [ ] Parse cross-ref passes (§7.1)
- [ ] One generation per op, in the real app
- [ ] Anything learned that the playbook lacked → **written back into the playbook**
