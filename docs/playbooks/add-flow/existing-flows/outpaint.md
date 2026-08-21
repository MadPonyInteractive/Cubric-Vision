# Outpaint (MPI-594)

One image in, the same picture back inside a bigger frame. Krea 2 fills whatever the user
added. The portable half — the gizmo — is [../ui/crop-gizmo.md](../ui/crop-gizmo.md); this
file is what is specific to THIS flow.

| | |
|---|---|
| id / op | `outpaint` / `flowOutpaint` |
| graph | `comfy_workflows/flow_outpaint.json` (raw: `raw/flow_outpaint.json`, Fabio's) |
| models | any-of `[['krea2', 'krea2-nsfw']]` |
| steps | 01 Inputs · 02 Frame (`kind: 'crop'`) · 03 Generate |
| controls | one `Input_is_Turbo` toggle, default ON |

## The shape of it

**The app pads the picture; the graph does not.** The crop step composes source + black bars
into a single PNG, places it in `Media/.preview-assets/`, and THAT file is what `Input_Image`
loads. So the graph carries no rect, no mask, no pad node and no fill input, and the version
Fabio proved in the browser runs in the app unchanged. The mechanism is the step kind's
(`STEP_MEDIA`), not this flow's — any flow declaring `kind: 'crop'` gets it.

**No prompt.** The instruction is baked: *"fill the back areas with the rest of the image"*.
That IS the instruction. A prompt box here would invite "add a dragon", which is a different
feature (an edit) and would need a different graph.

**So the node holding it is NOT titled `Input_Positive`** — it is `Outpaint instruction
(baked)`. `_buildParams` emits `Input_Positive: positive || ''` on **every** run, so a flow
that declares no prompt sends an empty string and the injector cheerfully writes it over the
bake. Caught in the first live run (MPI-594): the dispatched graph showed
`112 MpiText | Input_Positive | {"string": ""}` — the instruction gone, and the fill happening
only because the Krea 2 edit branch is forgiving.

**Do not "fix" this by making the app skip an empty prompt.** Nearly every graph in
`comfy_workflows/` carries a leftover authoring prompt (`chroma_t2i`: *"Two women sitting on
chairs…"*, `klein_t2i`, `wan5b_i2v`, `qwen_edit`…), and the always-injected empty string is
exactly what stops those from running. Head Swap solved the same problem the same way: a
fixed-prompt flow does not title its prompt node. `inject-params-titles.test.cjs` pins the
ABSENCE of the title for this graph.

**No mask, deliberately.** Same reasoning the History crop tool records: prompting an edit
model to fill the flat area beats handing it a painted mask (`docs/crop.md`).

**No `result.compare`.** The output is a different SHAPE from the input, so a wipe between
them compares two framings rather than two versions of one picture. The honest before/after
is the black the step already showed.

## The output is ~1 MP, and that is the OOM guard

`ImageScaleToTotalPixels` normalises the padded image to ~1 MP before it is encoded, so a
768 × 1344 source with 160px added each side comes back **928 × 1136** — slightly smaller
than the original in height. **Deliberate** (Fabio, 2026-08-21): a user who drops a 4K plate
gets a result instead of an OOM. Do not remove it to "preserve resolution"; the answer for a
big source is an upscale pass afterwards, not an unbounded latent.

## Copy carries the one real limitation

Small extensions come back seamless; big ones leave the model inventing most of the picture
and it shows. **Fabio's instruction on the card**, and it is in both places a user reads before
running: the Library description and the step's own hint. The description also names the way
out — run it twice on the result rather than once on the original.

Do not soften this into "works best with…" and do not move it to a tooltip. It is the
difference between a flow that looks broken and one that looks careful.

## Turbo defaults ON

The graph bakes `true` and the flow keeps it. An outpaint fills flat colour next to real
pixels it can copy from — the case the accelerator LoRA costs least on. Off is for a keeper.
(Character Sheet defaults it OFF for the opposite reason: a keystone asset every later shot
inherits is the wrong place to trade fidelity for speed.)

## Either Krea 2 card runs it

Second user of the any-of mechanism ([../any-of-models.md](../any-of-models.md)), same pair
and same two differences as Character Sheet: the transformer file, and the bypass LoRA's
strength (`1` SFW, `0` NSFW — the NSFW twin graph bakes 0, and leaving it at 1 runs lustify
with the SFW bypass still applied).

Both members qualify on their own merits, not by analogy: each declares `krea2Edit` in
`supportedOps` and ships `krea2-lora-identity-edit`, which is the LoRA this graph loads. The
test asserts both, because a member that gates green and dies inside ComfyUI is the expensive
version of this mistake.

The NSFW arm has never been run *through this flow*, and does not need to be: Fabio has run
the lustify weight against this same edit shape and prompt style before. What was new here was
the pick reaching the graph, and that is verified.

**The `UNETLoader` was UNTITLED as authored.** Node 55 was titled `Input_Base_Model` in the raw
graph on 2026-08-21 (a one-line diff, then re-synced) with the user's go-ahead — the playbook's
"never hand-edit a workflow" rule is about drift from the ComfyUI canvas, and the raw file IS
what ComfyUI opens, so the two stay in step. Lose that title again and the picker changes the
badge while krea2 SFW keeps loading; `inject-params-titles.test.cjs` pins it.

## Still open

- **Preview art.** No `preview` / `video` declared — the tile still and hero clip land with
  `/mpi-flow-graphics` as `flow-outpaint.webp` / `.mp4`. Declared undefined rather than
  pointed at a file that 404s.
- **A real generation.** Everything up to dispatch is verified live
  ([../ui/crop-gizmo.md](../ui/crop-gizmo.md) § Verified); the end-to-end run on the user's GPU
  is not yet done.
