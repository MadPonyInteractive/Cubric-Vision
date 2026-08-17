# SeedVR2 — measured verdict, and why it is not the full-frame upscaler

**Status: REJECTED as a general upscaler (MPI-506, 2026-08-16). Still a live candidate for the
face detailer (MPI-557).** Both halves are true and the product decision needs both. Measured on
the bench; do not re-derive.

Repo provenance: the pack is `numz/ComfyUI-SeedVR2_VideoUpscaler` (`fork: false`, 2.7k stars,
953k registry downloads, active). The 0-star `comfyorg` copy is a FORK and was correctly rejected —
checking the fork and writing off the parent it had never queried is what put a false negative in a
brief for four days.

## The verdict: an exceptional sharpener, not a reconstructor

Radial power spectrum of each clip against a **fixed lanczos baseline** at the same output size,
binned by |f|, `gain(f) = E(clip,f)/E(lanczos,f)`. A sharpener boosts the MID band (amplifying edges
that already exist) and falls back toward 1.0 at the top of the band, because there is nothing up
there to amplify; a reconstructor holds gain HIGH at the top, because it is synthesising structure
the source never had. The number to report is `top/mid`.

| Upscale factor | mid gain | top gain | **top/mid** |
|---|---|---|---|
| 1.5× | 6.18 | 3.50 | **0.57** |
| 2× | 5.96 | 2.53 | **0.43** |
| 3× | 8.04 | 1.96 | **0.24** |

Mid gain RISING while top gain COLLAPSES, at every step. The stated prediction going in — "1.5×
gives it no room; a higher factor will force reconstruction and push top/mid up" — failed in the
opposite direction, which killed the "wrong operating point" defence far more convincingly than any
single number.

**Control (not optional):** h264 could plausibly be eating the top band and faking the whole
signature. Re-encoding the lanczos baseline through identical settings and measuring it against
itself gave **1.06** — the codec is neutral, so the readings are the model's.

**Do not overshoot into "no better than a `.pth`".** Same method, same clip: SIAX scored mid 1.23 /
top 1.10 — a near no-op, visually indistinguishable from lanczos — against SeedVR2's 6.18 / 3.50,
which visibly added freckles, knit stitches and wood grain. SeedVR2 is an order of magnitude beyond
a `.pth` sharpener **and** not a reconstructor.

**The architectural tell that explains the number:** SeedVR2 runs ONE sampling step at cfg 1.0 with
no text conditioning — no prompt, no CLIP, no text encoder anywhere in the weight set. It has a
prior over local texture statistics and NO object model, which is why it produces convincing pores
while deforming an iris into a square. Check for a conditioning path before promising any model
semantic behaviour; no widget compensates for its absence.

**Scale changes the verdict, not the number.** The model rejected at full frame stayed a live
candidate for the MPI-557 face detailer: a 128×128 crop is ~100× fewer pixels, so the VRAM ceiling
and the ~10-min-per-second runtime — the two decisive objections — largely evaporate there.

Speed context: NVIDIA benchmarks PiD up to **5.9× faster** than SeedVR2 → [../pid/upscaler.md](../pid/upscaler.md).

## The shimmer is the SOURCE's, amplified — there is no sampler-side fix

The wavy shimmer visible on every SeedVR2 face crop was root-caused with two probes (MPI-557).

**Frozen input bounds the model's own instability.** One frame repeated N times, losslessly
(`ffmpeg -qp 0`, and assert the DECODED clip's worst frame-to-frame delta is 0 — a lossy re-encode
invents variation and silently becomes the thing you are measuring). SeedVR2 did vary: fine-band
temporal sd **0.29**, max swing 8.4 on 0-255 — **but below visibility**. Fabio's own read was *"her
face doesn't have anything moving; the grey stuff has stuff moving"*, i.e. only in a ×16-gain drift
map. Sub-visible ≠ absent.

**Detail gain vs churn gain, per spatial band, finds the driver.** On the real clip, motion confounds
source and output equally, so compare them as a RATIO. Per band (Gaussian band-pass, sigma 32 / 8 / 2):
`energy` = how much detail lives there, `frame-frame` = how much it churns. Churn outrunning detail
means the model is ADDING instability; tracking means it is amplifying what was there. SeedVR2's fine
band: detail **×1.45**, churn **×1.58** — tracks. **The shimmer was in the LTX source; sharpening made
it 1.45× more visible.**

Consequence: an artifact the model *amplifies* has no sampler-side fix, so stop sweeping settings.
It also names the contaminated band — which is exactly the band a frequency-separation paste-back
grafts, so the fix moves to the compositing stage.

## Knobs, measured

- **`SeedVR2PostProcessing.color_correction_method` has exactly FOUR options** — `lab` / `wavelet` /
  `adain` / `none` (read the enum off `/object_info`, do not assume more exist). `lab` kills the LOW
  band (temporal sd 1.19 → 0.10) and does **nothing** to the fine band (0.299 → 0.290), which is why
  it never removed what the user was seeing. Correction is a post-process, so variants re-run in ~4s
  once the sampler is cached — sweep, never guess. Order bench experiments so the cheap knob moves
  last: four values cost 10-20s each instead of 270s.
- **`frames_per_chunk` cannot be ranked by metric.** Laplacian variance put `fpc=33` above `fpc=57`;
  Fabio watched the clips and picked 57, and the eyes were right. Laplacian detects a within-clip
  COLLAPSE (a run whose frame 1 reads 10.4 and frames 3-81 read 5.1 is broken, and it proves that
  cold) but it scores grain and ringing as detail, so it cannot choose between two healthy runs.
  A per-clip `fpc` peak also does not generalise — one found on a single clip INVERTED on a second
  clip of different aspect and origin.
- **Predict the VRAM ceiling from the weight delta before spending a run on it:**
  `lost_latents = (weight_GB(new) − weight_GB(known)) / (0.55 × Mpx_per_frame)`. The 3B ran 15
  latents; the 7B is +4.87 GB at 1.85 Mpx → 4.8 fewer → ~10 → `fpc = 4×(10−1)+1 = 37`. Measured
  exactly that: 57 OOM'd, 37 ran. So a per-chunk number must be a function of the SELECTED WEIGHT,
  not just free VRAM.
- **The noise floor is exactly zero.** Same seed + same graph on the image path re-ran
  **bit-identical** (mean abs diff 0.0000), so every difference between two runs is signal. That is
  what turned a suspicious result into a fact below.

## Two ComfyUI mechanics measured here — NOT SeedVR2-specific

Both apply to any one-step / pixel-space model, and both produce a confident wrong conclusion.

- **`denoise` is QUANTISED, and on a one-step model most of its range is a no-op.** ComfyUI sizes
  the schedule as `int(steps / denoise)` and keeps the last `steps+1` sigmas, so at `steps = 1`
  **everything from ~0.67 to 1.0 collapses to the same schedule** — `0.75` produced a byte-identical
  file to `1.0`. Only 0.5 (2-step) and 0.25 (4-step) move, and they move by starting the model from a
  partially-noised latent it was never trained on, which reads soft rather than faithful. A dial that
  appears dead is not necessarily unwired; check the arithmetic before reporting it broken.
- **An alpha channel changes what the model SEES, even when the model drops alpha.**
  `comfy.utils.lanczos` round-trips through PIL at 8-bit, and **Pillow's RGBA LANCZOS zeroes the RGB
  under fully transparent pixels** (measured mean abs diff 149 there; opaque pixels also shift
  slightly). Any resize upstream of a model hands it a black hole where the transparency was, and a
  colour-correction pass referencing that same resized image then shifts the whole frame. Measured:
  a half-transparent source moved the FULLY OPAQUE half by 2.29 mean / 115 max, versus 2.45 / 107 for
  a seed change — a seed-sized perturbation from a channel the model supposedly never sees. A
  fully-opaque RGBA source is bit-identical to plain RGB, so the cost appears only with real
  transparency. Composite over a neutral background before the resize, or resize with a non-lanczos
  method.

## Measuring method notes

- **Normalise against a FIXED baseline, never per-run frame 1.** Dividing each run by its own frame 1
  gave mean ratios of 0.96 and 1.46, implying the wrong winner: frame 1 is not constant across runs,
  because a bigger temporal chunk gives the sampler more context and changes frame 1 itself. A lanczos
  upscale of the source is identical for every run, so it is the only honest denominator.
- **Blobs — organic drift or tile seams?** Gaussian-blur both images (r=24), subtract, and measure the
  mean |gradient| ON the tile-boundary columns/rows versus everywhere else. Ratio ~1.0 = no grid, so
  the tiled VAE is innocent and it is low-frequency luma drift (fix = the model's own colour-correction
  pass). Ratio >1.3 = the tiler is laying down a grid. Amplify the signed difference ~6× around
  mid-grey to make either visible at all.
- **Extract frames ONCE, to disk, before the bench overwrites them.** ComfyUI's `temp/` is cleared on
  restart — a "bad" run's mp4 vanished mid-investigation and survived only because its 81 PNGs were
  already dumped. Re-encode comparison videos from PNG at crf 16 so nothing shown to the user is a
  second-generation encode.
- ffmpeg on the bench:
  `G:/ComfyUi/python_embeded/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe`.
  The repo's own copy is `node_modules/ffmpeg-static/ffmpeg.exe`; there is no `ffmpeg` on PATH.
