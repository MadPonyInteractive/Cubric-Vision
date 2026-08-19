# MPI-568 - LTX spatial upscaler: bench evaluation

Successor direction to MPI-506, which **dropped SeedVR2** on 2026-08-16. Fabio:
*"We'll need to explore other ways, like, for example, using LTX Upscaler."*
This card is a **bench evaluation only** - no app work, no plugin, no dropdown.
It answers one question: does the LTX spatial upscaler do what SeedVR2 could not?

## Why this is a different class of tool

MPI-506 measured SeedVR2 to destruction and the two failures were **structural,
not tuning** (MPI-506 brief S 2k, `validation.md`):

1. **It sharpens rather than reconstructs.** Radial-FFT gain against a fixed
   lanczos baseline: top/mid **0.57 at 1.5x, 0.43 at 2x, 0.24 at 3x** - falling
   monotonically, i.e. the more room it gets the more purely it behaves as a
   mid-band amplifier. An h264 re-encode control returned 1.06, ruling out the
   codec as the cause.
2. **It has no semantic prior.** One sampling step, cfg 1.0, no text encoder
   anywhere in the weight set. It restores local texture statistics with no
   object model - hence Fabio's *"the iris is almost square. Does the model not
   know what an eye is?"* No widget fixes that.

**LTX is the opposite on both counts**: it is a conditioned, multi-step video
model, so a regenerative upscale pass carries a semantic prior and can be
prompt-steered. That is the specific property SeedVR2 lacks, and the reason this
is worth a card rather than another SeedVR2 sweep.

## CORRECTION 2026-08-19: this upscaler ALREADY SHIPS - the real gap is narrower

Checked against the repo, not assumed. `comfy_workflows/ltx_i2v_t2v.json` node
`123` is `LTXVLatentUpsampler`, fed by node `125`
`LatentUpscaleModelLoader` / `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` - the
exact weight this card was written to evaluate. The shipped graph is already a
two-stage regenerative upscale:

1. node `143` `EmptyLTXVLatentVideo` builds the latent at `floor(w/2)` x
   `floor(h/2)` (nodes `155`/`156`), and node `70`
   `LTXVNormalizingSampler` samples it at that half resolution;
2. node `123` upsamples the resulting latent **x2**;
3. node `168` re-runs `LTXVImgToVideoInplace` on the upscaled latent and node
   `39` `SamplerCustomAdvanced` refines at full resolution from
   `sigmas 0.85, 0.7250, 0.4219, 0.0` - a partial denoise, not a fresh sample.

So "can an LTX latent upscale plus a partial-denoise refine produce good
pixels?" is **already answered in production, on the target hardware**. It is
what every LTX generation in the app has been doing.

**What is NOT answered, and is the actual subject of this card:** whether the
same pair works as a **standalone v2v upscale of existing footage**, where the
latent comes from a VAE encode of a video the model never generated. That is a
materially harder input - no matching noise schedule, no generation history,
and whatever codec and grain the source arrived with. Phases 2-5 of `plan.md`
test exactly that, and nothing weaker should be read as a pass.

## Everything needed is ALREADY HERE - verified on the bench 2026-08-16

Checked against `:8188` `/object_info` and the model folders, not assumed:

| Piece | Status |
|---|---|
| `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` | **on disk**, 0.99 GB, `G:\CubricModels\latent_upscale_models\` |
| `LTXVLatentUpsampler` | **core** - `comfy_extras.nodes_lt_upsampler` |
| `LatentUpscaleModelLoader` | **core** - `comfy_extras.nodes_hunyuan`, emits `LATENT_UPSCALE_MODEL` |
| `LowVRAMLatentUpscaleModelLoader` | ~~core~~ **CORRECTED 2026-08-19: `custom_nodes.ComfyUI-LTXVideo`**, same output type - see the VRAM note below. If this reaches the app it needs a `node_lock.json` entry |
| `LTXVTiledSampler`, `LTXVTiledVAEDecode`, `LTXVSpatioTemporalTiledVAEDecode` | present via `custom_nodes.ComfyUI-LTXVideo` |
| LTX 2.3 checkpoint + workflows | already shipped and wired. **CORRECTED 2026-08-19:** the real filenames are `comfy_workflows/ltx_i2v_t2v.json`, `ltx_i2v_t2v_int8.json`, `flow_ltx_extend.json`, `flow_ltx_foley.json` - there is no `_template.json` suffix and no `ltx_v2v_lipdub` |

**So there is nothing to download, no node pack to adopt, no `node_lock.json`
entry and no R2 upload** - which is the entire integration tax that made MPI-506
expensive. This card costs bench time only. **Two caveats added 2026-08-19:**
`LowVRAMLatentUpscaleModelLoader` is a custom node (row above), and the
interpolation arm needs one too (see the correction in the IDEA section).

Note the signature: `LTXVLatentUpsampler` takes `samples` **LATENT** + a
`LATENT_UPSCALE_MODEL` + a `VAE`, and returns **LATENT**. It upscales in latent
space, so it slots into an existing LTX graph rather than being a post-process on
pixels. It is a **x2** model.

## The VRAM question is the one that killed MPI-506 - ask it FIRST

SeedVR2 was not rejected for quality alone. On the 16 GB 4060 Ti, 2x on a ~1 Mpx
source collapsed `frames_per_chunk` to 13, and 3x ran only at the model's
temporal floor of 5, taking 1278s for a **2-second** clip. Fabio: *"if we're
offering a model that can't even do 2x on a 16 GB card, then there's no point in
offering it"* and *"10 minutes for a second, it's just not worth it."*

**Any LTX result that cannot beat that on a 16 GB card is not interesting.** The
existence of `LowVRAMLatentUpscaleModelLoader` and the tiled sampler/decode nodes
suggests the ceiling is better, but that is a hypothesis, not a measurement.

## Questions to answer, in order

1. **Does it run at all on 16 GB**, at x2, on a real clip? Use the same sources
   MPI-506 used so the numbers are comparable:
   `C:\Users\Fabio\Downloads\clip_1774824957518.mp4` (678x1214, 81f, real camera)
   and `ref2v_ms_069.mp4` / the cowboys clip (AI-generated). Evidence lives in
   `C:\Users\Fabio\Downloads\seedvr2-eval\`.
2. **Sharpener or reconstructor?** Re-run the radial-FFT `top/mid` test
   (`detail_vs_sharpen.py`, with the h264 control) against a fixed lanczos
   baseline. **This is the decisive measurement** - if LTX also lands well below
   1.0 it is the same class of tool as SeedVR2 and the semantic-prior argument
   was wrong.
3. **Does it keep an eye an eye?** The failure that started this. Compare the
   same face crops.
4. **Cost per second of footage**, against SeedVR2's ~10 min/s at 3x.
5. **Denoise / conditioning behaviour.** Being regenerative is the whole thesis:
   how much does it invent, is it prompt-steerable, and does identity drift over
   a clip? Drift is the risk that mirrors SeedVR2's flicker.

## Method notes - do not relearn these

- **Bench is `:8188`** (`G:\ComfyUi`, NORMAL_VRAM). The app runs `--lowvram`
  (`routes/comfy.js:432`), so any number that would reach the app needs
  re-measuring under it. MPI-506 never closed that gate.
- **Laplacian variance cannot rank two healthy runs** - it counts grain as
  detail and picked the loser twice. Use it only to detect a within-clip
  collapse; use the radial-FFT `top/mid` for character, and eyes for the verdict.
- **One clip is not enough.** MPI-506's `fpc = 33` "optimum" held on one clip and
  inverted on the second. Test portrait AND landscape, real AND AI-generated.
- Scripts from MPI-506 are reusable:
  `scratchpad/detail_vs_sharpen.py`, `score2.py`, `run_clip.py`.

## Out of scope

App wiring of any kind. If the bench answer is good, the app work is a separate
card - and note MPI-507 now owns the plugin-contributes-a-dropdown-entry
mechanism that MPI-506 was going to build, so a future LTX upscaler entry would
reuse **that**, not rebuild it.

## IDEA (same card): upscale a reduced frame set, then interpolate back

Fabio's own direction, folded in here 2026-08-16 rather than carded separately.
Test it **after** the questions above - it is a variation on whatever sampler
wins, not a competitor to it.

**The idea.** Drop to every Nth frame (or start from a natively low-fps source),
upscale only those, then interpolate back up to the target frame rate. Fabio has
run this manually off **16 fps WAN clips** with better results than a straight
upscale: *"I would upscale them and then interpolate, and then the interpolation
actually does a good job of matching the previous and next frames."*

**Why it attacks BOTH failures MPI-506 measured**, which is what makes it worth
bench time:

1. **VRAM / cost.** Fewer frames per pass is the one lever that reliably moves
   the chunk ceiling. SeedVR2 at 2x collapsed to `frames_per_chunk = 13` of 48;
   halve the frames and the same budget buys twice the temporal context per
   frame - or the run simply fits where it did not.
2. **Temporal coherence.** An interpolator's whole job is matching adjacent
   frames, so it *enforces* the coherence a per-frame or short-chunk upscaler
   cannot. This is the direct answer to the oscillation Fabio reports on faces
   and freckles, and to the flicker risk on MPI-557's `.pth` arm.

**Already on the bench - verified 2026-08-16, nothing to install:**

| Piece | Status |
|---|---|
| `rife47.pth` | on disk, `G:\CubricModels\` |
| `FrameInterpolate` + `FrameInterpolationModelLoader` | core nodes registered, but **UNUSABLE - see the correction below** |
| `RIFE VFI`, `FILM VFI` | present via `custom_nodes.comfyui-frame-interpolation`, **five checkpoints loaded - this is the arm that works today** |

~~The core pair matters: it means this needs no node pack and no
`node_lock.json` entry, unlike the custom-node route.~~

**CORRECTED 2026-08-19.** The core pair is registered but has no models:
`FrameInterpolationModelLoader`'s `model_name` combo comes back **empty**,
because there is no `frame_interpolation` model folder - `rife47.pth` sits at
`G:\CubricModels\` root, which that loader does not read. `RIFE VFI`
(`custom_nodes.comfyui-frame-interpolation`) offers `rife47.pth`, `rife49.pth`,
`rife417.pth`, `rife426.pth` and `sudo_rife4_269.662_testV1_scale1.pth` right
now, so **phase 7 runs on the custom node**. The "no node pack, no
`node_lock.json` entry" claim holds for the upscaler only, not for
interpolation.

**What to measure.** Same instruments as the rest of the card, plus the one thing
that is specific to this shape:

- Does the interpolated result beat the straight upscale on **flicker**? That is
  the claim. Sharpness is not the question here.
- **Does interpolation smear real motion?** The failure mode of every VFI: fast
  motion, occlusion and thin structures (hair, fingers) are where it invents
  mush. A face turning is the honest test, not a slow push-in.
- Cost per second of footage vs the straight upscale - halving the frames should
  more than halve the sampler time, so this may be the cheapest arm on the card.
- **Which N?** 2 (every other frame) is the conservative start. Fabio's WAN case
  is really "the source was 16 fps to begin with", which is a different and
  easier problem than decimating a 24/30 fps clip - do not conflate them when
  reading the result.

`ponytail:` this is a bench idea, not a spec. If it wins, the app-side shape
(a checkbox? automatic below some frame budget?) is a later decision.
