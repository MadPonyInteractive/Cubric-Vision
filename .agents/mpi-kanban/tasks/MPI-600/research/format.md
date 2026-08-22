# MPI-600 Leg 0 — format confirmed, and the fixed CLIP / VAE

Run 2026-08-22 on the standalone bench (`G:\ComfyUi`, port 8188, ComfyUI **0.31.0**),
RTX 4060 Ti **16380 MiB**. Runner: `research/run.py`.

## Verdict — INT8 ConvRot runs, natively, at 1024²

`flux-2-klein-9b-int8-convrot.safetensors` + `qwen_3_8b_int8_convrot.safetensors` load and
execute with **no custom node** — core ComfyUI 0.31.0 reads the format, exactly as the card
already concluded from the six int8_convrot weights in production. The question stays closed and
**fp8 is not needed**.

Both branches proved out:

| Run | wf_type | Seed | Res | Steps / CFG | Wall clock | `execution_cached` | Output |
|---|---|---|---|---|---|---|---|
| 1 | 1 (t2i) | 1 | 1024² | 4 / 1.0 | 28.8 s | 9 nodes (constants only) | `klein_9b/leg0/t2i_00001_.png` |
| 2 | 1 (t2i) | 2 | 1024² | 4 / 1.0 | **20.4 s** | **0 nodes** | `klein_9b/leg0/t2i_00002_.png` |
| 3 | 4 (kleinEdit) | 3 | 1024² | 4 / 1.0 | **20.2 s** | 35 nodes (loaders; sampler ran) | `klein_9b/leg0/edit_00001_.png` |

Run 3 edited run 2's output — "change the woman's shirt to a bright red shirt". It landed:
garment changed, identity, pose, background, and the long hard shadow all held, **no visible
edit rectangle**. Whole-image re-render, as expected for this branch.

Output resolution confirmed **1024×1024** on all three by reading the PNG header, not by trusting
the width/height inputs.

## Peak VRAM — 14.1 GB, not the ~9.5 GB the plan predicted

| Run | Floor (MiB) | Peak (MiB) | Attributable (MiB) |
|---|---|---|---|
| t2i 1024² | 1511 | 15692 | **14181** |
| edit 1024² | 1500 | 15574 | **14074** |

**~14.1 GB against a 16380 MiB card — roughly 690 MiB of headroom.** It fits and it is stable
across both branches, but the plan's "the encoder unloads before the transformer loads, so expect
~9.5 GB" is **wrong as measured**. The two ~9.4 GB residents cannot both be fully resident
(18.8 GB > 16.4 GB), so this is partial overlap, not full — but it is far closer to the ceiling
than the plan assumed.

For MPI-598: 9B INT8 is shippable to a 16 GB card, but the margin is thin enough that the floor
matters. The floor measured here (~1.5 GB) already includes Vision's own idle engine.

## The three traps that made the first VRAM read a lie

1. **`nvidia-smi --query-compute-apps` returns `[N/A]` for used memory on Windows/WDDM.** Per-
   process attribution is impossible on this card. Only device-wide totals are real.
2. **The bench retains its `cudaMallocAsync` pool between runs.** After a run `nvidia-smi` still
   showed 12309 MiB held; `POST /free {"unload_models":true,"free_memory":true}` dropped it to
   **1741 MiB**. A peak sampled without freeing first is polluted by the *previous* run's pool —
   the first attempt reported a 904 MiB delta, which is garbage. **Free the bench, sample the
   floor, then run.**
3. **The two engines disagree** — mid-state the bench reported 4.42 GB free while the app engine
   on 48188 reported 14.79 GB free, for the same physical card. Neither is a peak. Use sampled
   `nvidia-smi` device totals with a freshly measured floor.

`MpiClearVram` (node 570) is **not** a fourth trap: it offloads VRAM→RAM and leaves the weights
resident in RAM, so the next run reloads from RAM, not disk. Runs stay warm and every arm pays
the same constant transfer. Leave it in the chain.

## Fixed for every run of every leg — do not change these

| | |
|---|---|
| **CLIP** | `qwen_3_8b_int8_convrot.safetensors`, `CLIPLoader` type **`flux2`** (node 14) |
| **VAE** | `flux2-vae.safetensors` (node 15) |

The template's VAE ambiguity **settles itself**: `full_encoder_small_decoder.safetensors` is not
on disk anywhere under `G:\CubricModels\vae\`, and `flux2-vae.safetensors` is. There is no choice
to make, so there is no VAE confound to manage.

## Also confirmed, ahead of the later legs

- **`FluxKVCache` is already registered** on this bench (ComfyUI 0.31.0). Leg C needs no node
  install — README's owed item #2 is closed.
- **`klein_9B_Turbo_r128.safetensors` is visible** in `MpiLoraModel`'s dropdown, so node 99 can
  load it. Whether rank 128 *applies* to an INT8 ConvRot base is still unproven — that is Leg A's
  first run, not a Leg 0 result.
- **`MpiAnySwitch10` (node 318) is genuinely lazy** — `lazy: True` inputs plus a
  `check_lazy_status` that returns only the selected key. So `Input_wf_type` really does execute
  one branch: a t2i run never touches `Input_Image` (474, `block_if_empty: true`) or the 4B LoRAs
  on the control and fill branches.

## Exit condition

**Met.** INT8 confirmed at 1024² on this card, peak VRAM recorded, CLIP and VAE fixed and named.


---

# Leg 0 addendum — the localised edit is `wf_type` **5**, and it has a mask

Added 2026-08-22 after Fabio corrected the scenario-3 shape: the localised edit is *the same
workflow taking a mask* — a 1-bit mask selecting where the edit happens — and one good use of it
is placing a character into a base plate, which tests whether the model shifts the colouring of
everything around it.

## How the branch actually works

`Input_wf_type` **5** (nodes 319 / 639 both compare `== 5`). The chain is:

```
474 Input_Image ─┐
298 Input_Mask ──┴→ 276 InpaintCropImproved  (crop around the mask, context ×1.2, pad 32)
                    → 261 ImageCompositeMasked   source = 258 EmptyImage, colour 65280 = PURE GREEN
                    → 257 VAEEncode → 263 ReferenceLatent → sampler
                    → 274 VAEDecode → 277 InpaintStitchImproved  (paste back)
                    → 286/275 a SECOND crop+stitch pass
```

So the masked region is **green-filled**, reference-latented, regenerated from the prompt, and
stitched back. The character is described in the **prompt** — this branch chains no image
reference of its own (263 is its only `ReferenceLatent`, and it takes the green-filled crop).
`Input_Image_2` / `Input_Image_3` feed the *edit* branch's refs, not this one.

Blend settings that own the seam: `mask_expand_pixels 6`, `mask_blend_pixels 32`,
`context_from_mask_extend_factor 1.2`, plus `GrowMaskWithBlur` at `expand 32 / blur_radius 16`.

## THE TRAP THIS BRANCH CARRIES — and it was live

`research/README.md` said node **259** (`flux2-klein-4b-outpaint.safetensors`, **strength 1.1**)
"sits on the control and fill branches, which the bench does not run". **That is no longer true:
`wf_type` 5 reaches node 259 unconditionally.** A reachability walk from each branch's output:

| Branch | Nodes reached | `LoraLoaderModelOnly` reached |
|---|---|---|
| `wf_type` 1 (t2i, via 365) | 51 | none |
| `wf_type` 4 (kleinEdit, via 354) | 72 | none |
| `wf_type` 5 (inpaint, via 355) | 69 | **259 — a 4B outpaint LoRA on a 9B model** |

**Fixed** — edit #8 below. `254.model` and `278.model` rewired `259` → `100` (`Input_Lora_6`),
the same bypass pattern as edit #3. That keeps the whole `Input_Lora_1..6` chain intact, so the
turbo slot on node 99 still works on this branch. Re-verified after the rewire: **all three
branches reach zero `LoraLoaderModelOnly`, every `Input_Lora` slot is `None`, every style-LoRA
value is `None`.**

Node **143** (`flux2_klein_4b_refcontrol_depth`) feeds CFGGuider 125 and is **not** reached by
1, 4 or 5. It stays. Clear it before ever adding a control run.

## Run 4 — masked character placement, and it works

`wf_type` 5, seed 4, plate `t2i_00002_.png`, mask `plates/mask_standing_left.png` (an upright
ellipse on the road, 10.0% of frame), prompt *"a man in a blue denim jacket and jeans standing on
the dirt road"*. 31.1 s. Output `klein_9b/leg0/inpaint_00001_.png`.

A man in a denim jacket is placed on the road, **casting his own shadow in the scene's own light
direction**, at a plausible scale for his distance. No visible rectangle by eye.

## The colouring question, measured — `research/seam.py`

Eyeballing a seam is not scoring it, so this is now an instrument. `seam.py BASE RESULT MASK`
reports outside-mask delta, distance rings outward from the mask edge, and the inside-mask delta.
Run 4 against its own plate:

| Region | mean \|delta\| | max | >2/255 | mean signed |
|---|---|---|---|---|
| **outside mask, all** | 2.048 | 191 | 8.48% | **-0.021** |
| ring 0–8 px | 36.633 | 191 | 99.10% | -3.135 |
| ring 8–16 px | 30.247 | 175 | 98.16% | -1.658 |
| ring 16–32 px | 21.900 | 139 | 90.65% | +1.280 |
| ring 32–64 px | 5.617 | 147 | 39.98% | +0.140 |
| ring 64–128 px | 0.010 | 5 | 0.01% | -0.006 |
| **128+ px** | **0.000** | **0** | **0.00%** | **+0.000** |
| inside mask (the edit) | 67.656 | 247 | — | — |

**The model does not change the colouring of the image.** Past 128 px from the mask the result is
**byte-identical** to the plate — max delta 0 — and the global signed shift outside the edit is
-0.021/255, i.e. nothing. All the change is confined to a ≤64 px band, which is precisely the
`mask_blend_pixels 32` + `mask_expand_pixels 6` + `GrowMaskWithBlur expand 32/blur 16` feather.
That band is the design, not a defect.

**So the visible rectangle is a seam, not a cast.** The mechanism is visible in the ring signs:
the patch edge runs **-3.1/255 darker** than the plate at 0–8 px and flips to **+1.3 lighter** by
16–32 px. A small step, invisible here because a body fills the mask — but on a flat, evenly-lit
ground plane with a large mask, that same step is exactly the box that got screenshotted.

Consequence for the bench: **scenario 3 is scored from `seam.py` numbers, not from an opinion**,
and the axis to watch is the 0–32 px signed step, not the global mean. A candidate that keeps
`|signed|` small across rings 0–32 wins the axis.
