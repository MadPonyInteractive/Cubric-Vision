# MiniMax H3 Reference (ref2va) — what it actually does

The reference half of H3: ModelDef `minimax-h3-ref2va`, one op `ref2v_ms`, graph
`comfy_workflows/minimax_h3_r2va.json`, transformer `MiniMaxH3ReferenceToVideo`.
Wiring card MPI-475; the hub is [README.md](README.md) and the licence constraint
there governs this card too (same `MODEL_LICENCES` descriptor, so no second dialog).

Installing it on top of fl2va downloads only the 20.97GB transformer — the Qwen3-VL
encoder and both VAEs are the same dep ids.

## Judged 2026-08-07 — on the correct transformer

Read § "Why a plausible result was not evidence" before treating any EARLIER ref2va
result as data. These four are the first judged on the right DiT.

| Run | Result |
|---|---|
| Character reference **sheet**, several clips | Identity holds **well** — this is the model's whole claim and it lands |
| Character sheet **+ reference audio** | The generated woman's **voice matches the audio reference**; resemblance to the sheet good |
| One **image** + one **video** reference | The woman from the image performed the **dance from the video** — motion transfers off a reference video |
| Character sheet + a **dragon video**, multi-stage | "The woman from `<Picture 1>` riding the dragon from `<Video 1>` over the battlefield" — both held, and the two references composed into one scene rather than one winning |
| **No references at all**, prompt only | Works. The ref2va graph handles a bare text-to-video run |

That last row is why `ref2v_ms` is one op with no t2v/i2v split: references never
become frames, so the presence of chips is the only variable and an empty strip is a
valid run, not an error state.

### Lip-sync is NOT established either way

In the sheet+audio clip the subject **did not move her lips**. She was looking at her
phone, so it read as an internal thought rather than a failure — plausible, and the
user accepted it. But that is **one sample with a confound**, so nothing here says
whether ref2va drives mouth motion from a reference audio track. If it matters, test
it deliberately: a subject facing camera, an audio reference that is clearly speech.

## Why a plausible result was not evidence

Both H3 transformers load through the same graph shape. The **fl2va** DiT does not
error when handed references — it samples fine and returns a good-looking video that
**ignored every reference**. Every ref2va result before the 2026-08-07 re-export came
off it, which is exactly how the bug survived: nothing on screen said anything was
wrong. A ref2va run is only evidence if the identity demonstrably follows the
reference.

## Prompt tags are SLOT numbers, rewritten inside the node

The prompt is written against slot numbers — `<Picture 1>` is whatever is wired into
`ref_image_1` — and `MpiH3References` (ComfyUi-MpiNodes `238f056`) rewrites them to
the ordinals core presents, dropping any tag naming an empty slot.

Two consequences worth knowing:

- A tag for a slot you did not fill is **removed** from the prompt, not passed through.
  Core presents no such label, and a dangling tag sends the model looking for a
  reference that is not there.
- Core shares ONE audio sequence between reference videos and standalone clips, and
  emits a video's soundtrack BEFORE its `<Video k>`. So behind a **sounded** reference
  video, a standalone clip whose chip says `Audio 1` is `<Audio 2>` to core. That is
  the rewrite working. Whether a video HAS a soundtrack is a property of the file and
  is unknown until decode time, which is why the translation lives in the node and
  cannot be done by the app or the user.

**Verifying the node is live:** presence in `/object_info` proves nothing — `a603fc4`
registers the same node name, and a running ComfyUI keeps the old module across a repo
pull. The `prompt` tooltip separates them:

```
curl -s http://127.0.0.1:48188/object_info/MpiH3References   # engine; :8188 is the bench
# 238f056 → "Address references by their SLOT number here: …"
# a603fc4 → "Address references by the tags in the ref_tags output: …"
```

## What it costs — measured on a 4060 Ti 16GB, 2026-08-07

A **video reference is the expensive input**, and the cost is not a one-off: reference
tokens ride EVERY sampling step, so a clip's worth of frames multiplies every step.

| Run | Stage 1 | s/step |
|---|---|---|
| Bench, ONE image reference, `match` | — | **11–12** |
| Bench, ONE image reference, `max` | — | 14 |
| 1 image + 1 **video** ref, 1152×640, 2s | 8m38s | **~52** |
| 1 image + 1 **video** ref, 1152×640, 3s | 7m23s | ~44 |

Stage 1 is **10 steps**, not 20: `BasicScheduler` makes 20 sigmas and `SplitSigmas`
cuts at 10, so each stage samples half. Divide a stage's wall time by 10, not 20.

**Moving the split does NOT save time — it reallocates.** Both `SamplerCustomAdvanced`
nodes share one guider, one model and one latent size (there is no upscale between
them), so their per-step cost is identical. `5/15` and `10/10` are both 20 steps and the
same wall clock. The saving only arrives if `BasicScheduler.steps` comes down too:
scheduler 15 with a split at 5 is 5 + 10, ~25 % off. What a smaller split DOES buy for
free is a **2x faster preview**, because `progressStages` runs `preview: 1` = stage 1
alone.

### `scheduler: 'simple'` is a DELIBERATE baseline, not a leftover

Recorded 2026-08-08 so nobody re-derives it. Comfy's own `video_minimax_h3_r2v`
template ships `res_multistep` + `simple` + 20 steps, and ours is byte-identical to it —
but the template's *description* says **"beta or normal scheduler tends to outperform
simple for reference-heavy prompts like this one"**, arguing against the value in the
widget beside it.

We kept `simple` on purpose: ComfyUI's position is that **euler/simple is the neutral
starting point for any sampler or scheduler comparison**, so it is the baseline every
other result should be measured against — not an unexamined default. (Contrast
`--lowvram` in `routes/comfy.js`, which really was an unexamined day-one default; the
difference is exactly that this one is written down.)

### `beta` vs `simple` — TESTED 2026-08-08, NO DIFFERENCE. Do not re-run.

960x544, 1 s, same prompt and seed, run as two ordered pairs on a 4060 Ti:

| order | scheduler | wall |
|---|---|---|
| 1st | `simple` | **167 s** |
| 2nd | `beta` | 141 s |
| 1st | `beta` | **196 s** |
| 2nd | `simple` | **167 s** |

**`simple` reproduced 167 s exactly, twice. `beta` gave 141 s and 196 s** — a 55 s spread
on itself, twice the 26 s "win" the first pair appeared to show. Quality was identical in
every run. The first pair read as `beta` being 16 % faster purely because it ran second.

There is no mechanism for a compute difference and this was checked in the source, not
assumed: `res_multistep` calls `model()` exactly once per iteration over
`len(sigmas) - 1`, with no branch that adds or skips an eval, and `BasicScheduler` at 20
steps yields 21 sigmas under BOTH schedulers. (`beta_scheduler` *does* deduplicate
repeated timesteps, which would cut evals — but only when `total_timesteps` approaches
`steps`; at H3's ~1000 it never fires. Verified by running the scheduler's own arithmetic
across totals 999 down to 20; the first collapse appears at 20.)

**So `simple` stays.** Comfy's template description claims *"beta or normal tends to
outperform simple for reference-heavy prompts like this one"* — measured here on exactly
such a prompt, it does not.

**The general lesson, which cost two runs to learn:** a 1-second clip is the worst length
to time anything on this box. Fixed overhead — weight fault-in, two VAE decodes, the mux —
does not scale with steps, so the same absolute jitter that is 2.5 % across the 7-minute
`match` baselines (7m12 / 7m22 / 7m23) becomes 8-18 % at 141 s. Time per-step changes at
the medium tier or above, never at very_low.

**Do not read a slow run as a memory problem without checking GPU utilisation first.**
On the 8m38s run: dedicated VRAM 13.3/16GB, shared 24.1GB, system RAM 60.6/63.8 —
which looks like thrashing, and is not. GPU utilisation was **98%**, so the card was
compute-bound, not starved by streaming. Those memory figures are simply what 53GB of
weights on a 16GB card looks like: the log stages 25140MB of text encoder and 19995MB
of transformer, and the app's own trade table already says 12GB VRAM → ~48GB RAM.

13.3/16 dedicated is the practical ceiling, not a cap: ComfyUI reserves ~600MB on
Windows (`EXTRA_RESERVED_VRAM`) plus a 0.8GB inference minimum, and the desktop holds
the rest. `--lowvram` in the engine's launch line is a **no-op** here — its own
`cli_args.py` says "Doesn't do anything if dynamic vram is enabled", and
`enables_dynamic_vram()` is true unless `--highvram/--gpu-only/--novram/--cpu/
--disable-dynamic-vram` is passed, none of which the app passes.

## Controls

- **Reference detail** (`ref_image_size`) — `match` is the default and the baked value;
  `max` raises s/step noticeably (11–12 → 14 with ONE reference on the bench, and
  reference tokens ride every sampling step, so more references is steeper). **If `max`
  costs nothing, the control is not reaching the node** — check the injected
  `Input_Refs.ref_image_size` key.
  **`max` usually gives the better result** (user, 2026-08-07) — but the default
  **stays `match`, and this is SETTLED, not open** (user, 2026-08-08): it is a user
  control, so the user decides per generation. Do not re-raise a default flip.
  **Use `max` for a character sheet** — that is the case where identity fidelity is the
  whole point and the extra s/step is worth it. This guidance used to live in the
  control's own `info` tooltip; it was moved here 2026-08-08 because that string had
  grown to 249 chars against a 57-108 house norm and the status bar truncated it
  mid-sentence. The tooltip now carries only the two options and the trade.
  **VRAM is not the limit at `max`** — measured 13.0 / 16 GB on a 4060 Ti during a `max`
  run with two references (user, 2026-08-08), i.e. 3 GB still free. The cost is time,
  not residency, which matches `very_high`'s 13.2/16 reading in `ratios.js`.

### `max` vs `match` — the A/B, same prompt and inputs (user, 2026-08-08)

A 2688x2688 character sheet plus a reference video, 1152x640, on a 4060 Ti:

| | wall clock | verdict |
|---|---|---|
| `match` | **7 min** | baseline |
| `max` | **12 min** | **better overall quality, better cinematics**; adherence about the same |

**~1.7x for a real quality gain**, which is why the control ships with both and the
default is not the question ([[settled above]]). Note what `max` actually does with a
sheet that large: it caps the reference at a **2048px edge**, so a 2688px sheet is
downscaled to 2048 — `max` is a ceiling, not "full resolution". At `match` the same
sheet is fit to the 1152x640 output instead, which is the whole 1.7x.

This also answers the standing question of whether reference tokens dominate per-step
cost: raising ONLY the reference resolution, with the output canvas identical, moved the
run 7 -> 12 min. They ride every step, and they are expensive.
- **No negative prompt.** `negativePrompt: false`, because the graph carries no
  `Input_Negative` and no `Input_Negative_Audio` — dropping the toggle removes both
  fields at once rather than shipping two that inject nowhere.

## The "2K H3" you see online is not this model

Local is **H3-Base only, 768p short edge**. Two pieces of MiniMax's product are NOT in
the open weights (MPI-449 § 1):

- **H3-Regenerate-2K** — the 768p→2K second pass. This is what the 2K clips are.
- **H3-Context-IR** — the hosted prompt-refinement front end, which MiniMax itself calls
  "critical to quality".

Note what Context-IR is and is not: it refines the **prompt**, not the picture. It is not
a hi-res fix and has no bearing on output resolution.

So a 2K result posted online is the hosted API, not a local ComfyUI graph, and no local
setting reproduces it. Sampling H3-Base at a 2K canvas is a different thing: nothing
enforces the area cap on the output latent, so it RUNS, and the cost is quadratic —
2.09MP measured at 1537s on a 4060 Ti, so 2560×1472 (3.77MP) is roughly 3x that PER
STAGE before references.

**But it holds up far better than "expect artifacts" implies.** Run bare on the engine at
2560×1472, 2026-08-07: **stage 1 alone looked like a finished 1K product** (~544s). The
`very_high` warning in `js/utils/ratios.js` — "above the trained canvas … so expect
artifacts" — is more pessimistic than what H3 actually does at 3.77MP. Treat the ladder's
ceiling as a COST limit first and a quality limit second.

**The second pass we actually have is the universal `videoUpscale` op** —
`comfy_workflows/video_upscale.json`, a video canvas tool, not model-tied. It loads the
clip and either scales by `Input_Upscale_Factor` (lanczos, default ×2) or runs
`4x_NMKD-Siax_200k.pth` through `ImageUpscaleWithModel` and corrects to the exact factor
with lanczos, chosen by `Input_Upscale_Using_Model` (default off). Generate at native
1344×768, then upscale ×2 with the model path on → 2688×1536.

What that buys and what it does not: a spatial upscaler sharpens and cleans, it does not
invent identity detail that was never sampled, and it introduces artifacts of its own.
The user's verdict 2026-08-07 is that it is **a placeholder, not an answer**.

### A hi-res fix is the real candidate, and the graph already has the seam

The classic shape — sample low, upscale the latent, finish the denoise high — maps onto
this graph exactly. `BasicScheduler` makes 20 sigmas, `SplitSigmas` cuts at 10, and
`MpiStageLatents` (node 320) already carries the latent between the two sampler passes.
Run stage 1 at native 1344×768, upscale the latent there, run stage 2's low sigmas at 2K,
and only the second half of the denoise pays the 2K price.

**Core's latent upscale CANNOT do it — confirmed on the bench 2026-08-07**, not predicted:

```
Node Type: LatentUpscaleBy
AttributeError: 'NestedTensor' object has no attribute 'reshape'
```

`common_upscale` reshapes the latent, and H3's is the video+audio PAIR — the same family
of failure that made `MpiSaveLatent` necessary (core's `SaveLatent` dies on the missing
`.contiguous()`). It bites on the POST-stage-1 latent specifically, which is exactly
where a hi-res fix has to cut.

**Core's node is also wrong about size, silently.** `LatentUpscale` converts pixels to
latent cells with a hardcoded `width // 8` — the SD VAE factor. H3's video latent is
`/16`, so a pixel target comes out at DOUBLE:

| typed into core's node | latent | actual H3 pixels |
|---|---|---|
| 1344 × 768 | 168 × 96 | **2688 × 1536** |
| 672 × 384 | 84 × 48 | 1344 × 768 ✓ |

So core's node only lands the right canvas if you type HALF, which is a footgun in a
shared graph. `LatentUpscaleBy` sidesteps the divisor (it scales latent dims directly)
but cannot hit an arbitrary target — and in the H3 ladder **no tier is 2× another**, so
`scale_by 2.0` never lands on one. In the wider ResolutionSelector megapixel list there
is exactly ONE clean pair: **0.5MP `960×544` → ×2 → 2.0MP `1920×1088`**.

**`MpiLatentUpscale` (ComfyUi-MpiNodes `latent.py`) exists for this.** It unbinds the
pair, upscales only the half with spatial dims (selected by `dim() >= 5`, not by index,
so a reordering cannot break it silently), passes the audio half `[B,32,2,T]` through
untouched, and re-nests. It takes the target in **pixels** with a `stride` input (16 for
H3 and Krea2, 8 for the SD/SDXL family) so the number you type is the number you get.

### It RUNS, and it adds real detail — bench, 2026-08-07

The DiT does tolerate a resolution change at partial denoise. Stage 1 at 672×384 →
`MpiLatentUpscale` → stage 2 at 1344×768 finished and came out **visibly more detailed
than the un-upscaled version**. Three things had to be right, and the first attempt got
none of them:

- **Upscale `denoised_output`, not `output`.** `output` is the latent AT sigma 10, still
  carrying its noise; `nearest-exact` replicates cells, so that noise arrives stretched
  and blocky and the model does not recognise it. The first attempt produced pure noise.
- **`RandomNoise` on stage 2, not `DisableNoise`.** A hi-res fix upscales a CLEAN latent
  and re-noises it for the new resolution.
- **Its own `BasicScheduler` at `denoise 0.5`**, not `SplitSigmas`' low half —
  `total_steps = int(steps/denoise)`, so `steps 10 / denoise 0.5` starts at the step-10
  sigma, which is where stage 1 stopped.

### Two costs, and the second one decides where this is useful

**The audio breaks.** H3 emits video and audio from ONE joint latent, and the audio half
(`[B,32,2,T]`, no spatial dims) is bound to the video half's token layout. Rescale the
video mid-denoise and the audio is aligned against something that moved; on top of that,
an x0 estimate at step 10 is a soft-but-valid IMAGE and a garbled waveform. A video-only
model has no such coupling to break.

The way out is **a different technique, not a fix to this one** — worth keeping the two
apart:

| | split-sigma hi-res fix | full pass + refiner |
|---|---|---|
| Stage 1 | 10 of 20 steps, trajectory cut in half | **all 20 steps** — a complete, valid generation |
| Stage 2 | resumes the same trajectory at a new size | a SEPARATE img2img-style pass, `denoise < 1` |
| Audio | broken — the trajectory never completed | **intact**, pass 1 finished it properly |

The refiner shape needs no new node: the graph decodes video and audio separately and
`Output_Video` takes them on separate inputs, so take **audio from pass 1's decode** and
**images from the refiner's**. Pass 1's audio is fully denoised and was never disturbed.
That only holds while the motion still lines up between the two, which is what caps
`denoise` — sync sets the knob, not detail.

**Composition is decided at the stage-1 canvas — and this is structural on ref2va.**
`MiniMaxH3ReferenceToVideo` sets `minimax_refs` and never `minimax_keyframes`: references
never become frames, so NOTHING anchors the framing and the model composes for whatever
canvas it is sampling on. Measured: the same prompt and seed framed a close shot on the
dragon's head at 672×384 and staged the whole scene at 1344×768. So a hi-res fix here
does not upscale a shot, it **locks in the composition the small canvas chose**.

Consequence — **do not start below native on ref2va.** Put stage 1 at 1344×768, where H3
frames properly, and hi-res fix UP to 1920×1088 or 2K. And expect this technique to be
much better behaved on **fl2va i2v**, where the first frame pins the composition and a
small stage 1 cannot wander.

## Still unchecked

Not defects, just untested as of 2026-08-07: the `max` vs `match` cost on this card,
the `<Audio 2>` shift in a live run (only visible via `ref_tags` on the node output),
the 15-chip strip scroll, and the status bar reading `1/2` then `2/2` across a run.

The ModelDef still borrows fl2va's `minimax_h3_preview.mp4` as its card video, and
that **stays** — the user's call on 2026-08-07, after the judged clips existed. Do not
re-raise it as an open item; it is a decision, not a leftover.
