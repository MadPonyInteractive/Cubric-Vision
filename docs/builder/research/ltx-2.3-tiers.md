# LTX-2.3 Video — Resolution Tiers & Timing Reference

> Authoring/tuning research for the LTX-2.3 workflow. The app consumes only the
> *result* (`LTX_RATIOS` in `js/utils/ratios.js`); the *why* lives here.

Empirical tuning data for the LTX-2.3 video workflow. Drives `LTX_RATIOS` in
[`js/utils/ratios.js`](../../../js/utils/ratios.js). All measurements below are for a
**1-second video** on an **RTX 4060 Ti (16 GB)**, using the NerdyRodent
multi-stage authoring workflow. Times scale with clip length and GPU.

## The size rule — /32 is the law; /64 buys pixel-exact stages

**LTX-2.3 requires only /32** (the VAE is 32× spatial). This is the same rule the
template's `ImageResizeKJv2` nodes (#87, #92) already enforce: `divisible_by: 32`.
The earlier "must be /64 or it silently collapses" note here was **wrong** — it
described a `FloatConstant 0.5 → ImageScaleBy` downscale that is **not in the
template**. The real stage-1 downscale is `MpiMath floor(a/2)` (nodes #155, #156)
feeding `EmptyLTXVLatentVideo` (#143). `floor()` does not snap.

What actually happens on a /32-but-not-/64 size:
- Input W,H → image path resized to /32 (fine); latent path = `floor(W/2), floor(H/2)`.
- If the halved value is off the /32 grid (e.g. 544 → 272, not /32), LTX **pads the
  stage-1 latent up to the nearest /32** (272 → 288). Stage-2 ×2 then returns ~576,
  not 544 → **a few-% drift on that axis, not a collapse.** LTX never errors; it
  pads with −1 and crops.

So the rule is:
- **/32 = valid** — runs, small output drift on non-/64 sizes. Good enough for the
  mid tiers, and it lets us use Lightricks' canonical sizes verbatim (960×544 etc.).
- **/64 = pixel-exact** — halves cleanly → stage-2 returns the exact input. The
  2K/4K tiers are pinned /64 so large-tile output is exact.

(If the multi-stage `floor(/2)` stage is ever dropped — the single-stage distilled
path — the constraint is /32 with no halving. See
[ltx-workflow-authoring.md](ltx-workflow-authoring.md).)

**Frame count** is a separate rule: divisible by **8 + 1** (65, 97, 121, 161, …).

### Aspect-ratio exactness

Our shipped 16:9/9:16 tiers are **snapped to Lightricks-blessed resolutions**, so
they cluster near their true ratios (16:9 ≈ 1.71–1.77, 9:16 ≈ 0.567–0.583) rather
than the old over-wide values (some were 1.82–2.0). Pixel-exact 9:16/16:9 is not a
goal — the model was trained on these approximate buckets. If a surface ever needs
frame-exact framing, crop at output.

## Tiers — size, timing, behaviour

Tiers reuse the WAN quality-tier names (`very_low … very_high`, plus `2k`/`4k`).
16:9/9:16 sizes are **snapped to Lightricks-blessed resolutions** (see the size
rule above); 1:1 = the short edge of each tier's pair. Values below are the
shipped [`LTX_RATIOS`](../../../js/utils/ratios.js).

| Tier | 16:9 | 9:16 | 1:1 | basis | motion / audio (from earlier tuning) |
|---|---|---|---|---|---|
| very_low | 640×352 | 352×640 | 384×384 | motion-draft (off-menu, deliberate) | max motion, audio hallucinates |
| low | 768×448 | 448×768 | 448×448 | official training res (detailed/short) | strong motion, audio loose |
| medium | 960×544 | 544×960 | 544×544 | **THE canonical** (every official ComfyUI JSON + training bucket) | balanced |
| high | 1216×704 | 704×1216 | 704×704 | `inference.py` default (30 fps); 9:16 = IC-LoRA "best portrait" | good audio, less motion |
| very_high | 1920×1088 | 1088×1920 | 1088×1088 | official 1080p production out | best audio, near-static |
| 2K | 2560×1472 | 1472×2560 | 1472×1472 | Lightricks 1440p (2560×1440) snapped to /64 | detail tier |
| 4K | 3840×2176 | 2176×3840 | 2176×2176 | Lightricks 4K-UHD (3840×2160) snapped to /64 | detail tier |

**2K/4K are shipped, not dropped.** The earlier "motion dies, drop them" verdict
was a **wrong assumption** — the motion loss seen at high res was an image-to-video
artifact (hard anatomical poses the model can't hold), not a resolution ceiling.
2K/4K are native detail tiers, NOT an upscale pass. Timing is **sub-linear** in
pixel count — fixed overhead (model load, steps, encode) dominates at low res, so
4K is far cheaper than a naive ×N scaling suggests.

Lightricks' published 2K/4K (`hdr_ic_lora.py` VRAM table + `docs.ltx.video/models`):
1440p=`2560×1440`, 4K-UHD=`3840×2160`, plus **17:9 cinema** 2K=`2048×1080` and
4K=`4096×2160`. Their heights (1080/2160) are NOT /32 — their cloud API pads
internally; we can't, so we snap the height up to the nearest /64 (1440→1472,
2160→2176). **17:9 cinema is not in our ratio set** (we ship 16:9/9:16/1:1). If ever
added, the /64-snapped cinema sizes are 2K `2048×1088` and 4K `4096×2176`.

## Tiers are a motion dial, not just detail

Motion **peaks at low (~448)** and monotonically **decays** as resolution
climbs; audio coherence **improves** with resolution. With a fixed step/CFG
budget, low res leaves spare capacity for large motion (but loose audio), while
high res spends everything on spatial detail (clean audio, near-static subject).

**Product framing:** draft at low (iterate the prompt, lots of motion), finish
at high/very_high (crisp, locked-down, clean audio).

## Stage-1 = motion, stage-2 = spatial upscaler

Stage-1 decides motion; stage-2 is a low-denoise latent upscaler (hi-res-fix equivalent)
that re-denoises for spatial detail only — it does NOT re-plan motion. Consequences:
- **All LoRAs go stage-1 ONLY** (bypass stage-2). A stage-1 LoRA's effect is carried into
  stage-2 through the latent; duplicating into stage-2 = redundant cost. Live A/B
  (Soft LoRA stage-1+2 vs stage-1-only): difference marginal.
- Garment morph at stage-2 is an upscale/detail re-interpretation artifact — fix via
  prompt word or stage-2 denoise strength, NOT LoRA juggling.
- Step counts: terminal shows N−1 denoise steps for N scheduled (first sigma = start
  latent, not a bug).

## ControlNet Union 2.3 — soft control only

ControlNet Union 2.3 with LTX-2.3 = **SOFT control**. `strength_model` is a dead knob
— tighten via AddGuide params instead. TIER is the big lever: low (448px) starves
pose-lock; medium (640px) gives good dance adherence. See also workflow-deconstruction
notes in [ltx-workflow-authoring.md](ltx-workflow-authoring.md).

## NAG (negative prompts at CFG=1)

The distilled model runs at CFG=1 → **negative prompts are ignored by default.** KJNodes
`LTX2 NAG` node is required to make negatives fire. Full wiring + dependency-cycle trap:
[research/black-bars-and-nag.md](black-bars-and-nag.md). NAG does NOT fix t2v black bars.

## Open items

- Motion-boost LoRAs — investigate (a detailer LoRA showed no visible i2v
  difference; may matter more for t2v).
- Better upscalers to bring 2K/4K up to scratch so those tiers can return.
