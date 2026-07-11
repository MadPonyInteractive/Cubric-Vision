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

## STEP 0 — MANDATORY, BEFORE ANY OTHER TOOL CALL

Read the **`docs/playbooks/add-model/`** playbook — the `README.md` hub in full,
then every section file (`01`–`06`). Not a grep of one section — the whole
playbook. Then state, in one line each:

1. The model's **shape** (README § 0): combined `dependencies[]` vs separate
   `commonDeps` + `operations{}`; single- vs multi-stage.
2. Whether a **new `model.type`** is introduced (⇒ `03-model-registry.md` consumer sweep).
3. Whether a **new op** is introduced (⇒ two registry mirrors, `04-ops-and-controls.md`).

If you cannot answer all three from the playbook + the workflow JSON, stop and ask.

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
section files it points at are the reference. Do not improvise an order.

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
