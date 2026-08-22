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


---

# Leg A preamble — the base weight had to be CONVERTED, and the LoRA question is answered

Run 2026-08-22, same bench, same card.

## USE `flux-2-klein-base-9b-int8-convrot-comfy.safetensors` — NOT the file the brief names

The downloaded base weight, `flux-2-klein-base-9b-int8-ConvRot.safetensors`
(`bertbobson/ComfyUI-INT8_ConvRot`), **cannot be loaded by native ComfyUI at all**. Node 27 dies
instantly:

```
ValueError: Unknown quantization format for layer double_blocks.0.img_attn.qkv
```

**This is not a bad download and not a 9B/INT8 problem** — the distilled weight loads fine. The
two files come from *different uploaders with different quantisation pipelines*, and only the
marker differs:

| | distilled / KV (`Winnougan`) | base (`bertbobson`) | 4B shipped (works) |
|---|---|---|---|
| key prefix | bare | `model.diffusion_model.` | `model.diffusion_model.` |
| `comfy_quant` payload | `{"format": "int8_tensorwise"}` | `{"convrot": true}` | `{"format":"int8_tensorwise","convrot":true,"convrot_groupsize":256}` |
| `weight_scale` | **scalar `[]`** | per-row `[4096,1]` | per-row `[3072,1]` |

`comfy/ops.py:1163` reads `layer_conf.get("format", None)` and raises when it is `None`
(`ops.py:1166`). Line 1194 shows `convrot` is a **modifier on** `int8_tensorwise`, never a format
in its own right — so the base file declared the modifier and omitted the format. The uploader's
own README says so outright: *"These models do not work with native ComfyUI INT8, and will need
to be converted"*.

**Fixed with the upstream tool**, `convert_to_comfy.py` from `BobJohnson24/ComfyUI-INT8-Fast`
(vendored as `research/convert_to_comfy.py`). It rewrites the 114 `comfy_quant` marker tensors
and copies every other tensor unchanged — verified: 429 tensors in and out, 114/114 markers now
`{"format":"int8_tensorwise","convrot":true}`, 0 wrong, weights still `I8 [4096,4096]` with
per-row `F32 [4096,1]` scales. Output is +2940 bytes, sitting beside the original in
`G:\CubricModels\diffusion_models\`. The original is kept and is still unloadable.

## THE FILENAMES LIE — distilled and KV are NOT ConvRot

Both `flux-2-klein-9b-int8-convrot.safetensors` and `flux-2-klein-9b-kv_int8_convrot.safetensors`
carry `{"format": "int8_tensorwise"}` with a **scalar** `weight_scale`. That is plain tensorwise
INT8. Only the base arm is genuinely ConvRot (per-row scales, like the shipped 4B).

**Leg B and Leg C must record this as a confound**: base-vs-distilled is not only
base-vs-distilled, it is also per-row-ConvRot-vs-tensorwise quantisation. Any quality gap has two
possible parents. For MPI-598 it also means "9B INT8 ConvRot" is not one thing.

## The open question is CLOSED: rank 128 applies to an INT8 ConvRot base

Two independent proofs, same seed / prompt / plate, base weight both times:

1. **The log counts the patches.** `Model Flux2 prepared for dynamic VRAM loading. 8970MB
   Staged. **N patches attached**` — `0` with node 99 at `None`, **`121`** with
   `klein_9B_Turbo_r128.safetensors` at strength 1.0. No `lora key not loaded` warning anywhere.
2. **The pixels differ** — different md5, and the LoRA render carries visibly crisper fabric and
   ground detail.

So **fp8 is not forced on Leg A and there is no asymmetry to record.** `patches attached` is the
instrument for this — read it off `/internal/logs/raw` on any run where LoRA application is in
doubt.

Peak VRAM on the base arm is **higher** than distilled: 15637–15662 MiB peak against a 16380 MiB
card (~14.7 GB attributable, ~720 MiB headroom), with or without the LoRA. Distilled measured
15692 peak / 14181 attributable in Leg 0 off a higher floor.

**Reading the log ASCII-safe matters:** `/internal/logs/raw` carries the tqdm bar, and printing it
through Windows `cp1252` dies with `UnicodeEncodeError: 'charmap' codec can't encode`. Encode with
`.encode('ascii','replace')` before printing.


---

# Leg A pass 1 — TWO SETTINGS TRAPS THAT INVALIDATE ROWS WHILE THE NUMBERS LOOK FINE

Both were found by **opening the PNGs**, after a full 36-run matrix had already been recorded with
plausible wall-clock, VRAM and seam numbers. Neither produced an error, a warning, or an outlier
in any column. Fabio's instruction stands: **look at the outputs as they land, not just the
numbers** — a bench that only reads its own table will bank a matrix of invalid runs.

## TRAP 1 — node 52 zeroes the NEGATIVE, so any arm at cfg > 1 blows out

`Input_is_Turbo` (node **52**) is not just a numbers switch. It drives `MpiIfElse` **57 / 212 /
222**, which swap the negative conditioning between `ConditioningZeroOut` (when `true`) and the
real `CLIPTextEncode` (when `false`).

Left at `true` — its bench default — an arm running **cfg 5.0 (base)**, **3.5 (turbo@0.35)** or
**1.5 (turbo@0.7)** amplifies against a *zero* negative. The result is not subtle: neon-green
grass, cyan sky, posterised edges, crushed blacks. It reads as "the model is bad at this" and it
is nothing of the sort.

**Rule: `--set 52.boolean=false` on every arm whose cfg > 1.** At cfg 1.0 it is irrelevant (no CFG
is applied), which is why the `turbo-100` arm alone survived pass 1.

Node 52 also feeds 417/418 (`MaskDetailerPipe`) and 437/439 (`UltimateSDUpscale`) — neither is
reachable from branches 1, 4 or 5, so the negative swap is its entire effect here. 203/204 read
`a` from it too but are literals now.

## TRAP 2 — the `wf_type` 5 branch IGNORES nodes 203/204 and always runs 2 steps / cfg 1

Per-branch sampler map, walked from each branch's output:

| branch | sampler | sigmas | guider | honours 203/204? |
|---|---|---|---|---|
| `wf_type` 1 (t2i) | 28 | 31 ← **203** | 32 ← **204** | yes |
| `wf_type` 4 (edit) | 185 | 173 ← **203** | 170 ← **204** | yes |
| `wf_type` 5 (localised) | **252** | **267, `steps: 2` HARDCODED** | **254, `cfg: 1` HARDCODED** | **NO** |

The tell is wall clock: base S1 at 20 steps took **82 s**, base S2 "at 20 steps" took **16 s** —
the same 16 s as an 8-step turbo arm. A steps knob that changes nothing to the clock is not
connected.

**Consequence — every Leg A S2 output is a failed edit, and it fails VISIBLY.** Branch 5 paints
the masked region **pure green** (`ImageCompositeMasked`, colour 65280) and regenerates it. At 2
steps an undistilled base cannot, so the fill survives into the saved PNG: `base` leaves a smeared
green ghost, `turbo-100` leaves a solid saturated green ellipse with no character generated.
Distilled did this correctly in Leg 0 — it is a 4-step model, so 2 steps is within reach.

So `seam.py` on those rows scores **the edge of a green blob**, not a seam. Compare nothing to the
Leg 0 baseline from them.

**To test an arm's own regime on this branch**, drive the hardcoded nodes directly — no graph
edit needed, `run.py --set` reaches any input:

```
--set 267.steps=<arm steps> --set 254.cfg=<arm cfg>
```

`sweep.py --s2-regime` does exactly this and writes the outputs as `S2R_*`. **It has not been run
yet** — it is the first thing Leg A pass 2 owes, because it decides whether base/turbo can do a
localised edit at all, or whether the hardcoded 2 steps is a shipping blocker for MPI-598.

## What pass 1 still bought

- `turbo-100` (cfg 1.0) is **valid** across all 9 runs and looks clean by eye on S1 and S3.
- Wall clock is linear in steps at 1024²: **8 steps 32 s, 10 steps 48 s, 20 steps 82 s**, plus
  ~8 s of constant load. cfg > 1 adds the uncond pass — `turbo-035` costs 40 s at the same 8 steps
  `turbo-100` runs in 32 s.
- VRAM is flat across every arm and both branches: **~14.3–15.0 GB attributable, 15.2–15.8 GB
  peak against 16380 MiB.** The turbo LoRA costs nothing measurable in VRAM.
- The bench is **exactly reproducible** — the same seed and graph reproduced a seam triple
  (`-18.905 / -3.409 / +1.304`) to three decimals across two separate invocations. Arm-to-arm
  differences are real signal, not sampling noise.


---

# Leg A pass 2 - THE SCENARIO ITSELF WAS WRONG, and both pass-1 "traps" partly dissolve with it

Corrected 2026-08-22 by Fabio, mid-sweep. Everything in the pass-1 section above that concerns
**S2** is void, and so is the S2R re-run this handoff was written to perform.

## S2 was benched on `wf_type` 5. It must be `wf_type` 4 WITH A MASK.

**The mask is what makes an edit localised.** Branch 4 with a mask supplied is the localised
edit; branch 4 with no mask is the whole-image edit. The graph says so plainly - `297
MpiAnyChecker` gates on node 298, and branch 4 feeds the mask to `581 InpaintCropImproved` and
`584 MpiMaskSquareBbox`. Confirmed by a reachability walk, not by eye.

`wf_type` 5 is the **inpaint** branch and must never be used to bench a 9B weight:

| | |
|---|---|
| what it does | green-fills the mask (`261 ImageCompositeMasked`, colour 65280) and regenerates it |
| what makes that work | node **259**, `flux2-klein-4b-outpaint.safetensors` at **strength 1.1** |
| why it cannot work here | that LoRA is **4B**. It cannot apply to a 9B base, and the bench bypassed it (README edit #8, `254.model`/`278.model` rewired 259 -> 100) |

So every wf5 run was **the branch with the component it is built around removed**. The green that
survived into those PNGs was the missing outpaint LoRA - not a weight verdict, not a seed effect,
not a step count. No cfg, seed or step setting was ever going to fix it. Measured before the
correction landed, across five weights x three seeds, the fill survived on 13 of 15 runs
including distilled; the two that cleared it did so by luck of the noise draw.

## And the scenario was the wrong TEST anyway

It inpainted a man from a text prompt. The ask is a **reference-driven placement**: take the man
from **image 2** (`236 Input_Image_2`) and place him into **image 1** (`474`, the plate carrying
the mask). S2 is now exactly that. See `scenarios.md` SS S2.

## What this does to the two pass-1 "traps"

| pass-1 claim | status now |
|---|---|
| **Trap 1** - node 52 zeroes the negative, so any arm at cfg > 1 blows out | **STANDS, and is confirmed.** Re-running base S1 seed 101 with `52.boolean=false` turned pass 1s cyan sky / neon grass / posterised frame into a clean, correct edit at the same seed. `sweep.py` now sets node 52 from the arms cfg, so it is no longer a default anyone can forget. |
| **Trap 2** - the wf5 branch hardcodes 2 steps / cfg 1 at nodes 267/254 | **TRUE OF BRANCH 5, AND IRRELEVANT.** Branch 4 samples through 185/173/170, which honour nodes 203/204. On the correct branch the steps and cfg knobs work normally. The `--s2-regime` flag written to drive 267/254 has been deleted from `sweep.py`. |

## A third fault, in the instrument rather than the graph

The `guard` column added this pass first tested green as `g>200 and r<80 and b<80`. A frame that
was plainly half green scored **0.00%** - a partly-denoised fill reads `(125,192,64)`, which
fails `r<80` while being green to any eye. It now tests **green dominance**
(`g - max(r,b) > 60`), which catches both. Worth stating because it is the same class of mistake
as the two traps: a number that looks fine and is measuring the wrong thing. The instrument needs
looking at as much as the output does.

## Fixed inputs added this pass

`plates/ref_man_00001_.png` - the S2 reference. Full-body man, blue denim jacket and jeans, plain
light-grey studio background, generated on this bench (distilled, seed 7001, 1024x1024, wf1).
A fixed input shared by every arm, so it carries no per-arm confound.

**The failure mode the corrected S2 surfaces** (distilled probe, seed 101): the man is placed with
his identity intact - same face, jacket, jeans, shoes - at plausible scale and casting his own
shadow, but the reference's plain grey background leaks into the plate as a **pale halo around his
head and shoulders**. That halo, not a rectangle, is the seam to score on this axis.

## The mask must be a BOX, not an oval

Fabio, 2026-08-22, mid-sweep. A rectangular mask **proves two things at once**:

1. that the model does not shift the colour, and
2. that it can place a character into another image properly,

because a hard straight edge shows a seam an oval hides. It also tends to produce better
localised edits. `mask_standing_box.png` replaces `mask_standing_left.png` over the same
footprint (x175-395, y300-905): 12.8% of frame against the ellipses 10.0%.

**It immediately paid.** Same weight, same seed, same reference - distilled, seed 101:

| mask | what the seam looked like |
|---|---|
| ellipse | a soft pale "halo" around the placed mans head - easy to read as a lighting artifact |
| **box** | a **hard rectangular patch** of the references grey studio background sitting above his head, with the horizon visibly stepping at the boxs left and right edges |

Same defect, same magnitude. The oval disguised it; the box named it. The `seam.py` 0-8 px figure
barely moved (+4.206 -> +6.880), which is the point: **the number did not surface this and the
picture did.**

It also corrects an under-call in this file: the placed subject does not merely pick up a halo,
**the scene behind it changes** - road, horizon and shadow all shift inside the masked region.
That is a preservation failure, scored on axis 2, and it is far easier to see against a straight
edge.

## Every S2 row from before the box is superseded

Three successive corrections landed on S2, so read the `output` filename to know what a row is:

| suffix | branch | mask | reference | valid? |
|---|---|---|---|---|
| none / `_p2` (`S2`, `S2R`) | wf5 inpaint | ellipse | none - prompt only | **VOID** - 4B outpaint LoRA bypassed |
| `_v2` | wf4 + mask | ellipse | image 2 | **superseded** - oval hides the seam |
| `_box` | wf4 + mask | **box** | image 2 | **current** |

S1 and S3 use no mask, so `_v2` rows on those two scenarios are unaffected and stand.
