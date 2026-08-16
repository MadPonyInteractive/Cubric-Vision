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

## Everything needed is ALREADY HERE - verified on the bench 2026-08-16

Checked against `:8188` `/object_info` and the model folders, not assumed:

| Piece | Status |
|---|---|
| `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` | **on disk**, 0.99 GB, `G:\CubricModels\latent_upscale_models\` |
| `LTXVLatentUpsampler` | **core** - `comfy_extras.nodes_lt_upsampler` |
| `LatentUpscaleModelLoader` | **core** - `comfy_extras.nodes_hunyuan`, emits `LATENT_UPSCALE_MODEL` |
| `LowVRAMLatentUpscaleModelLoader` | **core**, same output type - see the VRAM note below |
| `LTXVTiledSampler`, `LTXVTiledVAEDecode`, `LTXVSpatioTemporalTiledVAEDecode` | present via `custom_nodes.ComfyUI-LTXVideo` |
| LTX 2.3 checkpoint + workflows | already shipped and wired (`ltx_i2v_t2v_template.json`, `ltx_v2v_lipdub_template.json`) |

**So there is nothing to download, no node pack to adopt, no `node_lock.json`
entry and no R2 upload** - which is the entire integration tax that made MPI-506
expensive. This card costs bench time only.

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

Fabio's other direction, **upscale-then-interpolate** (upscale a reduced frame
set, then interpolate back so the interpolator supplies the temporal coherence),
is NOT carded yet and is independent of this one.
