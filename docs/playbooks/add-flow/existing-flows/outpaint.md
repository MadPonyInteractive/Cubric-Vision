# Outpaint (MPI-594)

One image in, the same picture back inside a bigger frame. Krea 2 fills whatever the user
added. The portable half — the gizmo — is [../ui/crop-gizmo.md](../ui/crop-gizmo.md); this
file is what is specific to THIS flow.

| | |
|---|---|
| id / op | `outpaint` / `flowOutpaint` |
| graph | `comfy_workflows/flow_outpaint.json` (raw: `raw/flow_outpaint.json`, Fabio's) |
| models | `krea2` (SFW only — see § NSFW below) |
| steps | 01 Inputs · 02 Frame (`kind: 'crop'`) · 03 Generate |
| controls | one `Input_is_Turbo` toggle, default ON |

## The shape of it

**The app pads the picture; the graph does not.** The crop step composes source + black bars
into a single PNG, places it in `Media/.preview-assets/`, and THAT file is what `Input_Image`
loads. So the graph carries no rect, no mask, no pad node and no fill input, and the version
Fabio proved in the browser runs in the app unchanged. The mechanism is the step kind's
(`STEP_MEDIA`), not this flow's — any flow declaring `kind: 'crop'` gets it.

**No prompt.** `Input_Positive` is baked: *"fill the back areas with the rest of the image"*.
That IS the instruction. A prompt box here would invite "add a dragon", which is a different
feature (an edit) and would need a different graph.

**No mask, deliberately.** Same reasoning the History crop tool records: prompting an edit
model to fill the flat area beats handing it a painted mask (`docs/crop.md`).

**No `result.compare`.** The output is a different SHAPE from the input, so a wipe between
them compares two framings rather than two versions of one picture. The honest before/after
is the black the step already showed.

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

## NSFW twin — one rename away, not built

Character Sheet runs any-of `[['krea2', 'krea2-nsfw']]` with `modelParams` swapping the
transformer file and the bypass-LoRA strength ([../any-of-models.md](../any-of-models.md)).
This graph cannot: its `UNETLoader` (node 55) is **untitled**, so there is no
`Input_Base_Model` to inject. Title that node in the raw graph, re-sync, and the flow can take
the same `requiredModels` array + `modelParams` pair with no other change. Until then a user
holding only Krea 2 NSFW sees "Get models".

## Still open

- **Preview art.** No `preview` / `video` declared — the tile still and hero clip land with
  `/mpi-flow-graphics` as `flow-outpaint.webp` / `.mp4`. Declared undefined rather than
  pointed at a file that 404s.
- **A real generation.** Everything up to dispatch is verified live
  ([../ui/crop-gizmo.md](../ui/crop-gizmo.md) § Verified); the end-to-end run on the user's GPU
  is not yet done.
