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

> **CORRECTED 2026-08-14 - this section drew a wrong conclusion about the PARENT
> repo, and MPI-557 acted on it before catching the error. Read § 2f-bis below
> before citing anything here.** The fork verdict stands. The inference that the
> whole lineage is unofficial, and that core is therefore "the genuinely official
> SeedVR2 support", does not.

Checked 2026-08-10 after Fabio found it. `gh api` says: **fork** of
`numz/ComfyUI-SeedVR2_VideoUpscaler`, **0 stars**, last pushed 2025-10-21. The
`comfyorg` org holds 28 repos, **all forks**, no website - it is not `Comfy-Org`
(77 repos, comfy.org), which is where the `Comfy-Org/SeedVR2` weights live.

Adopting it would cost: a `node_lock.json` entry; **`int8_convrot` entirely** (the
pack offers only fp16 and fp8_e4m3fn, and fp8 is Ada+ only, so 30-series users
lose out - see §3); and a node that auto-downloads 16 GB into `models/SEEDVR2`
outside the dependency manager, with no progress UI, no GC protection and no
orphan sweep. ~~The genuinely official SeedVR2 support is the **core nodes we
already run** (§2).~~ **That last sentence is the error - see § 2f-bis.**

### 2f-bis. The PARENT pack is real, official-in-practice, and untested by us

**Measured 2026-08-14** after Fabio pushed back with the repo's own README page.
`gh api repos/numz/ComfyUI-SeedVR2_VideoUpscaler`:

| field | value |
|---|---|
| `fork` | **false** - it is not a fork of anything |
| stars | **2,741** |
| description | *"Official SeedVR2 Video Upscaler for ComfyUI"* |
| last push | **2025-12-24** - actively maintained |
| Comfy registry | listed as `seedvr2_videoupscaler`, **953,379 downloads** |

**What went wrong in §2f:** the fork was checked, correctly rejected, and then its
0-star/stale evidence was carried up to the parent. The parent was never checked.
A child's provenance is not the parent's - and this pack is what the ecosystem
actually runs.

**What we run instead, stated exactly:** `comfy_extras.nodes_seedvr` - the five
`SeedVR2*` nodes bundled with ComfyUI core, confirmed off `/object_info`
(`python_module: comfy_extras.nodes_seedvr`, no `cnr_id`). Fabio's read is that
the bundled template targets far larger hardware than a consumer card, and his
evidence is direct: **a 1.5x whole-video upscale OOMed immediately on his 16 GB
4060 Ti.**

**Do NOT cite MPI-557's 7B runs as evidence that 7B fits.** Those were a
**512x512 crop, 73 frames** - 3B, 7B and 7B-sharp all completed in ~30 s, which
proves only that `int8_convrot` fits at *crop* scale. It says nothing about frame
scale, which is where the OOM is. That over-scoped claim was made in the MPI-557
session and is retracted here.

**The open question this card now owns** (MPI-557 is blocked on it):

> Does `numz/ComfyUI-SeedVR2_VideoUpscaler` beat the core nodes on a **full-frame**
> upscale - and at what cost?

Specifics to settle, none of them yet measured:

- **Memory-efficient inference / batching.** The pack's own headline. Whether its
  `resolution` / `max_resolution` / `batch_size` / `uniform_batch_size` path
  survives a 1.5x whole-video run on 16 GB where core OOMs is the decisive test.
- **Knobs core does not expose:** `input_noise_scale`, `latent_noise_scale`,
  `preserve_frames`, `temporal_overlap`, plus torch.compile settings and explicit
  `encode_tiled` / `decode_tile_size` / `decode_tile_overlap` VAE control.
- **Do defects 1 and 2 even exist there?** Both (§2e) are fights with core's
  `SeedVR2TemporalChunk` clamp and its over-conservative `auto`. The pack may
  simply not have those failure modes, which would retire two of this card's
  three defects rather than work around them.
- **The int8 question is now a trade, not an objection.** The pack ships fp16 /
  fp8_e4m3fn, so switching likely costs `int8_convrot` and the 30-series users who
  depend on it. Weigh that against a path that does not OOM - and check whether
  the pack has added int8 since 2026-08-10.
- The packaging objections above (16 GB auto-download outside the dep manager, no
  progress UI, no GC protection, no orphan sweep) **all still stand** and are real
  integration work. They are a cost to price, not a reason to skip the bake-off.

**What this does NOT explain, so do not re-open it here:** the wavy shimmer.
MPI-557 root-caused that on 2026-08-14 as a source property - per-band churn rises
in proportion to sharpening (fine band: detail x1.45, churn x1.58), so any
sharpener amplifies shimmer the LTX source already carried. A different node pack
changes the sharpener, not the shimmer. See MPI-557 brief § The wavy shimmer,
ROOT-CAUSED.

### 2f-ter. THE NODE CHOICE IS SETTLED - core wins, the pack is rejected. MEASURED 2026-08-15

**Gate closed.** `numz/ComfyUI-SeedVR2_VideoUpscaler` was installed on the bench
(clone `4490bd1`, v2.5.23) and baked off against the bundled
`comfy_extras.nodes_seedvr` on the same clip, same seed, same 1.5x, same `lab`.
**Core beats it on every axis measured.** Do not revisit without new evidence.

Bench: RTX 4060 Ti 16 GB, **ComfyUI 0.31.0**, NORMAL_VRAM, 678x1214, 81 frames,
1.5x, 3B, seed 416, overlap 2, `lab`. Clips in
`C:\Users\Fabio\Downloads\seedvr2-eval\` (`BASE_core_*`, `PACK_numz_batch33.mp4`,
`CMP_*`, `MATCH33_*`, `SWEEP_*`).

#### The decisive number: matched chunk size

Earlier comparisons ran each path at its own ceiling, which confounded chunk size
with node path. The control removes it - **both at 33 frames per chunk**:

| path | chunk | detail vs lanczos (f3-81) | time |
|---|---:|---:|---:|
| **core** `comfy_extras.nodes_seedvr` | 33 | **3.86** | 386s |
| pack `numz` | 33 | **2.57** | 446s |

**Core resolves ~50% more detail at identical chunk size**, and is 13% faster.
Confirmed by eye in `MATCH33_f40_lanczos-core-pack.png`: core separates hair
strands and necklace links the pack leaves soft. The metric and the eyes agree
here - unusual for this card, and worth trusting because of the control.

#### BlockSwap does not solve our OOM - it is the wrong lever

The pack's headline feature was tested properly, escalating the dial on the
whole-clip (81-frame) run that OOMs core:

| `blocks_to_swap` | allocated at OOM | short by |
|---:|---:|---:|
| 0 | 13.62 GiB | 1.46 GiB |
| 16 | 13.21 GiB | 1.46 GiB |
| 32 + `swap_io_components` | 12.03 GiB | 1.46 GiB |

Full BlockSwap bought **1.6 GiB and still OOMed**. **The weights were never the
bottleneck at 81 frames - the activations are**, and BlockSwap only moves
transformer blocks. The SeedVR2 paper corroborates the mechanism: its *adaptive
window attention* scales the attention window with output resolution, so
activation memory grows with frames x resolution regardless of where the weights
live. BlockSwap is quality- and speed-neutral (431s/2.57 with swap vs 446s/2.57
without) - it works exactly as documented, it just does not address this.

**The pack also OOMs EARLIER than core.** Core runs 69 frames per chunk; the pack
dies at 49 and needs 33. Its ceiling on this card is *lower*, not higher.

#### Neither path tiles SPATIALLY - and that is not the fix anyway

Both split **temporally** (frames), never spatially; every frame goes through the
transformer whole. Core calls it `frames_per_chunk`, the pack calls it
`batch_size` - the same idea under two names. The only spatial tiling anywhere is
the pack's VAE `encode_tiled`/`decode_tiled` (1024/128, 768/128), which is the
autoencoder, not the sampler, and does not touch the activation memory that OOMs.
If a spatially-tiled SeedVR2 exists somewhere, it is in neither of these.

#### The trade we no longer have to make

The feared cost of switching (§2f-bis) was `int8_convrot` and the 30-series users
who need it. Confirmed from the live schema: the pack's shelf is fp16 /
fp8_e4m3fn / GGUF Q4_K_M / Q8_0 - **no int8 of any kind**. Fabio ruled out GGUF.
So the trade would have been real *and* the quality is worse. Rejected on both.

Integration costs avoided, all still real: a `node_lock.json` entry, a
`requirements.txt` install (only `peft` + `rotary_embedding_torch` were missing -
installed `--no-deps` to protect torch 2.12.0+cu130), and **3.7 GB auto-downloaded
to `models/SEEDVR2` outside the dependency manager** with no progress UI, no GC
protection and no orphan sweep.

**Disposition:** the clone is left at
`G:\ComfyUi\ComfyUI\custom_nodes\seedvr2_videoupscaler.disabled` (suffix disables
it; reversible). Its 3.7 GB of weights are still in `G:\ComfyUi\ComfyUI\models\SEEDVR2\`
and can be deleted - nothing we ship reads them.

**MPI-557 is unblocked** - it takes the core nodes as its sampler.

### 2j. CHUNK SIZE HAS A PEAK AT 33, AND IT IS NOT THE SHIPPED VALUE. MEASURED 2026-08-15

> **SUPERSEDED IN PART, 2026-08-16.** The peak at 33 held only on the FIRST clip. A second clip (AI-generated, 1536x640) inverted it - 57 scored 3.79 vs 33 at 3.67 - so the optimum is CONTENT-DEPENDENT and the shipped 57 should stay. More importantly, S 2k questions whether the video path ships at all. Read 2k first.

Full sweep, core nodes, same bench and clip as 2f-ter:

| `frames_per_chunk` | detail (f3-81) | ratio f1/interior | time |
|---:|---:|---:|---:|
| 17 | 3.27 | 0.70 | 285s |
| 25 | 3.43 | 0.82 | 275s |
| **33** | **3.86** | **0.97** | 386s |
| 57 (shipped) | 3.46 | 0.70 | 391s |
| 69 | 3.17 | 0.84 | 280s |
| 81 | **OOM** at KSampler - 14.74 GiB allocated, 776 MiB short | | |

**33 is a genuine optimum, not a monotonic trend** - quality falls off on BOTH
sides. It also has by far the flattest decay (ratio 0.97 vs 0.70 at 57), meaning
frame 1 and the clip interior are nearly equal in detail; every other setting sags
toward the interior. Confirmed by eye in `SWEEP_f40_fpc25-33-69.png`.

**This corrects the 2026-08-10 conclusion.** `fpc = 57` was picked from review
clips on the assumption that a bigger chunk buys temporal context. At matched
conditions the opposite holds on this clip, and 57 is measurably worse than 33 on
both detail and decay. **`comfy_workflows/seedvr2_video.json` ships 57 and should
ship 33.**

Fabio's instinct - *"process the video on a second-by-second basis, 24 frames at a
time"* - points the right way. Note the chunker enforces **4n+1**, so 24 is not a
legal value; 25 is the nearest and 33 is the measured peak.

**Caveat, unchanged:** one clip, one card, NORMAL_VRAM. The `--lowvram` re-measure
(the app launches `--lowvram` on every NVIDIA GPU, `routes/comfy.js:432`) is still
an open gate before this number ships. What is now settled is the node path and
the *shape* of the curve, not the constant for every machine.

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

### 2i. `denoise` and the alpha channel - both answered by measurement, 2026-08-10

Fabio, on his own image run: *"it worked really well upscaling the image that I
tried, [but] it made a bit too many changes."* Two candidate dials were on the
table; neither is what it looks like.

**`denoise` is quantised, and at steps=1 most of its range is a NO-OP.** ComfyUI
sizes the schedule as `int(steps / denoise)` and keeps the last `steps+1` sigmas.
At `steps = 1` that means **every value from ~0.67 to 1.0 collapses to the same
1-step schedule** - `denoise = 0.75` produced a **byte-identical** file to `1.0`
(mean abs diff 0.0000). Only 0.5 (-> a 2-step schedule) and 0.25 (-> 4-step) change
anything. 3B, x2, vs a fixed lanczos baseline:

| denoise | x lanczos | vs denoise 1.0 |
|---|---:|---:|
| 1.0 | 8.88 | - |
| 0.75 | **8.88** | **0.00 (identical)** |
| 0.5 | 2.60 | 2.61 |
| 0.25 | 2.48 | 2.80 |

So it *does* reduce how much the model changes - but as **two coarse steps**, and
by starting the one-step model from a partially-noised LQ latent it was never
trained on. The result reads soft and mushy rather than faithful-and-sharp
(`IMG_denoise_3b_x2_face.png`). **Do not expose it, and do not ship it below 1.0.**
This confirms §2a's "no denoise control" from measurement rather than from the
node signature alone.

**The dials that DO work for "too many changes" are already in the graph.** Per
§2g, at x2 the **7B changes far less than the 3B** (5.28x vs 8.88x lanczos) and at
x4 it inverts (16.87x vs 10.93x). Fabio's bench image graph shipped **7B at
multiplier 4.0** - the single most aggressive cell in the whole matrix. Lower the
factor, or use 3B at x4, and it changes less. No graph edit needed.

**The honest continuous knob, if one is ever wanted**, is not `denoise`: blend
`SeedVR2PostProcessing`'s output back against the resized original
(`ResizeImageMaskNode`) with core **`ImageBlend`** (present on `:48188`, `blend_factor`
FLOAT, `normal` mode), driven by an `Input_Strength` `MpiFloat`. 0 = plain lanczos,
1 = full SeedVR2, no degradation in between. Not built - proposed only.

**The image path is bit-deterministic.** Same seed, same graph, re-run: mean abs
diff **0.0000**. A different seed moves the result by mean 2.45 / max 107. So the
seed is a real knob on stills, and any diff below that magnitude is signal, not noise.

**The alpha channel: `JoinImageWithAlpha` is a pass-through, NOT a mask.** The
model never sees it - `SeedVR2Preprocess` slices `[..., :3]` (`_seedvr2_pad`, and
its own description says "Alpha channel is dropped"), and `SeedVR2PostProcessing`
re-attaches it from `original_resized_images`. Nothing is protected, restricted or
excluded from restoration. Transparency does round-trip correctly: a
half-transparent test came out with alpha 0.1 on the masked half and 254.9 on the
other.

**But a transparent region is NOT free, and the cause is upstream of SeedVR2:**

| source | RGB diff vs a plain RGB source |
|---|---|
| fully-opaque RGBA | **0.0000 (bit-identical)** - an alpha channel per se costs nothing |
| half-transparent RGBA | **mean 2.29 / max 115 in the FULLY OPAQUE half** - i.e. a seed-change worth of drift, everywhere |

Root cause, reproduced offline with no GPU: `comfy.utils.lanczos` round-trips
through **PIL at 8-bit**, and Pillow's RGBA LANCZOS **zeroes the RGB under fully
transparent pixels** (measured mean abs diff 149.3 there) while perturbing opaque
pixels slightly (0.04 mean / 25 max). So `ResizeImageMaskNode` hands the model a
frame with a **black hole** where the transparency was, and the `lab` colour
transfer - whose reference is that same resized image - then shifts the result
globally.

**Consequence for the tool:** History feeds opaque images, so today the cost is
exactly zero (proved by the bit-identical opaque-RGBA control). If a cutout with
real alpha is ever upscaled, expect a global colour shift, and the fix is not in
SeedVR2 - it is to composite over a neutral background before the resize, or to
resize with a non-lanczos method.

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

### 2k. THE PRODUCT VERDICT - SeedVR2 SHARPENS, IT DOES NOT RECONSTRUCT, AND IT CANNOT DO 2x ON 16 GB. MEASURED 2026-08-16

**This section may end the card.** Everything above answers *how to wire SeedVR2
well*. This one asks whether it should ship at all, and the measurements say the
product case is weak for our actual target (near-production AI video that needs a
sharpen, not a restoration).

Fabio's read, which the numbers then confirmed: *"it's just sharpening, it's not
improving detail... it messed up the eyes, the iris is almost square. Does the
model not know what an eye is?"*

#### 1. The frequency signature is a sharpener's - and it gets WORSE with more room

Method: radial FFT of each clip against a **fixed lanczos baseline** at the same
output size. `gain(f) = energy(clip,f)/energy(lanczos,f)`. A sharpener boosts the
MID band (amplifying edges that already exist) and falls back toward 1.0 at the
top of the band. A reconstructor holds gain HIGH at the top, because it is
synthesising structure the source never had. Reported as `top/mid`.

| clip | factor | mid gain | top gain | **top/mid** |
|---|---:|---:|---:|---:|
| h264 re-encode of lanczos (**control**) | - | 1.04 | 1.11 | **1.06** |
| `4x_NMKD-Siax_200k` .pth | 1.5x | 1.23 | 1.10 | 0.89 |
| SeedVR2 3B, AI clip | 1.5x | 6.18 | 3.50 | **0.57** |
| SeedVR2 3B, cowboys clip | **2x** | 5.96 | 2.53 | **0.43** |

**The control is the load-bearing part** - it rules out the codec as the
explanation. Re-encoding the lanczos reference through the identical h264 settings
returns `top/mid` 1.06, so the pipeline preserves the top band and the 0.57 / 0.43
readings are properties of the model, not of the encode.

**A prediction was made and FAILED, which is why this is trustworthy.** The
hypothesis was that 1.5x simply gave the model no room, and that a higher factor
would force reconstruction and push `top/mid` up. At 2x it went **down** (0.57 ->
0.43). SeedVR2 does the same thing at every scale tested; it is not
detail-starved at low factors.

**Do NOT restate this as "no better than a .pth upscaler" - that part is false.**
SIAX at 1.5x contributes almost nothing (mid 1.23, top 1.10 - visually
indistinguishable from lanczos in `AI_siax_vs_seedvr2_f45.png`). SeedVR2 moves
5x more mid-band energy and visibly adds freckles, knit stitches and wood grain.
It is an order of magnitude beyond a .pth sharpener. It is simply **not the
detail reconstructor the paper implies**, at the scales we can afford to run.

#### 2. There is no semantic prior, and that is STRUCTURAL

SeedVR2 runs **one sampling step at cfg 1.0 with no text conditioning** - no
prompt, no CLIP input, no text encoder anywhere in the weight set (S 2a). It has
no object model, so it cannot know that an iris is round. What it has is a learned
prior over *local texture statistics*, which is why it produces plausible skin
pores and fabric weave while deforming eyes, and why it invents dark blotches on
clean cheeks and ears (`EYE_zoom_lanczos-vs-seedvr2.png`).

**This is not a settings bug and no widget fixes it.** Any future "why did it do
that to the face" question has this as its answer.

#### 3. The VRAM ceiling breaks the product case on a 16 GB card

Fabio: *"if we're offering a model that can't even do 2x on a 16 GB card, then
there's no point in offering it."*

Measured on the 4060 Ti 16 GB, NORMAL_VRAM bench (the app runs `--lowvram`, which
is a *separate* open gate - these numbers are the optimistic case):

| source | Mpx | factor | max `frames_per_chunk` |
|---|---:|---:|---|
| 678x1214 | 0.82 | 1.5x | 57-69 |
| 1536x640 | 0.98 | 1.5x | 57 |
| 1344x768 | 1.03 | **2x** | **13** - 33 OOMs |
| 1344x768 | 1.03 | **3x** | **OOMs at fpc=5** - the model's own floor |

**2x on a ~1 Mpx source collapses the chunk to 13 frames**, against the model's
own documented floor of 5 for temporal consistency to engage at all. Shipping a
*video* upscaler at barely twice its minimum temporal context is exactly the
condition that produces the oscillation Fabio reports on faces and freckles. The
chunk size is not a tuning knob at that point - it is the whole product.

#### What this does NOT close

- The **image** path (S 2g) is unaffected by every argument here: no chunker, no
  temporal consistency requirement, and a single frame at 4x has room the video
  path never gets. If SeedVR2 ships at all, the image tool is the honest home.
- **7B / 7B Sharp were not re-tested** under this analysis. They lost at 1.5x on
  the real clip (S 2h) and there is no reason to expect a different *signature* -
  more capacity, same one-step no-conditioning architecture - but it is unmeasured.

#### The two directions Fabio raised, both better-founded than more SeedVR2 tuning

1. **Upscale-then-interpolate.** Upscale a reduced frame set (fewer frames per
   pass = bigger effective chunk = more context per frame), then interpolate back
   up. The interpolator enforces the temporal coherence the upscaler cannot, and
   it directly attacks BOTH failures above. Fabio has run this manually off 16 fps
   WAN clips with better results than a straight upscale.
2. **Regenerative upscaling (LTX).** A regenerative pass has conditioning and
   multiple steps, so it carries the semantic prior SeedVR2 structurally lacks -
   the thing that would keep an iris round. Different class of tool, and the right
   one for near-production AI video.

Both deserve their own cards rather than more widget sweeps here.
