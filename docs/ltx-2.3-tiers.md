# LTX-2.3 Video — Resolution Tiers & Timing Reference

Empirical tuning data for the LTX-2.3 video workflow. Drives `LTX_RATIOS` in
[`js/utils/ratios.js`](../js/utils/ratios.js). All measurements below are for a
**1-second video** on an **RTX 4060 Ti (16 GB)**, using the NerdyRodent
multi-stage authoring workflow. Times scale with clip length and GPU.

## The /64 size rule

LTX-2.3's VAE is 32× spatial, so raw LTX sizes need only be **divisible by 32**.
But the multi-stage pipeline **downscales ×0.5** (a `FloatConstant` of `0.5`
feeding `ImageScaleBy`) before the sampler, then **upscales ×2** (LTX
`spatial-upscaler-x2`). A dimension must therefore stay on the /32 latent grid
*after halving* → it must be **divisible by 64** at input.

Consequence: a valid /32 size like **736 silently collapses to 704** (736×0.5 =
368, not on the /32 grid → snaps). LTX never errors on bad sizes — it pads with
−1 and crops to the nearest valid value. So always use /64 sizes for this
pipeline. (If the multi-stage ×0.5 stage is ever dropped, the constraint relaxes
back to /32.)

**Frame count** is a separate rule: divisible by **8 + 1** (65, 97, 121, 161, …).

### Aspect-ratio exactness

Exact 9:16 only lands where the short edge is divisible by 576 (LCM of 9 and 64):
- `576×1024` (medium) and `1088×1920` (very_high) are **pixel-exact** 9:16.
- Other tiers drift ~2–4% (e.g. `704×1280` = 0.550 vs true 0.5625) and would
  need a crop before output for pixel-exact framing.

## Tiers — size, timing, behaviour

Tiers reuse the WAN quality-tier names (`very_low … very_high`). The shipped
range is **very_low → very_high**; 2K/4K were tested and dropped (see below).

| Tier | size (1:1) | 9:16 | 16:9 | ~time / sec | motion | audio |
|---|---|---|---|---|---|---|
| very_low | 384×384 | 384×640 | 640×384 | 58 s | less than expected (floors) | hallucinates |
| low | 448×448 | 448×768 | 768×448 | 61 s | **peak — full body** | hallucinates |
| medium | 640×640 | 576×1024 | 1024×576 | 68 s | arms, face, mouth, torso | ok-ish |
| high | 704×704 | 704×1280 | 1280×704 | 82 s | face, some hair, mouth | good |
| very_high | 1088×1088 | 1088×1920 | 1920×1088 | 124 s | mouth + cheeks | best |

Tested but **not shipped** (motion dies, no good upscaler yet):

| Tier | size | ~time / sec | notes |
|---|---|---|---|
| 2K | 1472×1472 | 226 s | lips only; finished locally via KJNodes offload (13.6/16 GB VRAM + 25 GB shared RAM) |
| 4K | 2176×2176 | ~350–450 s (est) | RunPod-only; motion expected to vanish |

Timing is **sub-linear** in pixel count — fixed overhead (model load, steps,
encode) dominates at low res, so 4K is far cheaper than a naive ×N scaling
suggests.

## Tiers are a motion dial, not just detail

Motion **peaks at low (~448)** and monotonically **decays** as resolution
climbs; audio coherence **improves** with resolution. With a fixed step/CFG
budget, low res leaves spare capacity for large motion (but loose audio), while
high res spends everything on spatial detail (clean audio, near-static subject).

**Product framing:** draft at low (iterate the prompt, lots of motion), finish
at high/very_high (crisp, locked-down, clean audio).

## Open items

- Motion-boost LoRAs — investigate (a detailer LoRA showed no visible i2v
  difference; may matter more for t2v).
- Better upscalers to bring 2K/4K up to scratch so those tiers can return.
