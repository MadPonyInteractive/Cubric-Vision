# MPI-610 validation

**Nothing has been implemented, so there is nothing validated.** The card is in `todo`
behind MPI-603 and MPI-608.

## The reverted attempt — 2026-08-23

A session built the WRONG design off the original brief (it said the flow moves off Krea 2
onto a Klein base-model selector) and re-authored the generation phase onto Klein: 29 nodes
deleted, including the ClownsharKSampler ladder, both `ToBasicPipe`s, `Input_is_Turbo`,
`Input_Negative`, `Input_Bypass_Filter_Lora`, the accelerator LoRA and the `qwen_image` VAE.

Fabio caught it at review. **Everything was reverted.** Kept here only so the revert is
provably complete and nobody wonders whether a fragment survived:

| file | state |
|---|---|
| `comfy_workflows/flow_character_sheet.json` | at HEAD — `git diff` empty |
| `comfy_workflows/raw/flow_character_sheet.json` | at HEAD — `git diff` empty |
| `tests/inject-params-titles.test.cjs` | at HEAD — `git diff` empty |
| `js/data/flowsRegistry.js` | **never touched** (peer held it) |
| `tests/flow-model-choice.test.cjs` | **never touched** (peer held it) |
| the peer message to MPI-608 | withdrawn, `status: resolved`, do-not-act-on-it header |
| the file claim | released |
| commits | **none** |

`node --test` on the two affected test files: 33/33 green after the revert.

## What the attempt DID establish, and is worth keeping

These were measured against the real graph and the live engine, and they still hold for
whoever implements the card properly:

- **The render slot needs no graph change.** Node **#55 is already titled
  `Input_Base_Model`** with its `krea2` / `krea2-nsfw` arms. The entire model-selector job
  is the blend slot — titling **#726 → `Input_Edit_Model`** and **#724 → `Input_Edit_Clip`**
  in the head-removal branch.
- **This graph is the last one in the repo on the pre-LanPaint recipe.** Verified by grep
  across every Klein graph: `klein_t2i`, `klein_9b_t2i` and `flow_scribble_object` all run
  `LanPaint_KSampler` and carry no outpaint LoRA; `flow_character_sheet` has no LanPaint
  node, carries outpaint LoRA **#708** and green plate **#716**. That is MPI-603's job and
  it blocks this card's 9B arm.
- **MPI-603's consumer table was stale** — `klein_t2i.json` node 259 no longer exists and
  its raw template is clean. Corrected on that card.
- **The graph uses KJNodes `SetNode`/`GetNode` named variables plus `MpiReroute`**, not
  plain reroutes. `Get_W` / `Get_H` / `Get_seed` / `Set_model` carry the resolution, seed
  and model chain across the canvas, so tracing a wire is not just following links. The
  converter (`workflow-to-api.mjs`) collapses all of them.
- **15 unconnected non-widget inputs are PRE-EXISTING** (`MpiAnySwitch.any_3..5`,
  `SAM3_Detect` bbox/coords, `MaskDetailerPipe` optional inputs, `MpiMath.b/c`). A
  validator run against this graph will report them; they are not damage.
- **The API file is generated.** Edit `raw/`, then
  `node scripts/workflow-to-api.mjs comfy_workflows/raw/flow_character_sheet.json`
  with the bench up on :8188. Never hand-edit the API file.

## What will close the card

Fabio picks a render model and a blend model in the Flow Library panel, runs it, and judges
real sheets — including one on the **9B blend arm**, which has never been run here.
