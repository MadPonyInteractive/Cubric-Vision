# Chroma — model research

Settled facts for the Chroma wiring (MPI-217 onboarding, MPI-365 one-template
migration). The model-agnostic *how* lives in `docs/playbooks/add-model/`.

## What it is

**Chroma1-HD, 8.9B params, Apache-2.0** — a pruned, de-distilled **FLUX.1-schnell**
derivative by lodestones. T5-XXL only: it has **no CLIP-L**, which matters for
ControlNet quality (below). It shares FLUX's 16-channel latent
(`comfy/supported_models.py` → `latent_format = comfy.latent_formats.Flux`) and
therefore the FLUX.1 VAE (`ae.safetensors`, dep `vae-flux-ae`).

Its value to Vision: high-detail photographic output, strong at hardcore NSFW.
Weak at hands.

## Two cards, two checkpoints

**Flash and Hyper are SEPARATE weights, not one weight plus an accelerator LoRA.**
This is the single most load-bearing fact about the wiring — it is why the tier is
a *file* axis rather than a runtime injection (see below), and it is what makes
Krea 2's turbo pattern inapplicable here.

| card | dep id | file | size |
|---|---|---|---|
| Chroma Flash (balanced) | `chroma1-hd-flash` | `Chroma1-HD-Flash.safetensors` | 17 GB |
| Chroma Hyper (low) | `chroma1-hd-hyper` | `Chroma1-HD-DanrisiMix-Hyper-Flash-Turbo-int8-convrot-simple.safetensors` | 9.2 GB |

Separately installable, NOT mutually exclusive; clustered by `modelFamily: 'Chroma'`.

**There is no High tier.** The full Chroma weight was tested and rejected in MPI-217
— bad LoRA adherence, very slow. Tier 1 is a reserved, never-shipped slot.

## Architecture — ONE master template, one runtime file per tier

Since MPI-365 all five ops live in one graph, selected by the injected
`Input_wf_type` (`opInject` in `models.js`):

    1 = t2i   2 = i2i   3 = depth   4 = ---   5 = ---   6 = detail   7 = upscale

4 and 5 are deliberately dead so the numbering matches Klein and Krea 2 — a shared
op must never mean a different branch depending on which model is selected.

**Why the tier is baked per file rather than injected.** ComfyUI validates every
combo widget at submit time *even on a lazily-skipped branch*
(`execution.py` → `value_not_in_list`). A graph holding both checkpoints' loaders
would therefore demand both the 17 GB and the 9.2 GB download from every user.
So `generate_chroma.py` emits one file per tier, baking the loader weight and
`Input_Tier`:

| output | tier | weight |
|---|---|---|
| `chroma_t2i.json` | 2 | Flash |
| `chroma_hyper_t2i.json` | 3 | Hyper |

Same trade `generate_boogu.py` makes. The generator asserts both `Input_wf_type`
and `Input_Tier` are plain widgets rather than links — a link makes the app's
injection a silent no-op and the graph runs whatever branch the upstream produced.

**The loader is RES4LYF's `ClownModelLoader`, NOT a stock `UNETLoader`** — model and
CLIP in one node, needed for the ReChroma patch path. It is **untitled** in the
graph, so the generator looks it up by `class_type` and asserts exactly one exists.
Its weight input is `model_name`.

## Depth — a real FLUX ControlNet

Chroma is the second model in the app to use a hosted ControlNet checkpoint (after
SDXL — see [../sdxl/depth-control.md](../sdxl/depth-control.md)).

**Why a FLUX ControlNet works on Chroma**, verified from code and weights rather
than from forum claims:

1. Chroma's forward pass applies control block residuals exactly as FLUX does —
   `comfy/ldm/chroma/model.py:221-226` (double) and `:257-262` (single).
2. Same latent format (`latent_formats.Flux`), and 19 double / 38 single blocks,
   which is what `ControlNetFlux` hardcodes.
3. `Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0`'s `x_embedder.weight` is
   `[3072, 64]` — exactly Chroma's hardcoded `in_channels`
   (`comfy/model_detection.py:294`).

Graph path: `Input_Image → DepthAnythingV2Preprocessor (depth_anything_v2_vits.pth,
shared with Klein) → ControlNetApplyAdvanced`. The depth map goes **only** to the
ControlNet's `image` input — never to the sampler as a latent, which would be
img2img on a greyscale picture.

**Do NOT add `SetUnionControlNetType`.** Union Pro 2.0 removed the mode embedding,
and `comfy/ldm/flux/controlnet.py:140` only reads `control_type` when that embedder
exists — so the node is a silent no-op that reads as though a mode were selected.

**Strength ceiling, measured:** past ~0.5 the image degrades. The graph normalises
the 0–1 `Input_depth_strength` slider to 0–0.5 through `MpiNormalizeValue` and runs
`end_percent` 0.570, so the ceiling is structural rather than a remembered number.
The model card's recommended 0.8 is a FLUX.1-dev figure and will fall apart here;
Chroma's missing CLIP-L (the ControlNet's pooled `y` vector is zero-filled) is why
quality degrades faster than on FLUX.

**LICENCE — do not mirror it.** `controlnet-union-flux` is the only non-permissive
weight in the app (flux-1-dev-non-commercial) and is linked from HuggingFace, never
R2. Full reasoning and consequences: `docs/playbooks/add-model/02-dependencies-r2.md`
§ "may we host it at all?".

`imageSizedOps` is **depth + detail + upscale**. Depth was wrongly excluded until
2026-08-02 on the belief that it read `Input_Width`/`Input_Height` through `MpiCrop`.
Traced in the graph, that is false: `MpiCrop` (2682) feeds the **i2i** latent
(`VAEEncode` 2616), while depth's latent is `VAEEncode` 2762 ←
`ImageScaleToTotalPixels(megapixels: 1)` ← `Input_Image`. Only t2i's
`EmptyLatentImage` reads the width/height pair, so **depth inherits the input
image's shape**, exactly like Klein's and Krea 2's.

That single wrong entry produced three symptoms that all read as separate bugs: the
ratio picker offered a shape the user would not get (8:5 picked → 1280×768
produced), the `ratio` control injected `Width`/`Height` nothing consumed, and the
gallery placeholder — sized `injectionParams.Width || 0` — reserved a cell of the
*requested* shape, padding the real image inside it. Hiding the picker fixes all
three at once, because an unmounted control contributes no injection.

## Style rack

Four LoRAs on ONE `MpiStyleLoras` bank, live on every op (`styleOps` full reach).
Index 0 is No Style. Both cards share the rack — it lives in the master template
both tiers are baked from, so neither card may carry a subset.

| idx | label | trigger |
|---|---|---|
| 1 | B&W Sketch | `black and white sketch` |
| 2 | Lenovo | `taken on a phone` |
| 3 | Brushwork | `Fine Tactile Brushwork` |
| 4 | Anime | `anime style` |

A fifth style (**Absolute CINEMA**) was wired and then dropped on a licence call —
its creator withheld `Image`, so a user could not sell what they generated with it
([licences.md](licences.md)). The rack was renumbered in the master template and
re-exported rather than left with a dead slot: a `lora_N` pointing at a file no user
downloads fails **every** Chroma prompt, because ComfyUI validates each combo widget
at submit time. Do not re-add it.

Default stylization 0.6. Model-strength only (`loraStrengths: ['model']`) — the
`MpiLoraModel` node has no clip input.

## What does NOT exist (checked 2026-08-02 — do not re-research)

- **No editing route of any kind.** No instruct-edit model, LoRA or workflow for any
  Chroma variant; no Kontext-style or reference-identity edit. Masked-denoise
  inpainting via the detailer is the only thing in the neighbourhood.
- **No Chroma-native ControlNet and no Chroma depth LoRA.** Klein's refcontrol LoRA
  and Krea 2's control-LoRA are both model-specific and neither ports — Krea 2's
  expands `img_in`, so it is dimension-locked.
- **No ControlNet for FLUX.1-schnell**, Chroma's Apache-2.0 base, so there is no
  permissively-licensed alternative to the FLUX.1-dev one.
- **Chroma Radiance is a different animal.** Pixel-space, 3-channel `in_channels`
  (`model_detection.py`), no VAE — every FLUX ControlNet fails on it at the input
  projection. None of this page's ControlNet reasoning transfers.

## Known gaps

- **No `progressStages.js` entries.** Bar counts have never been measured for Chroma
  (pre-existing, not a regression from the migration).
- **R2 upload outstanding.** The four style-LoRA URLs 404 until it lands, so Chroma
  is un-installable. This is the last gate; the licence gate closed 2026-08-02
  ([licences.md](licences.md)).
