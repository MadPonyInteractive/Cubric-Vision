# Character Sheet — two model slots, two LoRA racks

> **2026-08-23 — THIS BRIEF WAS REWRITTEN. The first version was WRONG and a session
> built the wrong thing off it (reverted, nothing shipped).** It said the flow moves OFF
> Krea 2 onto a Klein 4B/9B *base model* selector. It does not. **No Krea 2 machinery is
> removed.** The 4B/9B choice belongs to the INPAINT phase — the one already on Klein.
> Fabio, correcting it: *"The character sheet adopts a similar system to the new Scribble
> to Object Flow. The user can select different models for the first phase, which is the
> generation phase, and the second phase, which is the inpainting phase. No KREA model
> kits removed… And both phases get their six loras."*

## The target

Exactly the shape `scribble-object` already ships in its Flow-Library detail panel — two
labelled dropdowns, one per phase:

```
RENDER MODEL   [ Krea 2                 v ]     <- phase 1, the sheet generation
BLEND  MODEL   [ FLUX.2 Klein 4B        v ]     <- phase 2, the head removal
```

| slot | phase | candidates | graph node(s) today |
|---|---|---|---|
| **Render** | sheet generation | `krea2`, `krea2-nsfw` | `Input_Base_Model` UNETLoader **#55** — already titled, already a slot |
| **Blend** | head removal (inpaint) | `klein-4b`, `klein-9b` | UNETLoader **#726** + CLIPLoader **#724**, both currently HARDCODED to 4B |

So the render slot needs **no graph change at all** — it is already `Input_Base_Model` with
its `krea2` / `krea2-nsfw` arms and `Input_Bypass_Filter_Lora`. The whole model-selector
job is the **blend** slot: title #726 `Input_Edit_Model` and #724 `Input_Edit_Clip`, matching
`flow_scribble_object.json`.

## KEEP — all of it

The Krea 2 generation phase stays intact: the ClownsharKSampler two-tier ladder (#72 #162
#311 #436), both `ToBasicPipe`s, `Input_is_Turbo`, `Input_Negative`,
`Input_Bypass_Filter_Lora`, the accelerator LoRA, the `qwen_image` VAE. None of it is
touched. A session that deletes any of these has misread the card again.

## Two LoRA racks, one per phase

- **Phase 1 (Krea 2):** the existing six, `Input_Lora_1..6` (#141 #140 #136 #137 #138 #139)
  → rename to `Input_Lora_Phase1_1..6`.
- **Phase 2 (Klein):** SIX NEW `MpiLoraModel` nodes → `Input_Lora_Phase2_1..6`, on the Klein
  chain off #726.

Same mechanism `scribble-object` got — this rides on **[MPI-608](../MPI-608/)** and cannot
land before it.

## Gates

- **The blend slot's 9B arm is blocked on [MPI-603](../MPI-603/), which already owns the
  fix.** Node **#708** bakes `flux2-klein-4b-outpaint.safetensors` at 1.1, and there is **no
  9B twin — none will ever exist**, so the 9B arm cannot be wired while that node is in the
  graph. This is NOT an open question: Fabio settled it 2026-08-23 — *"the outpaint LoRA was
  a workaround to do inpainting. Now that we have the LanPaint sampler, we no longer use the
  outpaint LoRA and its workaround."* There is no replacement weight to find. This flow's
  head-removal branch is simply the **last graph in the repo still on the pre-LanPaint
  recipe** (verified 2026-08-23: `klein_t2i`, `klein_9b_t2i` and `flow_scribble_object` all
  run LanPaint and carry no outpaint LoRA; this one carries #708 and the green plate #716
  and has no LanPaint node at all). MPI-603 re-authors it onto LanPaint, which deletes #708,
  #716 and #713 and makes both arms symmetric. **Run MPI-603 first, or run the two together
  — they touch the same nodes in the same branch.**
- **The CLIP swaps WITH the size and the mismatch is not a clean error.** 9B needs
  `qwen_3_8b_int8_convrot`, 4B needs `qwen_3_4b`; getting it wrong dies with a shape error
  that reads as a LanPaint bug (MPI-600, learned on MPI-567).
- **`Input_Edit_Clip.clip_name` must be the DOTTED key.** `clip_name` is not on
  `comfyController._inject`'s spray list the way `ckpt_name`/`unet_name` are, so a plain key
  matches the node and silently writes nothing.
- **`tests/flow-model-choice.test.cjs`** pins that every `modelParams` key names a title
  that EXISTS in the flow's graph. Its Character Sheet assertions (~L244, ~L324) stay on the
  krea2 arms and GAIN the two Klein ones; the scribble-object assertion in the same file
  (~L405) is the shape to copy for the blend slot.
- Editing `raw/` is LiteGraph LINK SURGERY. A link is
  `[id, from_node, from_slot, to_node, to_slot, type]`, and both `last_node_id` and
  `last_link_id` advance. This graph also threads KJNodes **SetNode/GetNode** named
  variables and `MpiReroute`, so tracing a wire is not just following links. Verify
  afterwards that both formats agree, link ids are unique and every link resolves.
- The API file is **generated** — edit `raw/`, then `node scripts/workflow-to-api.mjs`
  (needs the bench on :8188). Never hand-edit `comfy_workflows/flow_character_sheet.json`.
- **Fabio's eye on real sheets closes this**, not a green suite.

## Coordination

`js/data/flowsRegistry.js` is held live by **MPI-608** (which this depends on) and listed by
MPI-567/MPI-599/MPI-573. `tests/flow-model-choice.test.cjs` is held by MPI-567/MPI-599.
The two graph files are free.

## History

A session took the graph half on the ORIGINAL wrong brief and re-authored the generation
phase onto Klein — 29 nodes deleted including the whole Krea 2 ladder. Caught by Fabio at
review, fully reverted (both graphs and `tests/inject-params-titles.test.cjs` back at HEAD,
suite green, nothing committed, the peer message withdrawn). Recorded here so nobody
re-derives that reading from the old text.
