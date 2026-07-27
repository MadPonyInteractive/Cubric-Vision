# Klein 4B — object removal & the fal LoRA family

> **MEASURED 2026-07-26 — the object-remove LoRA is NOT our removal path.** It is
> object-specific: on a tattoo it lost to the **base model with no LoRA at all**. The
> green-plate **outpaint** LoRA does removal *and* inpaint well, needs no user prompt for
> removal, and survives crop/stitch. Read the red-box section below as a characterisation
> of a LoRA we tested and set aside, not as a recipe. What ships is the green plate.

Two fal LoRAs sit behind Klein's fill-shaped ops. They look interchangeable — same
136 tensors, rank 16, `diffusion_model.` prefix, byte-identical size (76,038,936) — but
they are **different weights with different input contracts**. Distinguish by sha256:
`b8a5142b…` outpaint, `dc197de6…` object-remove. Both Apache-2.0, both from
`huggingface.co/fal/flux-2-klein-4B-*-lora`, both must be the `*_comfy_converted`
file (the plain diffusers weight silently binds nothing in ComfyUI).

## The green plate belongs to the OUTPAINT LoRA

`fal/flux-2-klein-4B-outpaint-lora` — `instance_prompt: "Fill the green spaces
according to the image"`. Destroy the pixels (`EmptyImage` color `65280` +
`ImageCompositeMasked`), say that sentence, and it paints them back. Mandatory for
outpaint, and what `klein_removal_cropstitch` currently uses for *inpaint*.

So the shipped "removal" graph is really **inpaint via the outpaint LoRA**. That is a
working op, not a mistake — but it is not the removal LoRA's mechanism.

## The removal LoRA wants a HIGHLIGHT, not a hole

`fal/flux-2-klein-4B-object-remove-lora` — `instance_prompt: "Remove the highlighted
object from the scene"`.

**The object stays visible.** You draw a **red bounding-box outline** over it and hand
the model an otherwise untouched image. Every published example is a red rectangle; the
output erases the object *and the box*, rebuilding the surface underneath. No mask
channel, no green fill, no composite — a plain edit pass.

Red is the trained colour, not a stylistic choice: the sibling **zoom** LoRA's instance
prompt is literally `Zoom into the red highlighted area`. Same account, same pipeline.

- Strength **1.1** (fal's own SDK sample; same as the baked outpaint LoRA)
- Trained on 100 pairs / 4000 steps / lr 5e-5 — people, furniture, vehicles, animals,
  **text, signs, watermarks, logos**
- Prompt verbatim. It is an instance prompt, not a description.

### What that costs us

1. **Our mask UI emits a mask, not a box.** A graph using this LoRA has to derive the
   mask's bounding box and stroke it red onto the image. Whether tracing an
   arbitrary-shaped mask outline works as well as a rectangle is **untested** — the
   training set was boxes.
2. **With InpaintCrop/Stitch**, the box must be drawn *inside* the crop, and the stitch
   must tolerate the LoRA repainting the whole crop (erasing the box is part of the job).
3. Sibling LoRAs on the same account, same shape, unexplored: `zoom`, `spritesheet`,
   `background-remove`.

## Remove and inpaint are two ops, not one (measured 2026-07-26)

Both run the green plate + the outpaint LoRA. They differ in what the model needs to
see, and that decides the graph:

| | remove | inpaint |
|---|---|---|
| user prompt | **none** — the instance prompt alone is enough | required (what to add) |
| crop/stitch | **yes**, it helps | **no** — full image |
| what it needs | local texture continuation | global scale + colour + framing |

**The rule:** crop/stitch helps when the answer is *local* and hurts when it is *global*.
A crop spends resolution on the masked neighbourhood — perfect for continuing a surface,
wrong for inventing a subject. Measured failures on cropped inpaint: the added subject
gets **cut off** by the crop bounds (a cat's tail), and the region comes back the **wrong
tone**. Padding does not fix the framing — the subject's extent is not knowable at mask
time. `mask_blend_pixels` does not fix the tone — it blends a seam whose interior is
already wrong, because a crop is VAE-encoded and sampled with no anchor outside itself.
Full-image inpaint places the same subject correctly, tail and all.

**Untested idea if crop/stitch is ever wanted for inpaint:** sample the crop but pass the
FULL image as a chained `ReferenceLatent` (proven on this model — 2 refs 30 s, 3 refs
44 s). That restores the global colour and scale a crop removes while keeping crop
resolution. Cheap to try; nothing depends on it.

**UX consequence:** removal takes no prompt, so its op should not *show* a prompt field.
Paint → Remove, one click.

## Removal config — MEASURED 2026-07-26

**~4 s per removal.** Green plate + outpaint LoRA @ 1.1, **on TURBO** (turbo LoRA 1.0,
cfg 1.0, euler, **4 steps**), crop/stitch, crop at the image's native resolution rather
than a forced 1024².

**Turbo COMPOSES with the outpaint LoRA.** Predicted not to (the Krea2 style-vs-edit
conflict, and low cfg hurting instruction-following) — measured otherwise on this path.
Do not re-derive the caution; it was tested and it works.

**4 steps beats 6 and 8 — fewer steps is better, not just cheaper.** At 6-8 the model
hallucinates: removing a leg tattoo, it invented a knee and over-detailed the skin. More
steps = more denoising latitude inside the mask = more room to INVENT. A removal wants
boring continuation of the surrounding texture, so the t2i intuition (steps buy detail)
inverts here. Quality ceiling is accepted: it is not a finisher, it is a 4-second tool,
and the user can run a detail pass with a better model afterwards.

### Two traps this config creates

1. **Native resolution needs a CAP.** Following the image resolution is what buys the 4 s,
   but the crop is now data-dependent — a large mask on a 4K image yields a large crop, and
   the fastest op becomes the slowest, with an OOM risk on 8 GB cards. Bound it
   (`prersize_max_*` / the crop node's max), do not leave it open.
2. ~~**Removal must stay on turbo even at tier 1.**~~ **DISSOLVED 2026-07-27.** This trap
   existed because a model-wide tier toggle could have dragged removal to cfg 5 / 20 steps
   — slower AND more hallucinated, per the finding above. Klein now ships **one distilled
   checkpoint with no tier axis at all**, so there is no toggle to fight. Keep the removal
   branch baked at 4 steps; just don't reintroduce a tier control without re-reading this.

## Inpaint-to-ADD is bad — measured 2026-07-26

Adding content through the green plate works sometimes and fails badly otherwise: the
model **ignores the mask** and scatters the new content across the image. The existing
**detail** workflow beats it. So the remove/inpaint split above may collapse to
**remove only**, with detail covering the add case. Retest before wiring an inpaint op —
do not build it on the strength of the earlier note. Removal itself is unaffected and
remains the good half.

## Adjacent, deliberately NOT shipped

- **`MpiInpaintHeal`** — ring-sampled colour/grain correction, built 2026-07-26 and live
  in the bench via symlink. **Not part of this model, not released.** It helps on small
  evenly-lit patches and *hurts* on regions spanning a lighting gradient: it pulls the
  fill toward a ring average that is simply wrong when the region is lit unevenly.
  Artifact cleanup is an app-level second-pass concern.
- **ReplaceSubject LoRAs** (`KleinBase4B_ReplaceSubject`, 46 MB, sha `61af2784…`;
  `KleinBase9B_ReplaceSubject`, 83 MB, sha `0fd02736…`) — on the bench, **not wired**.
  User's call: too specific for a model op, so they are an **App** candidate. Trained
  with ai-toolkit 0.7.23, rank 16, BF16, keys already comfy-format
  (`diffusion_model.*.lora_A/B`, so `LoraLoaderModelOnly` loads them directly).
  **The trigger is a literal caption template** — the only caption in training (3000
  steps, 26 epochs): `replace <subject> in Image 1 with <subject> in Image 2`. That maps
  straight onto the existing two-`ReferenceLatent` wiring. **Licence unresolved** —
  resolve by SHA256 against the CivitAI API (see `licences.md`) before any use.
