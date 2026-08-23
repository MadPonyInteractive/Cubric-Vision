# MPI-610 — plan

Read `brief.md` first. It was REWRITTEN 2026-08-23; the original was wrong.

**Nothing is implemented.** One session built the wrong design off the old brief and it was
reverted in full — both graphs and `tests/inject-params-titles.test.cjs` are at HEAD, suite
green, nothing committed.

## Depends on MPI-608

Per-phase LoRA racks are MPI-608's mechanism. This card consumes it; it cannot land first.
MPI-608 also holds `js/data/flowsRegistry.js`.

## Step 1 — MPI-603 lands first *(blocking, already decided, already carded)*

Node **#708** bakes `flux2-klein-4b-outpaint.safetensors` at strength 1.1 on the head-removal
chain, and there is **no 9B twin — none will ever exist**. So the blend slot's 9B arm cannot
be wired while it is there.

**Not a decision to make here.** Fabio settled it 2026-08-23: the outpaint LoRA was a
workaround for inpainting, and LanPaint replaced the workaround. There is no substitute
weight — this flow's head-removal branch is just the last graph in the repo still on the old
recipe. [MPI-603](../MPI-603/) owns re-authoring it onto LanPaint, which deletes #708, the
green plate #716 and its `ImageCompositeMasked` #713, and leaves both blend arms symmetric.

Run MPI-603 first, or run it together with this card — **they edit the same nodes in the same
branch**, so they cannot run as parallel sessions.

## Step 2 — graph, `raw/flow_character_sheet.json`

Small. The render slot needs nothing; it is already `Input_Base_Model` with its krea2 arms.

1. **#726 UNETLoader → title `Input_Edit_Model`**, **#724 CLIPLoader → title
   `Input_Edit_Clip`** (stays `qwen_3_4b.safetensors`, type `flux2`, as the 4B default).
2. **Rename `Input_Lora_1..6` → `Input_Lora_Phase1_1..6`** (#141 #140 #136 #137 #138 #139).
   Krea 2 chain, unchanged otherwise.
3. **Add six `MpiLoraModel` → `Input_Lora_Phase2_1..6`** on the Klein chain off #726,
   terminating into whatever #708/#699/#687 consume today.
4. Whatever step 1 decided about #708.
5. **Change NOTHING else.** The Krea 2 ladder, `Input_is_Turbo`, `Input_Negative`,
   `Input_Bypass_Filter_Lora`, the accelerator LoRA and the `qwen_image` VAE all stay.
6. Regenerate: `node scripts/workflow-to-api.mjs comfy_workflows/raw/flow_character_sheet.json`
   (bench on :8188), then `node scripts/validate-injection-rules.mjs`.

## Step 3 — descriptor, `js/data/flowsRegistry.js` *(MPI-608 holds this file)*

```js
requiredModels: [
    { label: 'Render model', models: ['krea2', 'krea2-nsfw'] },   // unchanged candidates
    { label: 'Blend model',  models: ['klein-4b', 'klein-9b'] },  // was a bare 'klein-4b'
],
modelParams: {
    'krea2':      { /* unchanged */ },
    'krea2-nsfw': { /* unchanged */ },
    'klein-4b': {
        'Input_Edit_Model': 'flux-2-klein-4b-int8-convrot.safetensors',
        'Input_Edit_Clip.clip_name': 'qwen_3_4b.safetensors',
    },
    'klein-9b': {
        'Input_Edit_Model': 'flux-2-klein-9b-int8-convrot.safetensors',
        'Input_Edit_Clip.clip_name': 'qwen_3_8b_int8_convrot.safetensors',
    },
},
```

`settingsModel` stays `'krea2'` — but with two racks it now names the PHASE 1 rack's owner,
and MPI-608 decides how a per-phase cogwheel resolves its model. The `loras` button in
`fields` becomes whatever MPI-608 lands.

## Step 4 — tests

- `tests/flow-model-choice.test.cjs` *(MPI-567/MPI-599 hold it)* — the Character Sheet
  assertions KEEP their krea2 arms and gain the two Klein ones. Copy the scribble-object
  assertion (~L405) for the blend slot: an injectable `UNETLoader` plus a `CLIPLoader` whose
  `clip_name` is a widget, not a link.
- `tests/inject-params-titles.test.cjs` — its title list keeps `input_negative` and
  `input_is_turbo` (both nodes stay) and gains `input_edit_model` + `input_edit_clip`.

## What closes the card

Fabio picks a render model and a blend model in the panel, runs it, and judges real sheets —
including at least one on the 9B blend arm, which nobody has ever run here.
