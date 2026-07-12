# Media inputs — placeholders & staging

> Part of [workflow-authoring](README.md). **Canonical home** for the media-input
> placeholder rule. Applies to any Cubric workflow — models AND apps — that has a
> `LoadImage` / `LoadAudio` / `LoadLatent` node. Agents miss this constantly; it lives
> here so both the [add-model playbook](../playbooks/add-model/README.md) and
> [apps](../apps.md) point at ONE source.

## The rule

**ANY workflow with a `LoadImage` / `LoadAudio` / `LoadLatent` node must have a real
default file staged in the engine `input/`**, or ComfyUI rejects the graph at prompt
time (`Invalid image file` / `Value not in list`) — even for a node whose output is
gated off (t2v never uses the frame, but the node still validates its filename).

Two halves — you need **both**:

1. **Bake a valid placeholder in the template.** Stamp every media-load node to a
   generic staged file:
   - image nodes (`Input_Start_Frame`, `Input_End_Frame`, an optional `Input_Image`) →
     **`placeholder.png`**
   - audio nodes → **`ltx_silence.wav`**
   - **Do NOT invent a per-model name** (`<model>_placeholder.png`) — that was the
     LTX-specific mistake this replaced. One generic file, shared.
   - The exported template carries whatever test file was open when it was saved — that
     name exists on no other machine and WILL reject. The generator handler re-stamps it.
2. **Stage the placeholder at submit time.** `routes/comfy.js` `WORKFLOW_INPUT_DEFAULTS`
   lists the repo-owned defaults; `_prepareWorkflowInputs` (`commandExecutor.js`) copies
   them into the engine `input/` before submit.

## Required vs optional — only OPTIONAL inputs need this

| the op's media input | what the injector does | placeholder needed? |
|---|---|---|
| **required** (`requiresImages ≥ 1`, `mediaInputs[].required: true`) — upscale, detail, i2i | overwrites the `LoadImage` widget before submit | **No.** The baked value is never read. `Chroma_detailer.json` bakes a scratch filename and has shipped for months. |
| **optional** — a `LoadImage` on a graph that can run with **no** image | injects **nothing**; ComfyUI validates the **baked** filename | **Yes.** Bake `placeholder.png` **and** stage it. |

The decision hinges on: **can this op run with no image supplied?** If yes (the node is
optional), you need the placeholder. If the op always overwrites the widget with a real
image (required), you don't.

Optional-input graphs shipped today: `LTX_t2v*` (`Input_Start_Frame`, `Input_End_Frame`),
`Wan5B_t2v` (`Input_Start_Frame`), Krea2 `t2i` (optional `Input_Image` — t2i/i2i/pose from
one graph). `Chroma_t2i` has no `LoadImage` at all → nothing to stage.

## The two traps that bite

- **The staging gate is too narrow by default.** `_prepareWorkflowInputs` historically
  gated on `commandIsMultiStage` (LTX/Wan `_ms` only), so single-stage `t2v`/`i2v` never
  staged → `Invalid image file`. It was widened to fire whenever the workflow carries ANY
  `Load*` node (MPI-242, for Krea2 — the first IMAGE model with an optional `LoadImage`).
  **If you add a workflow with a media node and it still `Invalid image file`s, check this
  gate** — the right rule is "stage whenever the graph has a Load* node," not per-op-type.

- **A hand-exported workflow has nothing to re-stamp the placeholder.** LTX/Wan never hit
  this because their generators re-stamp on every build
  (`generate_ltx.py`, `generate_wan5b.py::_stamp_placeholders`). Krea2 originally shipped
  its runtime JSON **by hand**, so its t2i baked a local scratch filename existing on no
  other machine. Fixed by giving it a handler (`generate_krea2.py` + a `krea2_` rule).
  **Even a workflow that needs no op-split wants a generator handler when it has an optional
  media input** — so the placeholder is re-stamped, not frozen from the last export. See
  [generator-patterns.md](generator-patterns.md).

## Guard

`tests/optional-media-placeholder.test.cjs` derives the optional-media set from the
registry (`workflows` × `requiresImages: 0`) and fails on any unstaged baked name. Run it
after adding or re-exporting any workflow with a media input.
