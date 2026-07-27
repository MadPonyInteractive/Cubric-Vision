# FLUX.2 Klein 4B — depth refcontrol op

The depth op (`Input_wf_type = 3`). Mirrors `removal.md`: what was measured, what cost
time, and what must not be "tidied away" later.

Weight: `klein-lora-refcontrol-depth` (`flux2_klein_4b_refcontrol_depth.safetensors`,
92 MB), baked on the depth branch via `LoraLoaderModelOnly` → `CFGGuider`. It is what
makes the depth op a depth op — without it the depth map is just an ordinary reference
image. Depth maps come from `DepthAnythingV2Preprocessor` on `depth_anything_v2_vits.pth`,
auto-downloaded by the `comfyui_controlnet_aux` node dep (no file dep of ours).

## The grayscale bug — root cause, do NOT re-derive

**Cost most of a day.** Depth refcontrol output came out flat grey and desaturated.

It is **not a graph bug.** A depth map is a **grayscale image**, and it is fed in as a
`ReferenceLatent`. At cfg 1.0 there is no classifier-free guidance to amplify the text,
so **a short prompt loses to the reference** and the output inherits the reference's
greyness. Confirmed by extreme prompt sensitivity — adding or removing a single space
flipped the result between good and bad.

**Fix shipped:** `StringConcatenate#133.string_a` is now `"refcontrol, color"`.

Two things about that prefix:

- It is a **BIAS, not a clamp**. `"a black and white photo of..."` still correctly
  yields black and white.
- `refcontrol` is also **the LoRA's own recorded training tag** — its metadata carries
  `ss_tag_frequency: {"1_refcontrol": {"refcontrol": 1}}` and
  `ss_output_name: flux2_klein_4b_refcontrol_v2_`. So the prefix is doing two jobs, and
  deleting it as redundant boilerplate would likely weaken the LoRA as well as
  re-greying the output.

**Accepted side effect** (A/B'd same-seed, user call): `klein-style-vintage` goes from
full sepia monochrome to muted colour under a depth reference. Composition is identical
— palette only. The user's position: you can always prompt for black and white.

## Style × depth is PARTLY MUTUALLY EXCLUSIVE

This decides which styles are worth offering beside a depth op.

| style kind | under depth control | why |
|---|---|---|
| palette / texture (Vintage, Aesthetic) | **works** | they only repaint; geometry is untouched |
| subject-transforming (Muppets, Chibi, Doodle, Jojo) | **cannot work** | depth clamps geometry to the source silhouette |

A subject-transforming style under depth gives you *"a human woman walking a Muppet
dog"* from `"a woman walking a dog"` — the LoRA repaints what it can and the silhouette
refuses to move. It only works if the transformation is carried in the **noun**:
`"a Muppet woman walking a Muppet dog"`. Relevant to `styleLoraLabels` shipping beside
a depth op.

## Open

**The LoRA is base-authored** — CivitAI records version 2983782's baseModel as
*Flux.2 Klein 4B-base*, while we ship the **distilled** checkpoint. It demonstrably
works on distilled once the prompt carries the prefix, but that was never isolated
against a base run. If depth quality ever looks off, this mismatch is the first
suspect, not the graph.

Three other shipped weights are also base-authored: `klein-style-aesthetic`,
`klein-style-vintage`, `klein-style-chibi`. Same caveat, same first suspect.
