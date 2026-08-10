# MPI-506 - SeedVR2 as three plugins feeding the upscale dropdown

Goal: the History **video** Upscale tool lets the user pick between **None**, an
**upscale model in `.pth` format** (today's list), and any **installed SeedVR2
plugin**. Three plugins ship: **SeedVR2 3B**, **SeedVR2 7B**, **SeedVR2 7B Sharp**.
Fabio updates `comfy_workflows/video_upscale.json` himself; this card owns the app
side plus the mechanism that lets a plugin contribute a dropdown entry.

**Decided (Fabio, 2026-08-09):** these are **plugins**, not a ModelDef. A weight
that only upscales and generates nothing has no business in the model picker.
[MPI-507](../MPI-507/brief.md) moves NVIDIA PiD onto the same mechanism for the
**image** upscale tool - build the mechanism here, reuse it there.

---

## 1. What SeedVR2 is, and why it is not "another upscaler"

ByteDance-Seed's **SeedVR2** is a **one-step diffusion video restoration** model,
not a tiled ESRGAN. It re-synthesises detail rather than sharpening what is
there, and it processes video in **temporal chunks** with an overlap so frames
stay consistent - hence the `SeedVR2TemporalChunk` / `SeedVR2TemporalMerge`
node pair. Practical consequences for the tool:

- It **hallucinates** detail. On a clean source that is a win; on a face it can
  drift identity. It is a *restorer*, so degraded/compressed footage is where it
  earns its size.
- It has no native "xN" concept - the pipeline is *resize to target, pad
  (`SeedVR2Preprocess`), restore, unpad+colour-correct (`SeedVR2PostProcessing`)*.
  The existing **x1.5 / x2 / x3 / x4** radio still works: it drives the pre-resize.
  No UI change needed there. (Contrast PiD on MPI-507, which is fixed 1024->4096.)
- VRAM is governed by **`frames_per_chunk`**, not by clip length. That is the
  knob that turns an OOM into a slow run - and it is **also the quality knob**,
  because too small a chunk starves the temporal context the model runs on. The
  app must size it; `chunking_mode: auto` cannot be trusted to (§2e defect 2).

**Licence: Apache-2.0** on all ByteDance-Seed and Comfy-Org repos. No territory
restriction, unlike MiniMax H3 - see memory `project_model_licences_can_be_territory_restricted`.

## 2. Engine: nothing to bump (verified, not assumed)

Native ComfyUI support landed in **PR #14424, merged 2026-07-10**, first
released in **v0.28.0** (2026-07-15). `dev_configs/node_lock.json` pins
**v0.30.0** (2026-08-03), so the nodes already ship.

Probed the running engine on **:48188** (the app engine, not the :8188 bench):

```
SeedVR2Preprocess, SeedVR2Conditioning, SeedVR2PostProcessing,
SeedVR2TemporalChunk, SeedVR2TemporalMerge     (python_module: comfy_extras.nodes_seedvr)
```

`comfyui_version: 0.30.0`. **No engine bump, no custom node pack.** Explicitly do
**not** wire `numz/ComfyUI-SeedVR2_VideoUpscaler` - it predates core support and
would add a pack to `node_lock.json` for nothing.

### 2a. SeedVR2 TAKES NO PROMPT - answered, not assumed

Fabio asked what SeedVR2 needs. Full node signatures pulled from `/object_info`
on :48188:

| Node | Inputs | Outputs |
|---|---|---|
| `SeedVR2Preprocess` | `resized_images: IMAGE` | `images: IMAGE` |
| `SeedVR2Conditioning` | `model: MODEL`, `vae_conditioning: LATENT` | `positive`, `negative` CONDITIONING |
| `SeedVR2PostProcessing` | `images: IMAGE`, `original_resized_images: IMAGE`, `color_correction_method: COMBO` | `images: IMAGE` |
| `SeedVR2TemporalChunk` | `latent: LATENT`, `temporal_overlap: INT`, `chunking_mode: dynamic combo` | `latents: LATENT`, `temporal_overlap: INT` |
| `SeedVR2TemporalMerge` | `latents: LATENT`, `temporal_overlap: INT` | `latent: LATENT` |

**`SeedVR2Conditioning` builds BOTH positive and negative conditioning from a VAE
latent** - `"Build SeedVR2 positive/negative conditioning from a VAE latent."`
There is no text input, no CLIP input and no text encoder anywhere in the weight
set (only `diffusion_models/` + `vae/`, §3). So:

**SeedVR2 needs NO prompt field and NO denoise slider.** It is one-step; there is
no denoise to expose. It contributes a plain dropdown entry with **zero extra
controls** - the opposite of PiD on MPI-507, which needs both. That is the pair
of cases the conditional-controls mechanism (§4a) has to cover.

The knobs it *does* have, and the recommendation for each:

| Knob | Where | Values | Ship as |
|---|---|---|---|
| `chunking_mode` | `SeedVR2TemporalChunk` | `auto` \| `manual` | **`manual`. NOT `auto`** - `auto` prevents the OOM and silently pays for it in quality, allowing 3 latents where 15 run (§2e defect 2). |
| `frames_per_chunk` | manual mode only | default 21, **must be 4n+1** | **computed app-side, still never exposed.** The 4n+1 constraint is a UI trap avoided by not having the UI. |
| `temporal_overlap` | `SeedVR2TemporalChunk` | INT, default 0 | **ship `2`. NOT 8** - a constant 8 clamps to `chunk_latent-1`, which forces `step=1` and destroys the image (§2e defect 1). |
| `color_correction_method` | `SeedVR2PostProcessing` | `lab` (default) \| `wavelet` \| `adain` \| `none` | **ship `lab`** - measured, §2e defect 3. The templates' `none` leaves visible luma drift. |

### 2d. THE CHUNKING TRAP - measured on Fabio's bench, 2026-08-09

First real run: 678x1214 source, 81 frames, 2x, 3B int8, 16 GB card. Output was
badly degraded. Cause, straight from `comfyui.prev.log`:

```
SeedVR2TemporalChunk auto: free=14.81GiB, 3.31Mpx -> frames_per_chunk=5 (t_pixel=81).
```

`auto` split 81 frames into ~17 chunks of **5 pixel frames**, and the template
ships `temporal_overlap = 0`, which `SeedVR2TemporalMerge` documents as *"plain
concatenation"*. So a model whose entire value is temporal context saw 5 frames
at a time and the segments were hard-butted together. Not a wiring fault - every
widget matched the official template.

**The sizing formula** (`comfy_extras/nodes_seedvr.py` + `comfy/ldm/seedvr/constants.py`):

```
budget          = free_gb - 8.5 - 4*0.55          # 10.7 GiB flat reserve
chunk_latent_max= int(budget / (0.55 * mpx_per_frame))
frames_per_chunk= min(4*(chunk_latent_max-1)+1, t_pixel)
chunk_latent    = (frames_per_chunk-1)//4 + 1
```

Reproduced exactly: 14.81 free, 3.31 Mpx -> budget 4.11 -> fpc 5. What `auto`
predicts on that card - and **every row is far too conservative**, see §2e:

| factor | Mpx | auto's frames/chunk | auto's chunk_latent |
|---:|---:|---:|---:|
| 2.0 | 3.31 | 5 | 2 |
| 1.5 | 1.87 | 9 | 3 |
| 1.25 | 1.29 | 17 | 5 |
| 1.0 | 0.83 | 33 | 9 |

Two structural facts that survive §2e:

1. **`temporal_overlap` is silently clamped** to `min(temporal_overlap, chunk_latent - 1)`,
   with no warning. It counts **latent** frames while `frames_per_chunk` counts
   **pixel** frames (`chunk_latent = (fpc-1)//4 + 1`).
2. **Chunking is unavoidable at useful resolutions.** 81 frames in one pass OOM'd
   at 1.5x (§2e). Design to chunk WELL, not to avoid chunking.

**Corrects an earlier claim in this brief** that `auto` was "the VRAM problem
solved with no UI". It prevents the OOM and silently pays for it in quality.

### 2e. MEASURED 2026-08-10 - three defects, all fixed by widget values

Bench: RTX 4060 Ti 16 GB, **NORMAL_VRAM**, 678x1214 source, 81 frames, 1.5x, 3B
int8. Scored by laplacian variance against a **fixed** lanczos-1.5x baseline -
per-run normalisation is unsound, because each run's frame 1 differs when the
sampler sees a different amount of temporal context. Review clips and drift maps:
`C:\Users\Fabio\Downloads\seedvr2-eval\`.

**Defect 1 - `temporal_overlap = 8` destroys the image. Ship `2`.**

`step = chunk_latent - min(temporal_overlap, chunk_latent - 1)`. A constant 8 is
clamped to `chunk_latent - 1` on any consumer card, so **`step = 1` always** -
the worst value available, not the best. `SeedVR2TemporalMerge` then Hann-
crossfades chunk onto chunk with an *accumulating* write, so every interior
latent becomes the running mean of ~3 **independently sampled** one-step
restorations. One-step detail is uncorrelated between chunks, so averaging
cancels it; on a moving subject it ghosts (visibly doubled lips at frame 40).

| setting | chunks | step | x lanczos, frame 1 | x lanczos, frames 3-81 | runtime |
|---|---:|---:|---:|---:|---:|
| auto fpc=9, overlap 8->2 | 19 | **1** | 10.41 | **5.14** | 409s |
| manual fpc=33, overlap 2 | 3 | 7 | 7.24 | **7.59** | 375s |
| manual fpc=57, overlap 2 | 2 | 13 | 3.97 | **6.26** | **268s** |

Only `auto` collapses internally (10.41 -> 5.14). **Frame 1 is the one latent the
merge never re-blends**, which is why it was the only good frame - and why a
still-image control test would have cleared the model wrongly.

**Fabio picked `fpc=57` on the clips, 2026-08-10** - *"FPC57 is the best of
them."* It is also the fastest (268s). Note the laplacian score ranked `fpc=33`
higher; **the metric was wrong and the eyes were right**, because laplacian
variance counts grain as detail. Use it to detect the *collapse* (a within-clip
drop), never to rank two healthy runs.

**This reverses the §2a recommendation.** "Pass a generous constant 8 and the
clamp resolves it to the maximum the chunk allows" is backwards: it resolves to
the maximum *overlap*, i.e. the minimum *step*.

**Defect 2 - `auto` is ~5x too conservative. Compute `frames_per_chunk` app-side.**

`auto` allowed `chunk_latent = 3`. Measured on the same card: **9 runs, 15 runs,
21 OOMs** at the KSampler (14.74 GiB allocated, 776 MiB short). The real ceiling
is 15-20 latents where the flat `8.5 + 4*0.55 = 10.7 GiB` reserve predicted 3.
Bigger chunks are also **faster** - fewer sampler invocations (268s vs 409s).

Corroborated independently by numz's README: *"at least a batch_size of 5 is
required to activate temporal consistency. SEEDVR2 need at least 5 frames to
calculate it."* `auto` handed the model 5 frames on run 1 and 9 on run 2 - at or
below the floor where the model's whole value switches on.

The app can size this with no new MpiNode: ComfyUI's `/system_stats` exposes
`vram_total` / `vram_free`, and the app already talks to that engine.
`routes/platformEngine.js:144` detects only the GPU *name*, so this is new
plumbing, but small.

**NOT YET VALID FOR THE APP.** Measured under NORMAL_VRAM on the bench; the
shipped app launches `--lowvram` on every NVIDIA GPU (`routes/comfy.js:432`),
which changes both what `get_free_memory()` reads and peak allocation. Re-measure
on `:48188` before any number reaches the app. Defects 1 and 3 are pure
arithmetic / post-process and carry no such caveat.

**Defect 3 - `color_correction_method = 'none'` leaves shadowy blobs. Ship `lab`.**

Fabio on the fixed clips: *"shadowy blobs on her face and body"*. **Not** tile
seams - a seam-gradient test on the VAE tile grid (512/128) returned ratio 1.02,
i.e. no grid structure. It is smooth low-frequency luma drift, exactly what
`SeedVR2PostProcessing` exists to remove.

Correction is a post-process, so the sampler output stays `execution_cached` and
each variant costs **~10-20s** to test - sweep them, never guess:

| method | drift p2..p98 | max abs drift | x sharpness |
|---|---|---:|---:|
| `none` (what the templates ship) | -3.00..+14.00 | **36** | 5.79 |
| **`lab`** (node default) | -1.00..+8.00 | **19** | 5.31 |
| `wavelet` | -1.00..+9.00 | 20 | 5.40 |
| `adain` | -7.00..+7.00 | 43 | 5.08 |

`lab` and `wavelet` are within noise of each other; both cut worst-case drift
~45%. `adain` centres the drift but has the worst outliers and costs the most
detail. The small sharpness cost is expected - part of what `none` scored as
detail *was* the drift. **Answers the §2a open question: do not copy the
templates' `none`.**

### 2f. `comfyorg/comfyui_seedvr2` is NOT an official pack - do not adopt it

Checked 2026-08-10 after Fabio found it. `gh api` says: **fork** of
`numz/ComfyUI-SeedVR2_VideoUpscaler`, **0 stars**, last pushed 2025-10-21. The
`comfyorg` org holds 28 repos, **all forks**, no website - it is not `Comfy-Org`
(77 repos, comfy.org), which is where the `Comfy-Org/SeedVR2` weights live.

Adopting it would cost: a `node_lock.json` entry; **`int8_convrot` entirely** (the
pack offers only fp16 and fp8_e4m3fn, and fp8 is Ada+ only, so 30-series users
lose out - see §3); and a node that auto-downloads 16 GB into `models/SEEDVR2`
outside the dependency manager, with no progress UI, no GC protection and no
orphan sweep. The genuinely official SeedVR2 support is the **core nodes we
already run** (§2). Keeps the §2 conclusion, now with the fork checked rather
than assumed.

**Gap noted:** `MpiLoadVideo` has no trim, so the official template's
"trim -> upscale segments -> merge" advice (its `Video Slice` node) is not
available to us, and neither is a single-chunk control run.

### 2b. SeedVR2 does IMAGES and VIDEO - and here is the reference graph

Fabio, 2026-08-09: *"VR2, I'm not sure if it can do images as well."* **It can.**
ComfyUI ships three SeedVR2 templates in `comfyui-workflow-templates` (pinned
0.11.27), found on disk at
`python_embeded/Lib/site-packages/comfyui_workflow_templates_json/templates/`:

| Template | Model | Nodes |
|---|---|---|
| `utility_seedvr2_3b_int8_upscale_image` | 3B int8 | 10 |
| `utility_seedvr2_7b_int8_upscale_image` | 7B int8 | 10 |
| `utility_seedvr2_3b_int8_upscale_video` | 3B int8 | 18 |

So SeedVR2 entries belong in **both** dropdowns - `videoUpscale` and
`imageUpscale`. That answers open question 1. **Note there is no 7B *video*
template** - only 3B ships one, presumably VRAM. Not a hard block, but bench the
7B video path before promising it.

Each template wraps the work in a **subgraph**, so the top level is only
Load -> subgraph -> Save. The subgraph contents (widget values as shipped):

**Image path (10 nodes):**

```
ResizeImageMaskNode ('scale by multiplier', 4.0, lanczos)
  -> SeedVR2Preprocess
  -> VAEEncodeTiled (tile 512, overlap 128, temporal_size 4096, temporal_overlap 8)
  -> SeedVR2Conditioning  <- UNETLoader (seedvr2_3b_int8_convrot) 
  -> KSampler (steps 1, cfg 1.0, euler, simple, denoise 1.0)
  -> VAEDecodeTiled -> SeedVR2PostProcessing ('none') -> JoinImageWithAlpha
Loaders: UNETLoader + VAELoader (seedvr2_ema_vae_fp16)
```

**Video path (18 nodes)** = the same spine plus `GetVideoComponents`,
`Video Slice` (optional trim), `CreateVideo` (30 fps), `SeedVR2TemporalChunk`
(temporal_overlap 0, chunking_mode **`auto`**), `SeedVR2TemporalMerge`, three
`ComfySwitchNode` toggles and a `PrimitiveBoolean` "Split Latent". Its
`VAEEncodeTiled` uses **temporal_size 64**, not the image path's 4096.

Two things worth lifting straight out of this:

- **Plain `KSampler` at steps 1 / cfg 1.0 / euler / simple / denoise 1.0.** Not
  `SamplerCustom`. One step, as advertised.
- **`chunking_mode: auto` is what the official video template ships** - and §2e
  measured that setting producing the ghosting. Ship `manual`. Still do not
  *expose* `frames_per_chunk`; the app computes it.

### 2c. SeedVR2 is natively a MULTIPLIER - the absolute mode is an option, not a fix

**Correction, Fabio 2026-08-09:** *"SeedVR2 actually works with a multiplier.
It's only PiD that doesn't."* Right - the shipped templates use
`ResizeImageMaskNode` in **`scale by multiplier`** mode (4.0 for image, 2.0 for
video), and SeedVR2 has no fixed input/output size. So the three paths line up
like this:

| Path | Native semantic |
|---|---|
| `.pth` upscale models | multiplier |
| **SeedVR2** | **multiplier** |
| PiD | absolute - trained `1024 -> 4096`, a fixed 4x |

Only PiD is the odd one out. An earlier version of this section implied SeedVR2
needed the absolute mode; it does not.

**But there is one hard reason to consider absolute for SeedVR2 anyway, and it is
not cosmetic:** `multiplier` is a FLOAT capped at **max 8.0** (verified in the
node's schema on :48188). If the radio says "4K" and the app converts to a
multiplier, then any source whose longest edge is under 512px needs **more than
8x** and the value is out of range - a 360px clip to 4K wants 11.4x. That is a
real input in a History workspace full of generated clips.

`scale longer dimension` takes an INT up to **16384** and has no such ceiling, so
it is the safe way to honour an absolute label. Either convert target -> multiplier
and clamp knowingly, or switch the mode. Do not discover the cap in the wild.

The node is core (`comfy_extras.nodes_post_processing`) and its `resize_type` is
a dynamic combo with eight modes:

| Mode | Input | Use |
|---|---|---|
| `scale by multiplier` | `multiplier` FLOAT 0.01-8.0 | what the templates ship |
| **`scale longer dimension`** | **`longer_size` INT 0-16384** | **1024 / 2048 / 3072 / 4096, aspect preserved** |
| `scale total pixels` | `megapixels` FLOAT | alternative absolute |
| `scale dimensions`, `scale width`, `scale height`, `match size`, `scale to multiple` | | |

So if the radio's four buttons stay absolute, `scale longer dimension` with
`longer_size` = 1024/2048/3072/4096 expresses them directly, with no multiplier
arithmetic and no 8x ceiling. **This is a choice, not a requirement** - SeedVR2
runs perfectly well on the multiplier the templates ship. What is *not* optional
is deciding which meaning the labels carry, because the `.pth` path is a
multiplier and PiD is absolute no matter what SeedVR2 does.

### 2g. THE IMAGE PATH - measured 2026-08-10, and all three variants ship

Fabio, 2026-08-10: *"the objective is to have the 3B, the 7B, and the 7B sharp
all available for both image and video upscaling."* That is now measured, not
assumed. **Answers open question 1: the 7B video path DOES ship** - Comfy simply
never published a 7B video template.

Bench: RTX 4060 Ti 16 GB, NORMAL_VRAM, engine schema from `:48188`. Source is
**frame 1 of the same clip every §2e number came from** (`678x1214`, 0.82 Mpx,
staged at `G:\ComfyUi\ComfyUI\input\seedvr2_eval_frame1.png`), so the image and
video results are directly comparable. Review sheets: `C:\Users\Fabio\Downloads\seedvr2-eval\IMG_*.png`.

**The image path has no VRAM problem.** Every variant ran at every multiplier -
no OOM anywhere, including 7B at 4x, which is a **13.17 Mpx** single frame:

| variant | x2 (3.29 Mpx) | x4 (13.17 Mpx) |
|---|---:|---:|
| 3B | 18.0s | 42.1s |
| 7B | 18.1s | **63.1s** |
| 7B Sharp | 18.1s | 48.2s |

That is the structural difference from video and it is worth stating plainly:
**there is no chunker on the image path**, the VAE is tiled, and one frame is one
latent. The whole §2e chunking apparatus - `SeedVR2TemporalChunk`,
`temporal_overlap`, `frames_per_chunk` - **does not exist here**. So the image
dropdown needs no VRAM sizing at all, and the three entries are interchangeable
from a memory standpoint.

**7B is NOT strictly better than 3B - it depends on the multiplier.** Laplacian
energy against a fixed lanczos baseline at the same target size:

| variant | x2 | x4 |
|---|---:|---:|
| 3B | **8.88x** | 10.93x |
| 7B | 5.28x | **16.87x** |
| 7B Sharp | 8.74x | 12.91x |

At **x2 the 7B under-delivers** - visibly, not just numerically: in
`IMG_x2_hair.png` the 7B panel is close to lanczos while 3B has restored the door
frame and individual hair strands. At **x4 the ranking inverts** and 7B leads.
Consistent with a model trained for large restorations: at a small multiplier it
has little to do and stays conservative. **Reinforces "do not default to 7B"** -
now with a measured reason rather than community consensus, and it argues for
3B as the default at every multiplier the History tool offers.

Caveat worth keeping: the source is a heavily compressed phone clip. On a clean
high-bitrate source the 7B ordering may differ. One source is one data point.

**`lab` is right on the image path too - same conclusion, one tenth the
magnitude.** Sweeping `color_correction_method` on the 7B x2 result (post-process
only, so the sampler stays `execution_cached` - the whole sweep cost 3s a run):

| method | drift p2..p98 | max abs drift | sharpness |
|---|---|---:|---:|
| `none` (what the templates ship) | -5.25..+5.46 | **6.86** | 3.09 |
| **`lab`** | -0.92..-0.05 | **1.12** | 3.03 |
| `wavelet` | -0.92..-0.05 | 1.16 | 3.04 |
| `adain` | -2.73..+1.81 | 7.97 | 2.95 |

`lab` cuts worst-case drift **84%** for a 2% sharpness cost. Note the drift here
peaks at 6.86 against **36** on the video path (§2e) - most of the video drift was
being *manufactured* by chunk-to-chunk accumulation, not by the model. Same
ranking as §2e regardless: `lab` ~ `wavelet` >> `none`, `adain` worst outliers.

### 2h. THE VIDEO PATH ON 7B AND SHARP - measured 2026-08-10, both ship

Same bench and clip as §2e (678x1214, 81 frames, 1.5x, NORMAL_VRAM, 16 GB).
Clips: `C:\Users\Fabio\Downloads\seedvr2-eval\6_*`, `7_*`, `8_*`; frame-40
triptychs `VID_variants_f40_*.png`.

**7B video works, but only at a smaller chunk.** `frames_per_chunk = 57` - the
number §2e settled for 3B - **OOMs on 7B**: `Allocation on device 0 would exceed
allowed memory. Currently allocated 12.28 GiB, Requested 1.25 GiB` at the
KSampler, after 127s. Dropping to **`fpc = 37` runs clean** on both 7B and 7B
Sharp.

That drop was **predicted before it was measured**, and the arithmetic is worth
keeping because it generalises to any future variant:

```
lost_latents = (weight_GB(variant) - weight_GB(3B)) / (0.55 * Mpx_per_frame)
             = (8.33 - 3.46) / (0.55 * 1.85)  =  4.8
chunk_latent: 15 (3B, measured §2e)  ->  ~10  ->  fpc = 4*(10-1)+1 = 37
```

**So the app's `frames_per_chunk` must be a function of the SELECTED VARIANT, not
just of free VRAM.** A single number shipped for all three plugins is an OOM on
7B or a quality give-away on 3B. Still bench-only - the `--lowvram` re-measure on
`:48188` is unchanged as a gate before any number reaches the app.

**At 1.5x, 3B beats both 7B variants - and the chunk size is NOT the reason.**
A control run of 3B at the same `fpc = 37` removes the confound:

| run | frames/chunk | x lanczos, frame 40 | runtime |
|---|---:|---:|---:|
| 3B | 57 | **4.04** | 268s |
| 3B | 37 | **3.57** | 277s |
| 7B | 37 | 1.90 | 403s |
| 7B Sharp | 37 | 2.45 | 406s |

Chunk size costs ~12% (4.04 -> 3.57). The **model** gap at identical chunk size is
~1.9x (3.57 vs 1.90). Model dominates; chunking is second order at this scale.
Confirmed by eye in `VID_variants_f40_hair.png` - both 3B panels resolve hair
strands and eyelashes the 7B panels leave soft. And 7B costs **45% more wall
clock** (403s vs 277s) to do less.

This is the **same inversion §2g found on images**: 7B is conservative at small
multipliers and only pulls ahead at large ones (x4 on the image path). At 1.5x
video it is the wrong tool. **3B stays the video default**, and 7B/7B Sharp ship
as the deliberate alternatives Fabio asked for - not as an upgrade path.

**Three graph defects found while preparing the runtime files** (all in
`seedvr2_video_FIXED.json`, all fixed in `seedvr2_video_APP.json`):

1. **Two `VHS_VideoCombine` nodes execute.** They are OUTPUT nodes, so ComfyUI
   runs them: every upscale wrote two extra h264 files (one previewing the
   source, one the result). Bench convenience, not runtime.
2. **An orphan `VAEDecode` (node 128).** No consumer, superseded by the tiled
   decode that actually feeds `SeedVR2PostProcessing`. Harmless - ComfyUI is
   output-driven so it never executes - but it is dead weight in a shipped file.
3. **`frames_per_chunk` was not injectable.** It sat as a bare widget on
   `SeedVR2TemporalChunk`, and the app injects ONLY `Input_*`-titled nodes
   (the naming law). Given defect 2 of §2e says the app must compute this number,
   and this section says it must vary per variant, the graph needs
   **`Input_Frames_Per_Chunk`** (`MpiInt`) wired to it. Added.

## 3. The weights - full size table

Canonical repo: **`Comfy-Org/SeedVR2`** on Hugging Face (Apache-2.0). Sizes read
from the HF API, GB = 10^9 bytes. Mirror to R2 per the usual weight-hosting rule.

`diffusion_models/`:

| File | Size | Notes |
|---|---:|---|
| `seedvr2_3b_fp16.safetensors` | 6.78 GB | 3B reference precision |
| `seedvr2_3b_fp8_e4m3fn.safetensors` | 3.39 GB | Ada+ only for native fp8 |
| **`seedvr2_3b_int8_convrot.safetensors`** | **3.46 GB** | **-> plugin `seedvr2-3b`** |
| `seedvr2_3b_mxfp8.safetensors` | 3.56 GB | Blackwell-class format |
| `seedvr2_3b_nvfp4.safetensors` | 2.00 GB | Blackwell-only (RTX 50xx) |
| `seedvr2_7b_fp16.safetensors` | 16.48 GB | 7B reference precision |
| `seedvr2_7b_fp8_e4m3fn.safetensors` | 8.24 GB | Ada+ only for native fp8 |
| **`seedvr2_7b_int8_convrot.safetensors`** | **8.33 GB** | **-> plugin `seedvr2-7b`** |
| `seedvr2_7b_mxfp8.safetensors` | 8.58 GB | Blackwell-class |
| `seedvr2_7b_nvfp4.safetensors` | 4.76 GB | Blackwell-only |
| `seedvr2_7b_sharp_fp16.safetensors` | 16.48 GB | "sharp" tune |
| `seedvr2_7b_sharp_fp8_e4m3fn.safetensors` | 8.24 GB | |
| **`seedvr2_7b_sharp_int8_convrot.safetensors`** | **8.33 GB** | **-> plugin `seedvr2-7b-sharp`** |
| `seedvr2_7b_sharp_mxfp8.safetensors` | 8.58 GB | |
| `seedvr2_7b_sharp_nvfp4.safetensors` | 4.76 GB | |

`vae/`:

| File | Size | Notes |
|---|---:|---|
| **`seedvr2_ema_vae_fp16.safetensors`** | **0.50 GB** | **shared by ALL THREE plugins - mandatory** |
| `ema_vae_fp16.safetensors` | 0.50 GB | same weight, legacy name from `numz/SeedVR2_comfyUI` |

There is **one VAE for all variants**. It is not optional and not per-size, so it
is a single dep listed by all three plugins. That is exactly what
`pluginRequiredDepIds()` already handles: it unions every plugin's deps, so the
shared VAE survives while *any* SeedVR2 plugin is still installed.

### Per-plugin footprint

| Plugin | Weight | + shared VAE | Install cost (first) | (subsequent) |
|---|---:|---:|---:|---:|
| `seedvr2-3b` | 3.46 GB | 0.50 GB | **3.96 GB** | 3.46 GB |
| `seedvr2-7b` | 8.33 GB | 0.50 GB | **8.83 GB** | 8.33 GB |
| `seedvr2-7b-sharp` | 8.33 GB | 0.50 GB | **8.83 GB** | 8.33 GB |
| all three | 20.12 GB | 0.50 GB | **20.62 GB** | - |

### Why int8_convrot for all three

**Decided by Fabio 2026-08-09: "we will be downloading the int8convrot models."**
That matches what ComfyUI's own shipped templates use - all three SeedVR2
templates in `comfyui-workflow-templates` load `*_int8_convrot.safetensors`, and
the template titles say so ("SeedVR2 3B Int8: Upscale Image").

This **corrects an earlier note in this brief that recommended fp8**. The reason
int8 wins is hardware reach, not size: **`fp8_e4m3fn` is only native from Ada
(RTX 40xx) up**, while int8 runs fast on Ampere (RTX 30xx) too. Vision still
ships to 30-series cards, so int8 is the broader default and the 0.07-0.09 GB it
costs over fp8 is noise.

- **not fp16** - 6.78/16.48 GB for a restoration pass with no published quality
  delta to justify it.
- **not mxfp8 / nvfp4** - Blackwell-class numeric formats. `nvfp4` is the only
  genuinely small 7B (4.76 GB) and is worth revisiting **as a fourth plugin**
  once the RTX 50xx share matters, but it cannot be a default today.
- **the VAE is mandatory and separate** - Fabio, 2026-08-09: *"we will also need
  the VAE."* Confirmed in both templates: every one loads
  `seedvr2_ema_vae_fp16.safetensors` alongside the diffusion model.

### 3B vs 7B vs 7B Sharp - the actual difference

| | 3B | 7B | 7B Sharp |
|---|---|---|---|
| Transformer blocks | 32 | 36 (and wider) | 36, sharpening-tuned |
| fp8 download | 3.39 GB | 8.24 GB | 8.24 GB |
| Speed | fast enough for whole clips | markedly slower per chunk | same as 7B |
| VRAM | the consumer-card option | wants a big card | wants a big card |
| Where it wins | **video** - the quality/speed ratio for a full clip, and temporal consistency at a usable chunk size | **hero shots and stills** - maximum recovered detail | soft/blurry sources that need bite |
| Where it hurts | least detail recovered | slow | **over-sharpens a clean source** - halos, crunchy texture |

Community consensus is consistent: **3B is the right default**, 7B is the
"absolute perfection on one shot" option, Sharp is a deliberate aggression dial
rather than a strictly better 7B. **Do not default the dropdown to 7B or Sharp.**

Numbers still to measure on a real card (no published figure is trustworthy):
per-clip wall-clock and the VRAM ceiling per `frames_per_chunk`. Bench item, not
a blocker for the UI.

## 4. The mechanism - a plugin that contributes a dropdown entry

This is the reusable half. MPI-507 consumes it unchanged.

Today a `PluginDef` (`js/data/pluginsRegistry.js`) is *"a capability other
surfaces call"* with a **singular `operation`**, and the only instance
(`image-describer`) gates a right-click action. Three SeedVR2 plugins all serve
`videoUpscale`, so `operation` no longer identifies a plugin and is not what the
dropdown needs anyway.

What has to exist:

1. **A way for a plugin to declare a tool-dropdown entry** - which tool
   (`videoUpscale` / `imageUpscale`), the label, and the value the injector
   receives. Keep it a plain data field on `PluginDef`; do not invent a fourth
   registry entity.
1b. **Per-entry extra controls, declared by the entry.** Fabio (2026-08-09) on
   PiD: *"we can just add a Text Input in the toolbar and the Denoise when PiD is
   selected."* So the tool-options panel shows extra controls **conditional on
   the selected entry**. The two cases are already known and they are the
   extremes: **SeedVR2 declares none** (§2a - no prompt, no denoise), **PiD
   declares prompt + denoise** (MPI-507 §3a). Build it as a declared list on the
   entry, not an `if (isPid)` branch - the second consumer already exists.
   The controls themselves exist in `PromptBoxControls.js` (`denoise`); reuse,
   do not re-implement.
2. **Install-state-driven options.** `getPluginDepStatus()` already exists and is
   populated by `syncModelInstalled()` off the same id-agnostic
   `/comfy/models/check` the models and apps use. An uninstalled plugin still
   shows in the dropdown, but as an **install affordance**, not a silent failure
   at run time.
3. **Value namespacing.** Today the dropdown value is either `''` (None) or a
   bare `.pth` filename. A plugin entry needs a prefix that cannot collide -
   `plugin:seedvr2-3b` matches the existing `pluginDepKey()` convention.
   `coerceSettings()` must drop a stale persisted value whose weight is no longer
   on disk, exactly as it already does for a removed `.pth`.
4. **Injection mapping** - selected value -> the weight filename + whatever the
   graph's variant switch expects. Fabio's workflow decides the shape; see
   `.claude/rules/comfy_injection.md` and `docs/workflow-authoring/`.

**Free already, do not rebuild:** the Model Library renders plugins today
(`MpiModelManager.js` ~1044-1166) with search, install, uninstall and download-job
tracking keyed by `pluginDepKey`, and `routes/downloadManager.js:363` gives every
plugin dep GC protection. Three new `PLUGINS` entries get all of that for free.

## 5. Why plugins and not `engineAsset`

`videoUpscale` is a **universal** workflow, and per
`js/data/modelConstants/universal_workflows.js` universal deps are the universal
DEPS set: every `type:'custom_nodes'` node plus every `engineAsset:true` weight,
**installed automatically with the engine**. Marking SeedVR2 `engineAsset` would
push **20 GB onto every user at engine install**. Plugins are the opt-in path -
`image-describer` owns a 4.88 GB encoder for the *universal* `imageDescribe` op
and its dep carries **neither `engineAsset` nor `bakedOnPod`**.

**Settle the remote/Pod half before coding.** An `engineAsset` is baked into the
Pod image; a plugin dep is not. Check how `image-describer`'s encoder reaches a
Pod and whether SeedVR2 needs the same, is downloaded on the Pod at run time, or
is simply unavailable remotely.

## 6. App-side files

- **`js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.js`** -
  the dropdown. One component serves both tools via its `kind` prop
  (`'video'` | `'image'`), persisting to `toolSettings.videoUpscale` vs
  `toolSettings.imageUpscale`. **Build the entry source `kind`-aware from the
  start** - MPI-507 needs the image side and should not have to refactor this.
- **`js/data/pluginsRegistry.js`** - three new entries + the dropdown-entry field.
- **`js/data/modelConstants/modelDeps.js`** (or `assetDeps.js`) - four new deps
  (3 weights + 1 shared VAE), R2-hosted with `mirrorUrl` to HF and sha256.
- **`comfy_workflows/video_upscale.json`** - Fabio. Currently branches on the
  `Upscale_Using_Model` boolean through `MpiIfElse` (nodes 748/755/608/607);
  becomes a multi-way branch.

## 7. Open questions for Fabio

1. ~~Is the **7B video** path worth shipping?~~ **ANSWERED 2026-08-10 - yes, it ships.**
   Fabio: all three variants must work for BOTH image and video. Measured in §2h:
   7B and 7B Sharp both run video at `fpc = 37` (57 OOMs). Comfy simply never
   published a 7B video template; that was never a capability limit.
2. `frames_per_chunk` needs a **`--lowvram` re-measure on `:48188`** before the
   app can size it (§2e defect 2). Bench-only numbers so far.
**Answered 2026-08-10:**

- *`fpc=33` or `fpc=57`?* **57** - Fabio, on the clips. Also the fastest. The
  laplacian score preferred 33 and was wrong; see §2e.

- *`color_correction_method`?* **`lab`** - measured, §2e defect 3. Do not copy
  the templates' `none`; it is what leaves the shadowy blobs.
- *Is `comfyorg/comfyui_seedvr2` the official pack we should switch to?* **No** -
  §2f. Zero-star stale fork of numz's pack; `comfyorg` is not `Comfy-Org`.

**Answered 2026-08-09, do not re-ask:**

- *Does SeedVR2 need a prompt?* **No** - §2a, verified against the node
  signatures, not inferred. No prompt, no denoise, no extra controls at all.
- *Does SeedVR2 do images?* **Yes** - §2b, two official image templates. Its
  entries go in **both** dropdowns. (PiD is image-only; MPI-507 §0.)
- *Which precision?* **`int8_convrot`** - Fabio's call, and what every official
  template uses. fp8 is Ada+ only; int8 also runs fast on Ampere (§3).
- *`frames_per_chunk`?* **Not exposed in the UI** - but **computed app-side and
  injected in `manual` mode**, not left to `auto`. Superseded 2026-08-10 by §2e
  defect 2; the earlier answer here said `auto`, which is the defect.
- *Resolution / factor labels?* The radio relabels to **1K / 2K / 3K / 4K** when
  SeedVR2 or PiD is selected. `ResizeImageMaskNode` supports this natively via
  `scale longer dimension` (§2c), so no multiplier arithmetic is needed and both
  generative upscalers share one absolute meaning.

## Sources

- [SeedVR2 in ComfyUI - official docs](https://docs.comfy.org/tutorials/utility/seedvr2)
- [ComfyUI PR #14424 - native SeedVR2 support](https://github.com/comfyanonymous/ComfyUI/pull/14424)
- [Comfy-Org/SeedVR2 (HF, Apache-2.0)](https://huggingface.co/Comfy-Org/SeedVR2)
- [ByteDance-Seed/SeedVR2-3B](https://huggingface.co/ByteDance-Seed/SeedVR2-3B) / [SeedVR2-7B](https://huggingface.co/ByteDance-Seed/SeedVR2-7B)
- [One-step 4K video upscaling in ComfyUI with SeedVR2 - AInVFX](https://www.ainvfx.com/blog/one-step-4k-video-upscaling-and-beyond-for-free-in-comfyui-with-seedvr2/)
- [numz/ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler) - the pre-core custom pack, **not** what we wire
