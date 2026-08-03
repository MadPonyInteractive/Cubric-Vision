# FLUX.2 Klein 4B — depth refcontrol op

The `control` op (`Input_wf_type = 3`; Klein's only control type is depth). Mirrors `removal.md`: what was measured, what cost
time, and what must not be "tidied away" later.

Weight: `klein-lora-refcontrol-depth` (`flux2_klein_4b_refcontrol_depth.safetensors`,
92 MB), baked on the depth branch via `LoraLoaderModelOnly` → `CFGGuider`. It is what
makes the control op a depth op — without it the depth map is just an ordinary reference
image. Depth maps come from `DepthAnythingV2Preprocessor` on `depth_anything_v2_vits.pth`,
auto-downloaded by the `comfyui_controlnet_aux` node dep (no file dep of ours).

## TWO images, and the second one changes what the op means

Klein's depth branch shares the edit branch's `ReferenceLatent` chain — traceable in the
baked graph: the `any_3` output path runs back through `VAEDecode 117`, which is
downstream of `Input_Image_2`. So depth takes an optional second image:

- **image 1 = the depth** (pose and composition, nothing else crosses over)
- **image 2 = the subject** posed into it

With one image the subject comes from the prompt, as on every other model's depth. With
two, it comes from the picture, and the prompt should describe the setting instead.

The app gated depth to one image until 2026-07-28 and lost this entirely. Ungating it
did NOT touch Krea2/SDXL control, which share the one op def (`poseReference` then, `control` since MPI-365) and have no
such input: the slot declares `requiresCapability: 'depthSubject'` and
`filterMediaInputsForModel()` drops it for any model that does not declare the
capability. Klein alone does. The trap worth remembering is that op-FIT is a separate
read of the same list — `_maxMediaSlots()` had to learn the model gate too, or Krea2
depth would have gone selectable on two staged chips and injected an image its graph
never reads. See `validation.md` § 3b in the MPI-354 workspace for the test list.

The graph would carry a THIRD reference here as well; only two slots are exposed,
because two is what the op means.

**No ratio picker on depth or edit.** Both branches scale the input image to a megapixel
target and inherit its shape — `Input_Width`/`Input_Height` are never read there — so
Klein declares `imageSizedOps: ['control', 'kleinEdit']` and the picker is hidden
(`modelShowsRatio`). Do not "restore" it: a landscape choice on a portrait input produced
a portrait image, which is correct behaviour wearing a misleading control.

Depth maps use `depth_anything_v2_vits.pth` (small), swapped down from vitl on
2026-07-28. `comfyui_controlnet_aux` fetches it on first use — not a dep of ours.

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

## Depth Strength is a real control now (MPI-365, 2026-08-02)

The refcontrol LoRA's `strength_model` used to be a baked 1.0 widget. It is now driven by an
`MpiFloat` titled `Input_depth_strength` (node 644 → node 143), exposed as the **Depth Strength**
slider — the same control Krea2 uses, unlocked by `capabilities.depthStrength` on the ModelDef.
Nothing else was needed app-side; the control, default, gate and injection are model-agnostic.

**Klein's LoRA bites SOFTER than Krea2's: the usable band is ~0.2–0.3, where Krea2 wants 0.6–0.8.**
It is a loosening knob — at 1.0 the depth map pins the composition so hard the prompt cannot move
anything. At 0 the loader returns the model unpatched and the op stops being a depth op.

Same export also flipped the `mask` loader (296) to `block_if_empty: true`. Klein's `MpiIfElse`
576/592 pick the crop path off the mask checker, but the loader still handed a blank mask to all
SIX of its consumers (both `InpaintCropImproved`, `MaskDetailerPipe`, two `MpiMaskSquareBbox`,
`GrowMaskWithBlur`). Krea2 and Qwen do NOT need this — they block the IMAGE into the crop upstream
of the loader.

## Open

**The LoRA is base-authored** — CivitAI records version 2983782's baseModel as
*Flux.2 Klein 4B-base*, while we ship the **distilled** checkpoint. It demonstrably
works on distilled once the prompt carries the prefix, but that was never isolated
against a base run. If depth quality ever looks off, this mismatch is the first
suspect, not the graph.

Three other shipped weights are also base-authored: `klein-style-aesthetic`,
`klein-style-vintage`, `klein-style-chibi`. Same caveat, same first suspect.
