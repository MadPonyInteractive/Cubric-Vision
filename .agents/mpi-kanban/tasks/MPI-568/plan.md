# MPI-568 Plan - LTX spatial upscaler bench evaluation

Bench evaluation only. No app wiring, no plugin, no dropdown - see `brief.md`
§ Out of scope. `Ownership:` bench artifacts and this card's workspace only.

**Verify mode:** `user-ux` - the numeric arms self-verify, but the verdict that
closes this card is Fabio's eyes on a face crop. MPI-506 was decided by *"the
iris is almost square"*, not by a number.

## Current State

2026-08-19, later session. Both blockers cleared: Fabio's eye verdict is in and
the wavy distortion is root-caused (LTX VAE round trip, ~2x amplified by the
temporal upscaler). The temporal arm is CLOSED NEGATIVE. x1.5 does NOT solve the
VRAM ceiling. **The card's live thread is now the CHANGE-CONTROL OP**, because
Fabio's target is sigma 0.85's look with a separate dial on drift, and sigma
cannot be that dial.

**Detail transfer is built, measured and half-validated:** it fixes structural
hallucination and grade drift (63% less drift at full reconstruction, no GPU,
adjustable after the run) and is powerless against INVENTED TEXTURE - Fabio saw
invented veins on the face, worse at 100% than 70%.

**The split-radius sweep is DONE and NEGATIVE** - radius does not separate
invention from reconstruction and r=10 was already at the optimum. But the
measurement built to prove that named the control that does work: an
EVIDENCE-GATED transfer, which suppresses the veins and the invented dots while
keeping the lash line and the zipper. Built, self-checked, rendered at full
length as `FULL_gated132.mp4`.

**The gate got its eye verdict and it is a PARTIAL PASS with a new defect** - the
veins went, the speckles did not all go, expressions were lost, and the face
picked up something that reads like bad interpolation. See the verdict section.

**THE PROMPT LEAD IS CONFIRMED AND FIXED AT SOURCE.** The A/B ran; Fabio's
verdict on `PROMPT_cheek_f12.png` is *"I can clearly see two moles, which
probably were the model's attempt at doing freckles."* The graph's default
positive prompt was ordering the artifact every downstream dial was built to
remove. `build_v2v.py`, `sweep.py` and `full_arms.py` now default to
`"a woman in close up"`. **Every arm on this card produced before 2026-08-19 ran
the freckle prompt and is contaminated by it** - including
`full_s085_x2_00001.mp4`, which is the base the detail transfer, the radius
sweep and the evidence gate were all measured against.

**THE PRODUCT IS ONE SLIDER AND EVERY POST-PASS CONTROL IS DEAD.** *(Superseded 2026-08-19 - see THE SHIPPING SHAPE above. The POST-PASS half of this stands and is still closed; the "one slider" half does not, because `cfg` is a sampler parameter that was never tried, not a post-pass dial that failed.)* Three things
closed today, in order:

1. **The prompt was ordering the speckles.** Confirmed by eye, fixed at source.
   `nb_s085_x2_00001.mp4` vs its contaminated twin: old cheeks speckled, new ones
   clean, two independent frames. Six words, no filter.
2. **Sigma 0.50 PASSED the ship/no-ship watch** - *"the best result we had so
   far"* - and **0.85 stays on the slider** as a user-chosen trade (Fabio's call;
   the card had wrongly ruled it out). Range ships 0.15 - 0.85.
3. **The detail transfer and the evidence gate are CLOSED NEGATIVE**, root-caused:
   the donor regenerates the PERFORMANCE, not just the texture, so transferring
   its high frequencies stamps one expression onto another - *"eyes open and
   closed at the same time"*. Every post-pass dial on this card died with it.

**Target 1 (low-res AI -> bump) is MEASURED and a default is recommended:
`sigmas 0.50`, range 0.15 - 0.85.** See TARGET 1 RESULT. On this source class the
low end compresses (0.15-0.50 cluster tightly), 0.85 no longer replaces the
person, and the one place the op loses to lanczos is fast motion, where the VAE
round trip softens hard edges.

**BOTH TARGETS ARE MEASURED AND BOTH HAVE FABIO'S VERDICT.** Target 2's four
arms are in (512/478/680/732s, peak 14921-15555 MB) - **the VRAM ceiling is
closed, 4.13 Mpx fits in one pass with room**. See TARGET 2 RESULT.

### HANDOFF NOTE, 2026-08-19 15:19 - the cfg range run NEVER STARTED

`cfg_range.py` (cfg 2 / 5 / 7 at sigma 0.85, red-biker clause) was launched under
the GPU lease and **never acquired a slot** - a peer session holds GPU 0 running
a krea2 batch for MPI-504. It was still printing `all 1 GPU slots busy, waiting`
at handoff, so it is reaped with this session and **nothing was queued to
ComfyUI**. Re-launch it; do not go looking for `cb_s085_cfg2/5/7` outputs first.

**This is the second time on this card that a background runner died at a session
boundary**, and the first time it was silent: the previous session's ladder had
posted `hi_s050` and was reaped before posting `hi_s085`, which read as "the
ladder finished" because three of four arms were on disk. **Check the queue and
the arm list against the script's ARMS, not the output directory.**

## THE SHIPPING SHAPE - decided 2026-08-19

**THE PRODUCT IS TWO SLIDERS NOW, NOT ONE. This reverses the card's headline
decision, deliberately and with Fabio's call on the record.** "One slider is the
product" was written when every candidate second control was a POST-PASS dial on
a finished frame, and every one of those is still closed negative. `cfg` is not
one of them - it is a sampler parameter the graph had pinned at 1, which is no
guidance at all, and unpinning it measurably amplifies prompt steering 2.4x
without breaking the distilled transformer. A closed door and an untried door are
not the same door.

| control | range | default | status |
|---|---|---|---|
| `sigmas` (detail / reconstruction) | **0.50 - 0.85** | 0.675 recommended | **range DECIDED by Fabio; default still his to confirm** |
| `cfg` (exposed as **prompt strength**) | to be measured | to be measured | **DECIDED in principle by Fabio**; `cfg_range.py` is mapping where it breaks |

**The range narrowed from 0.15-0.85 to 0.50-0.85** because 0.15 and 0.30 were
rejected by eye on all three source classes, with a failure mode - temporal smear
that reads as fake motion blur - that a still cannot show. Nothing below 0.50 has
ever won on this card.

**0.675 is the recommended default and is NOT yet Fabio's pick.** It is the same
person on both source classes, sits 41% of the way to 0.85 on both, and adds only
speckle-scale invention. 0.75 is the last rung before a face starts to move. Do
not let a descriptor default get written from this line without asking him.

**`cfg` needs its range before it can be specified.** It is known at exactly two
points - 1 (pinned, no guidance) and 3 (works, 2.4x steering, clean). Two points
do not define a slider. `cfg_range.py` runs 2 / 5 / 7 at sigma 0.85 to find the
useful floor, whether steering saturates, and where a distilled model breaks.

**Still open, and not decided by the above:**

1. **Audio pass-through** - Fabio's call is whatever comes in goes out. The
   bench drops it (`VHS_LoadVideo` is video-only). App-side, needs to exist in
   whichever card ships the op.
2. **The op is still bench-only.** Turning it into a real Flow/op is out of this
   card's scope by its own brief, so it needs its own card.

**In flight, both cheap:** `cb_s085_pdress` / `cb_s085_pred` test Fabio's claim
that 0.85's inventions are prompt-steerable (with a contradictory-garment
sensitivity control), and `hi_s085_p` re-runs target 2's top rung with a prompt
that actually matches its footage, to close the ladder's one known confound.

**MPI-578 created** for the LTX 2.5 upscaler bump, `todo` / `blocked` on the
ComfyUI engine bump. v1 ships on 2.3 - Fabio's call.

The GPU is arbitrated by the machine-global lease now
(`<mpi-lib>/scripts/gpu_lease.py`), not by asking - wrap a sampler run and it
queues behind whoever holds the slot.

Earlier state, unchanged: bench `:8188` up (NORMAL_VRAM). Phases 1 and 2 done.

**The v2v graph works.** Built at
`<scratchpad>/build_v2v.py` (21 nodes, authored rather than carved out of the
135-node production graph). First run passed: 672x1216 -> **1344x2432**, 25
frames, **101s, peak 14686 MB of 16380**. Output verified with ffmpeg, not
assumed.

Two things the graph had to get right, both non-obvious:
- **The audio half is not optional.** The LTX 2.3 transformer takes a
  *concatenated* AV latent, so a video-only latent is not a legal input. An
  `LTXVEmptyLatentAudio` of the matching frame count stands in for the source's
  audio, then `LTXVSeparateAVLatent` drops it before decode.
- The bench only carries the **int8** transformer
  (`..._int8_convrot.safetensors`), not the bf16 one `ltx_i2v_t2v.json` names.
  That is the `ltx_i2v_t2v_int8.json` twin, so the graph is comparable - but it
  is a quantised model and any quality verdict inherits that.

**Sources.** Clip A = `clip_1774824957518.mp4`, 678x1214, 30 fps, 81 frames, real
camera, portrait - the MPI-506 clip, so numbers compare. Clip B = a 49-frame cut
of `wan-2.2-5b.mp4`, 1280x704, 16 fps, AI-generated by a **non-LTX** model, which
matters: an LTX-generated source would let the upscaler reconstruct its own
output distribution and flatter itself. **MPI-506's AI source is gone** - only
its derived `CB_*` outputs survive in `seedvr2-eval/` - so clip B is a
substitute, not the same clip.

**Preliminary Q2 read** (25-frame wiring output, only 4 frames hit the sampler's
`mod(n,7)` selector, so this is indicative and NOT the reported number):
LTX x2 `top/mid` **0.58**, mid gain 2.46, top gain 1.44; h264 control **0.99**
(MPI-506's control was 1.06 - consistent). SeedVR2 at 2x was **0.43**. So LTX is
better, and on the same side of 1.0. Do not conclude from this yet - two
confounds are unmeasured, and both plausibly depress the top band:
`LTXVPreprocess(img_compression=18)` deliberately degrades the input before the
VAE sees it, and `sigmas 0.85` is a light refine. **Both get an A/B before any
verdict** - see the drift note.

### Q1 IS ANSWERED, and it clears MPI-506's bar decisively

**81 frames, 672x1216 -> 1344x2432 (3.27 Mpx), ONE pass, 278s, peak 15898 MB of
16380.** That is 103 s per second of footage.

The headline is not the time, it is **"one pass"**. SeedVR2 at 2x on a
comparable source collapsed to `frames_per_chunk = 13` and had to chunk; LTX
took all 81 frames in a single sampler invocation. **There is no chunk boundary,
so the oscillation-on-faces failure mode Fabio reported cannot occur by
construction.** That is a structural difference, not a tuning win.

Caveats that are not optional when quoting this: NORMAL_VRAM bench (the app runs
`--lowvram`), the int8 transformer, and 97% of the card's VRAM used - there is
almost no headroom, so a longer clip or a bigger source will not fit.

### The metric cannot rank these runs on its own - the no-op control proved it

The control run (`no_sample=True`: latent upsampler + VAE decode, no sampler at
all) scores `top/mid` **0.69**, mid gain 1.82, top gain 1.25, in **20s** at
10374 MB.

That is *better* than the sigma-0.85 run's 0.58 - and it looks like **mush**.
Side by side (`SHEET_control_f12.png`) it is visibly worse than plain lanczos:
smeared hair, warped collar. Its "top gain 1.25" is measuring smear, not detail.

**So `top/mid` cannot rank runs across pipeline variants**, only within one.
MPI-506 already knew laplacian variance could not rank two healthy runs; this
extends the same warning to the radial-FFT ratio, and it matters because that
ratio is the number the whole card was going to be decided on. Two consequences:
- The pipeline's **no-op floor is 0.69, not 1.0**, so LTX's 0.58 is not
  comparable to SeedVR2's 0.43 without knowing SeedVR2's own floor. SeedVR2 is a
  direct pixel model with no VAE, so it probably has none - but that asymmetry
  has to be stated, not assumed away.
- **The refine pass is load-bearing.** The latent upsampler alone does not
  produce usable pixels. Any future "just use the upsampler, it is cheap"
  suggestion is answered by this control.

### Phase 4/5 answer: the sigma IS the product, and 0.85 is the wrong end of it

Sweep at 25 frames, clip A, same seed throughout. `top/mid` first, then what the
pixels actually show:

| run | mid gain | top gain | top/mid | time | peak MB |
|---|---:|---:|---:|---:|---:|
| h264 control | 1.04 | 1.03 | 0.99 | - | - |
| no sampler (floor) | 1.82 | 1.25 | 0.69 | 20s | 10374 |
| sigma 0.15 | 1.82 | 1.36 | 0.74 | 69s | 15844 |
| sigma 0.30 | 1.78 | 1.25 | 0.70 | 49s | 15822 |
| sigma 0.50 | 1.47 | 1.24 | 0.85 | 65s | 15891 |
| sigma 0.85, compression 18 | 2.46 | 1.44 | 0.58 | 101s | 14686 |
| sigma 0.85, compression 0 | 1.91 | 1.35 | 0.71 | 65s | 15746 |
| sigma 0.30, compression 0 | 1.62 | 1.27 | 0.78 | 50s | 15827 |

**`img_compression` was a real confound and is now measured.** Dropping it 18->0
at sigma 0.85 moves `top/mid` 0.58 -> 0.71, by cutting *mid* gain 2.46 -> 1.91.
It was degrading the input and the model was re-adding mid-band structure, which
is precisely the signature the test reads as "sharpener". **Set it to 0 for a
v2v upscale**; the 18 in the shipped graph is there to make a *conditioning
image* match LTX's training statistics, which is a different job.

**Every arm still lands below 1.0, so on the card's stated criterion LTX fails
the same test SeedVR2 failed.** That criterion should not be trusted here:
- the pipeline's no-op floor is 0.69, so 1.0 was never reachable;
- the floor run *outscores* the visibly-best runs while looking like mush.

**What the pixels show, which is the opposite conclusion** (`EYE_zoom_f12.png`,
`SHEET_ladder_face_f12.png`, `DRIFT_f2/f12/f22.png`):

1. **sigma 0.85 replaces the person.** Not drift, not flicker - a different
   woman, different face, hair and skin tone, *consistently the same different
   woman* at frames 12 and 22. LTX's temporal coherence is working perfectly; it
   is just coherently rendering someone else. Alignment was checked first
   (`align.py`, offset 0 wins cleanly at 0.2234 vs 0.2863 at +/-1), so this is
   not a frame-offset artifact.
2. **sigma 0.15-0.50 preserve identity** and are clearly sharper than lanczos.
3. **It reconstructs from real evidence.** At 3x nearest zoom on the nose, the
   lanczos baseline carries a faint few-pixel bright speck; at sigma 0.30 that
   resolves into a defined nose stud with a highlight. The information was in
   the source and the model used an object prior to resolve it - **exactly the
   property SeedVR2 lacked when it made an iris square.** The radial-FFT test
   cannot see this at all.

So the honest phase-4 verdict is a split one: **the metric says sharpener, the
eyes say reconstructor, and the metric is the one with the demonstrated fault.**
Phase 5 is effectively answered along with it. Verdict still goes to Fabio.

### The 16 GB peak is a PRODUCT constraint, not just a bench number

Found 2026-08-19 the hard way: clip B's first arm ran 25+ minutes against an
expected ~4, because Fabio was generating in the app at the same time. The app
engine (`:48188`) and the bench (`:8188`) are two ComfyUI processes on **one**
16 GB card.

This graph peaks at **15898 MB of 16380 - 97%**. So:

- **It cannot coexist with a loaded app engine.** If this ever ships, a user with
  Vision open cannot run the upscale unless the app unloads models first. That is
  a wiring question for the app card, and it is better to know now than after
  someone builds the UI.
- **Every timing on this card was measured on a shared GPU.** Clip A's sweep
  numbers were tight and mutually consistent (49-101s), which reads as
  uncontended, but that is inference, not proof. **Re-time the chosen arm on a
  clear card before any of these numbers are quoted anywhere.**
- MPI-506's timing trap was cold-vs-warm. This is a second one, on the same axis,
  and neither is visible in the number itself.

### Fabio's question reframed the card: sigma is not the only knob

Asked 2026-08-19, looking at the sweep sheets: *"S085 looks really good, but it
lost identity. Do we have any control over how much is changed?"*

That is the right question and the plan had the wrong shape for it. The card
treats "how much does it invent" as a property to *measure*; it is actually a
property to *control*, and there are two independent controls, not one:

1. **`sigmas`** - how much the sampler regenerates. Swept; see the table above.
2. **`LTXVAddGuide.strength`** - how hard the output is pinned to the source.
   **The graph up to this point used no guide at all**, which is why sigma and
   identity were welded together: with no guide, the only thing tying the result
   to the footage is the noised latent, and at sigma 0.85 that latent is 85%
   noise. Nothing was holding the person, so the model rendered a different one.

The shipped `ltx_i2v_t2v.json` already uses this node at **strength 0.7** (nodes
321/323), but only on single start/end frames for i2v. Feeding it the **whole
clip** is the experiment. Node `34` in `build_v2v.py`, with `LTXVCropGuides`
after separation exactly as the shipped graph does at node 335.

`LTXVAddGuide` also takes an optional **`attention_mask`** - "per-region
conditioning influence, multiplied by strength". So a later version could pin the
face hard and let hair, fabric and background regenerate freely. That is a
product-shaped control and it should be on the app card if this ships.

### A third instrument: fidelity (`fidelity.py`, self-checked)

Ranking eight runs on identity needs a number, not eight side-by-sides.
Structural agreement with the lanczos baseline, per-frame brightness/contrast
normalised so a grade shift does not read as identity loss, reported whole-frame
and over the face region:

| run | drift | face drift |
|---|---:|---:|
| sigma 0.30 c0 | 0.135 | **0.149** |
| sigma 0.50 | 0.143 | 0.171 |
| sigma 0.85 | 0.222 | **0.312** |

Face drift more than doubles at 0.85, which is the visual verdict as a number.
**Read it only next to a sharpness number** - a heavy blur also scores well here,
and the no-sampler control already proved that exact trap on the FFT test.

### GPU is shared with Fabio - stop when asked

He works on the same card. When he says he needs it: kill the runner, then
`POST /interrupt` **in a loop** (ComfyUI only acts on it at a step boundary, and
one POST is not enough on long steps), then `POST /free` with
`{"unload_models":true,"free_memory":true}`. Bench jobs survive killing the
client - the job is server-side, so the client kill alone frees nothing.

### TRAP: `LTXVAddGuide` rescales the guide with BILINEAR - feed it at target res

Cost a whole guide sweep (five runs, ~15 min) that had to be thrown away.

`LTXVAddGuide.encode` (`comfy_extras/nodes_lt.py`) does:

```python
target_width  = int(latent_width  * width_scale_factor  / latent_downscale_factor)
pixels = comfy.utils.common_upscale(images.movedim(-1, 1), target_width, target_height,
                                    "bilinear", crop="center").movedim(1, -1)
```

So it silently resamples whatever image it is handed up to the target latent
size, **with bilinear**. Hand it source-resolution frames against a 2x-upscaled
latent and the model is pinned to a *bilinear 2x upscale of the source* - a
blurry reference. It does not error. It just teaches the model to be soft, and
the result reads as "the guide oversoftens at high strength", which is a
plausible and completely wrong conclusion.

**Always resize the guide to the target resolution with a good resampler
first.** The shipped `ltx_i2v_t2v.json` does exactly this - node `516`
`ImageResizeKJv2` at the full 704x1216 with `lanczos`, then `541`
`LTXVPreprocess`, then the guide. `build_v2v.py` now mirrors it (nodes 14/15).

The visual tell, in hindsight: at guide 0.1 and 0.2 the face had an **open mouth
with teeth** while the source has pursed lips. A guide genuinely pinning the
source cannot do that. Numbers alone did not catch it - the sheet did.

**Every `g0*` arm measured before this fix is VOID.** Re-running as `fx_g*`.

### The THIRD upscaler, and the one this card should have started from

Fabio, 2026-08-19: *"LTX has two different upscalers: a temporal upscaler and
one other upscaler. I think we only have one on file."* Correct, and it is
actually three. `Lightricks/LTX-2.3` on HF - the source MPI-127 recorded for the
spatial weight - carries:

| file | size | status |
|---|---:|---|
| `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` | 0.99 GB | already had it |
| `ltx-2.3-temporal-upscaler-x2-1.0.safetensors` | **0.24 GB** | downloaded 2026-08-19 |
| `ltx-2.3-spatial-upscaler-x1.5-1.0.safetensors` | **1.02 GB** | downloaded 2026-08-19 |

**No new node, no node pack, no `node_lock.json` entry.** All three are the same
`LatentUpsampler` class and hit the same branch key
(`post_upsample_res_blocks.0.conv2.bias`) in `LatentUpscaleModelLoader`, so
`LTXVLatentUpsampler` runs them unchanged - the node reads its behaviour from the
file's `config` metadata:

| | spatial x2 | temporal x2 |
|---|---|---|
| `spatial_upsample` | true | **false** |
| `temporal_upsample` | false | **true** |
| `spatial_scale` | 2.0 | **1.0** |
| `rational_resampler` | false | true |
| `mid_channels` | 1024 | 512 |

**The temporal upscaler doubles FRAMES at constant resolution - a frame
interpolator inside the LTX latent space.** That is phase 7's
"upscale-a-reduced-frame-set-then-interpolate" done natively, and it is a
strictly better-founded route than RIFE on decoded pixels: no leaving the latent
domain, no second model's failure modes. It also stands alone as a capability
(frame-rate doubling, slow motion). `build_v2v.py` takes `upscaler=` and
`temporal_after=` so the two can be chained in one graph.

**The x1.5 spatial is also new to us** and is the honest answer to the VRAM
ceiling: 1.5x of a 0.82 Mpx source is 1.8 Mpx against x2's 3.27 Mpx, which is the
difference between fitting on a 16 GB card and not.

### The temporal upscaler WORKS, and it is the cheapest thing on this card

> **SUPERSEDED on quality, 2026-08-19** - see "THE GROUND-TRUTH REDO" below. The
> cost numbers here stand; the 22%/28% quality figures and the "closes phase 7 in
> the affirmative" conclusion do not. Do not quote this section's quality claims.

Measured 2026-08-19, clip A:

| run | time | peak VRAM | in -> out |
|---|---:|---:|---|
| spatial x2 + sampler | 65-224s | 15.7 GB | 25f -> 25f @ 1344x2432 |
| spatial x2, no sampler | 20s | 10.4 GB | 25f -> 25f @ 1344x2432 |
| **temporal x2, no sampler** | **16s** | **4.0 GB** | **25f -> 49f @ 672x1216** |
| temporal x2 (13 frames in) | **8s** | 6.2 GB | 13f -> 25f @ 672x1216 |

It respects LTX's 8n+1 rule exactly (25 = 8*3+1 -> 49 = 8*6+1) and leaves the
resolution alone, as its `spatial_scale: 1.0` says it should. **4 GB** is the
number that matters: it runs comfortably where the spatial+sampler path sits at
97% of a 16 GB card.

**It is a real interpolator, proved against ground truth.** Feed it every OTHER
frame (13 of 25) and compare the frames it invents against the 12 real ones
withheld - the only arm on this card with a true reference for invented content:

| invented frames only, vs withheld truth | drift | face |
|---|---:|---:|
| **temporal upscaler** | **0.128** | **0.129** |
| naive frame duplication | 0.165 | 0.180 |

22% better overall, 28% on the face - **and that understates it**, because the
temporal path pays a ~0.060 VAE round-trip penalty on every frame that the
duplication control does not pay at all. Read the whole-clip numbers with that
in mind: measured over all 25 frames the naive control appears to *win*
(0.086 vs 0.106), purely because it keeps 13 bit-exact frames. **Comparing
whole-clip totals across a VAE path and a non-VAE path is the trap here;**
isolate the invented frames or the answer inverts.

Visually (`TEMPORAL_invented_f6.png`): the invented frame matches the withheld
real one in pose and detail, with no smeared hair - the VFI failure mode the
card told us to watch for did not appear on this clip. The duplication control
is visibly off-pose beside it.

**This closes phase 7's question in the affirmative and by a better route than
the card proposed.** No RIFE, no `comfyui-frame-interpolation`, no decoded-pixel
round trip, no second model's failure modes - and no `node_lock.json` entry,
which the RIFE route would have needed (see the phase 1.3 correction).

### Guide sweep, re-run after the resolution fix - conclusion UNCHANGED

The bilinear trap was real but immaterial to the outcome:

| guide 0.2 | mid | top | top/mid | face drift |
|---|---:|---:|---:|---:|
| bilinear guide (void) | 0.70 | 0.93 | 1.33 | 0.200 |
| lanczos guide (fixed) | 0.76 | 0.98 | 1.28 | 0.217 |

**The guide softens for a structural reason, not a wiring one: the guide IS the
source.** It carries no information the upscale does not already have, so
pinning to it can only pull the result back toward source sharpness. There is no
guide strength that buys sigma 0.85's look with the right person, because the
two come from opposite directions. `sigma 0.30` with no guide still beats guides
0.1-0.2 on *both* axes at once.

**Still worth one test before closing that line:** `LTXVAddGuide`'s
`attention_mask`. Pinning only the FACE hard while leaving hair, fabric and
background unguided is a different proposition from pinning the whole frame, and
it is the one configuration where high-sigma regeneration could run free where
detail is wanted and be held where identity is. Untested.

### FABIO'S VERDICT ON THE TEMPORAL ARMS, 2026-08-19 - read before trusting the numbers above

He watched both clips. Three findings, and the third partly undercuts the
metrics:

1. **`temporal_only` looks no different from the original.** Expected - it
   changes frame COUNT, not resolution, so on a still there is nothing to see.
2. **Both play at the wrong SPEED, and that is my bug, not the model's.**
   `VHS_VideoCombine.frame_rate` was left at the source fps.
   - `temporal_only`: 25f -> 49f written at 30 fps = **slow motion**. For
     frame-rate DOUBLING it must be written at 60.
   - `temporal_gt`: 17 frames covering source frames 0-16, next to an 81-frame
     original, so it reads as **sped up**. Shorter clip, not faster playback.
   - So the temporal upscaler gives slow-mo or fps-doubling depending purely on
     the output fps. Both are products. Neither is automatic.
3. **`temporal_gt` has the WAVY DISTORTION that SeedVR2 had.** This is the
   finding that matters and **none of my three instruments caught it** - drift,
   flicker and the FFT ratio all scored that clip well. Same artifact class as
   the failure that killed MPI-506. Any future verdict on the temporal upscaler
   has to be eyes-first; the metrics are blind to this.

### MY GROUND-TRUTH TEST WAS MIS-FRAMED - redo it before quoting the 22-28%

`temporal_gt` output **17 frames, not the 25 I claimed**. 13 input frames is not
8n+1 (valid: 1, 9, 17, 25, 33...), so LTX cropped it to 9, and 9 -> 17.

The comparison stayed *aligned* (output frame i corresponds to source frame i,
frames 0-16), so the direction of the result holds. But `fidelity.py` takes
`min(len(ref), len(clip))`, so the invented-frame test compared **8** temporal
frames against **12** duplication frames - same reference, different sample
sizes. Not fatal, not clean, not quotable.

**The clean redo:** take a **49-frame** source span, decimate to every 2nd = 25
frames (which IS 8n+1), temporal x2 -> 49, compare against the real 49. Every
count is legal and the sample sizes match.

**Frame-count rule to bank:** every LTX frame count in this graph must be 8n+1.
`VHS_LoadVideo` will happily hand over 13 and LTX will silently crop to 9 - no
error, and the output frame count is the only symptom.

**Next action:** superseded - see `## Current State` at the top. The ground-truth
redo is done; the queue is now the hybrid temporal arm, `attention_mask`, x1.5,
clip B and a clean uncontended re-time.

### FABIO'S EYE VERDICT ON THE SIGMA LADDER, 2026-08-19 - phases 4 and 5 CLOSE

Asked on `SHEET_ladder_face_f12.png`, `EYE_zoom_f12.png`, `OBJECT_necklace_f12.png`.
His words, and what each settles:

1. **"No longer her at sigma 0.85. Still her at sigma 0.50."** The identity
   boundary sits between 0.50 and 0.85, not lower. Every arm at 0.50 and below is
   in the usable range.
2. **"The iris at sigma 0.50 is still an iris. Not a square."** This is the exact
   failure that killed SeedVR2 in MPI-506, tested with the same crop, and LTX
   passes it. **Q3 is answered YES.**
3. **The "necklace" is a ZIPPER on her dress** - my label was wrong. It survives
   at 0.50 and **at 0.85 the upper part of it is completely gone.** That is
   stronger evidence than the face: 0.85 does not merely restyle a person, it
   DELETES an object that is present in the source. Identity drift is arguable;
   deleting a garment feature is not.
4. **"This is like any image upscaler. Too much noise creates too much change -
   the user should account for that. If we have a knob that controls the amount
   of change, then this is wonderful as is. You may proceed."**

**The knob question, answered:** `sigmas` IS that knob, and it is the familiar
one - the denoise/creativity slider every image upscaler ships. It is not a
tuning detail to hide. There is no second knob worth exposing:
`LTXVAddGuide.strength` was measured and is structurally incapable of it (the
guide IS the source, so it can only pull back toward source blur - see the guide
sweep below), and `attention_mask` is the one untested variant.

**So the product shape is settled:** one slider, useful range ~0.15-0.50,
default 0.30-0.50, **0.85 off the top of the range** - and 0.85 now has two
independent reasons against it, identity AND object deletion, plus a third from
the swim work below.

> **SUPERSEDED 2026-08-19 by Fabio - `0.85 STAYS ON THE SLIDER` below.** Identity
> replacement and object deletion are TRADES the user chooses at the top of a
> denoise range, not disqualifiers, and identity restoration is another flow's
> job. The range ships as 0.15 - 0.85. Only the swim survives as a defect.

### THE x1.5 UPSCALER DOES NOT SOLVE THE VRAM CEILING - hypothesis dead

Full length, clip A, sigma 0.85, `img_compression` 0, uncontended GPU:

| arm | output | Mpx | time | peak VRAM |
|---|---|---:|---:|---:|
| x1.5 spatial | 1024x1824 | 1.87 | **157s** | **15484 MB** |
| x2 spatial | 1344x2432 | 3.27 | 263s | 15301 MB |

**43% fewer output pixels and it peaked HIGHER.** The plan's expectation - "1.8
Mpx vs x2's 3.27 Mpx, the difference between fitting on a 16 GB card and not" -
is wrong. Peak VRAM on this graph is set by the transformer and the VAE, not by
the output resolution, so shrinking the target buys nothing on the axis that
matters. (The x1.5 weight is also the LARGER file: 1.02 GB vs 0.99.)

What x1.5 does buy is **time: 157s against 263s, 40% faster.** That is a real
option for a cheaper preview pass, but it is not the answer to the 16 GB
question, and the card should stop treating it as one.

These are also the card's first UNCONTENDED timings - nothing else was on the
GPU. 263s for 81 frames at 30 fps = **97 s per second of footage** at 2x.

### FABIO REJECTED "SIGMA IS THE KNOB" TWICE, AND HE IS RIGHT

2026-08-19: *"SIGMA 85 produced the best results so far. The only issue is that
it has a lot of change on the result. If we have an op to control the change
that is done, the hallucinations by the model, then we are on a good path."*

**The earlier answer on this card - "`sigmas` IS that knob" - was wrong, and the
sweep table above is why.** Sigma does not control change; it controls
REGENERATION, and change and quality both ride on it. Dropping 0.85 -> 0.50 buys
identity by giving back the reconstruction that made 0.85 worth having. That is
a trade, not a control. What is wanted is a dial on drift that leaves the
reconstruction alone, and no sampler parameter can be one - by the time the
sampler has run, the change is already in the pixels.

**So the control has to act AFTER the pass, not inside it.**

### THE CHANGE-CONTROL OP: detail transfer (`detail_transfer.py`, self-checked)

In a 2x upscale, identity lives in the LOW frequencies (face geometry, garment
shape, pose) and reconstruction lives in the HIGH ones (pores, hair strands,
fabric weave, the zipper's teeth). Sigma 0.85 rewrites both. Keep only the half
that is wanted:

```
out = source + strength * (highpass(s085) - highpass(source))
```

One blur. No second model, no extra sampling, **no GPU** - and because it runs on
the decoded result, **the dial can be moved after generation without re-running
anything.** That is the shape of the op Fabio asked for.

Measured over the 25-frame clip A, against the lanczos 2x source:

| arm | drift | swim |
|---|---:|---:|
| source (lanczos) | 0.00 | 0.00 |
| **detail 35%** | 1.98 | **1.43** |
| detail 70% | 3.96 | 2.85 |
| **detail 100%** | **5.66** | 4.08 |
| sigma 0.85 RAW | 15.25 | 4.29 |

**It answers both open problems with one control.** At 100% it carries
essentially all of 0.85's reconstruction (swim 4.08 of 4.29) for **63% less
drift** - 5.66 against 15.25. At 35% the swim is 1.43, *cleaner than any arm
measured on this card* including sigma 0.30's 2.79. The dial spans from
"cleanest thing here" to "0.85's look with a third of its change".

**The control that makes this a finding rather than a hope.** If 0.85 had
DISPLACED features rather than re-rendered them, its high frequencies would be
misaligned against the source and the transfer would degenerate into an unsharp
mask - i.e. a sharpener, the exact thing MPI-506 rejected SeedVR2 for. So the
sheet carries an unsharp-mask panel **matched to the same drift**:
`DETAIL_ladder_f12_r10_400_120.png`. The unsharp control is visibly crunchy and
haloed; the detail-transfer panel at the same drift is clean. The detail is real.

**And it fixes the specific defect Fabio named.** On the zipper crop
(`DETAIL_ladder_f12_r10_620_780.png`) raw 0.85 has deleted the pull-tab and
thinned the zipper. Every detail-transfer rung keeps both, because the zipper is
structure and structure comes from the source by construction. The tab softens
as the dial rises, which is the trade being made visible rather than hidden.

Open on it: the split radius is fixed at 10 px and unswept; a region mask
(face vs everything else) is the obvious next refinement and is the pixel-space
version of the `attention_mask` idea, without a re-run.

#### IT IS NOT A HALLUCINATION KNOB, AND FABIO FOUND THE PROOF ON FIRST VIEWING

Asked directly: *"is detail the knob we were talking about to choose how much the
model can hallucinate?"* **No.** The model hallucinates exactly as much - it
still renders a different woman and still deletes the zipper. The dial decides
how much of that output SURVIVES, by keeping the high-frequency half and
discarding the low-frequency half. It works only because hallucination mostly
lands in STRUCTURE while the wanted reconstruction lands in TEXTURE. The stated
consequence was that **high-frequency invention passes straight through and the
dial cannot filter it.**

**Fabio then found exactly that, unprompted, on the full-length clips:**
*"detail 70 started to invent some veins on her face. At least it looks like
veins, which are more predominant at detail 100."* Predominant-at-100 is the
signature: the artifact scales with the dial, so it is being IMPORTED from the
0.85 pass, not created by the blend. This is the op's real ceiling and it is now
observed, not theoretical.

**Second finding, in the op's favour:** *"The difference between detail 100 and
Sigma 85 is that detail 100 kept the colour. Sigma 85 completely changed the
lighting."* Colour and lighting are low-frequency, so the transfer holds them by
construction. Raw 0.85 regrading the shot is a defect nobody had named yet - add
it to 0.85's list alongside identity and the deleted zipper.

**So the op stands, with a known ceiling:** it fixes structural hallucination and
grade drift, and is powerless against invented texture. The face-region mask does
not fix the veins either - the veins are ON the face. What would: a lower split
radius (coarser high-pass, dropping the finest invented detail), or a true
pre-pixel control (`attention_mask`, cfg/prompt), or a ground-truth test that
measures invented texture directly.

### THE RADIUS SWEEP IS NEGATIVE - and it named the control that works

2026-08-19. Swept at last, on the full-length pair (`real_lanczos2x.mp4` +
`full_s085_x2_00001.mp4`), frames 12/40/65, with `radius_sweep.py` and
`band_split.py` (both self-checked).

**First, a correction to this plan's own wording.** It said "a lower split radius
(coarser high-pass)". Those are opposite things. `highpass = a - blur(a, r)`, so
RAISING r widens the transferred band downward (adds mid-scale, hence more
structure and more of 0.85's identity change) and LOWERING r narrows it to the
finest detail. The arm that could drop the veins was therefore a LOW radius.

**By eye it looked like it worked, and that reading was wrong.** At r=2 the
cheek is clean, at r=5 the marks are faint, at r=10 they are plain, at r=20 they
are blotchy. But r=2's drift is 0.97 against r=10's 5.17 - the veins vanish
because the whole transfer has shrunk 5x, which is what the strength dial
already did.

**The measurement that settles it** (`band_split.py`, self-checked). It tiles the
face box 32x32 and splits the tiles by the SOURCE's own high-pass energy, so the
regions are chosen once from the source and are identical for every arm. A
bottom-quartile tile is flat skin: there is no real detail there to resolve, so
whatever the transfer adds is INVENTED. A top-quartile tile (lash line, iris,
nostril, lip edge) is where evidence exists, so what lands there is
RECONSTRUCTION. The drift-matched unsharp arm is the control that keeps it
honest - it can only amplify what the source already has, so its ratio must come
out lowest or the instrument is broken. It did, on all three frames.

Frame 40 (12 and 65 agree within 0.02 on every row):

| arm | drift | invent | recon | inv/rec |
|---|---:|---:|---:|---:|
| detail 100% r=2 | 0.97 | 0.79 | 1.54 | **0.511** |
| detail 100% r=3 | 1.53 | 1.08 | 2.44 | 0.444 |
| detail 100% r=5 | 2.76 | 1.69 | 4.55 | 0.372 |
| detail 100% r=8 | 4.34 | 2.49 | 7.23 | **0.345** |
| detail 100% r=10 | 5.17 | 2.93 | 8.43 | 0.347 |
| detail 100% r=14 | 6.41 | 3.60 | 9.93 | 0.363 |
| detail 100% r=20 | 7.58 | 4.31 | 11.09 | 0.388 |
| strength twins at r=10, drift-matched to each row above | - | - | - | 0.347 flat |
| UNSHARP control (floor) | 5.17 | 2.31 | 9.93 | 0.232 |

**Radius is strength in disguise, and a worse version of it.** The ratio is flat
at 0.347 for every strength twin (it must be - the op is linear in strength), and
every low-radius arm is WORSE than its twin: 0.511 at r=2 against 0.347. The
optimum is r=8-10, which is where the op already was. There is nothing to win
here, and the parameter should be left at 10.

**The number that points somewhere useful is the gap to the unsharp floor.** An
unsharp mask cannot invent, and it still scores 0.232 because flat skin is not
perfectly flat. Every transfer arm sits ~1.5x above that floor. That excess is
the veins, and it is present at every radius.

#### The evidence gate - suppress the transfer where there is nothing to resolve

Invented texture lands where the source has no detail; reconstruction lands where
it does. So weight the transfer by the source's own evidence:

```
ev   = blur(|src - blur(src, r)|, 2r)          # how much real detail is here
gate = clip(ev / percentile(ev, 80), 0, 1)
out  = src + strength * gate * (highpass(gen,r) - highpass(src,r))
```

Flat skin and flat fabric get nothing; the lash line, the nostril and the zipper
get the model's full rendering - which is the half an unsharp mask can never
produce. `radius_sweep.py` arm `g`, `transfer_clip.py` 6th arg `gate`, both
self-checked (including a synthetic half-flat frame the gate must suppress).

**The proof is on a region the gate was never tuned on**
(`RADIUS_gateTORSO_f40.png`, drift-matched at 132%): the source is plain white
fabric with a faint seam; ungated detail-100 invents **three red dots on the flat
fabric**; the gated arm loses the dots and keeps the seam's buttons. Same artifact
class as the veins - a red mark on a featureless area - and visible at a glance
rather than at 2x zoom. On the face (`RADIUS_gateFACE_f40.png`) the cheek
speckles largely go while the iris, lashes and teeth hold.

**Its real limit, stated plainly:** the buttons along the seam are themselves
probably invented, and the gate keeps them *because there is evidence at that
location*. It suppresses invention where there is nothing to reconstruct FROM -
not invention as such. A model that hallucinates on top of a real edge is
untouched by it.

**`band_split.py` MUST NOT be used to score the gate.** The gate is built from
per-pixel source high-pass energy and the instrument's regions are chosen by
per-tile source high-pass energy - the same signal. It would be scoring its own
construction and would flatter the gate no matter what. This is exactly the
failure this card has hit five times already, caught before it was quoted. The
gate's evidence is Fabio's eyes plus the ground-truth test below, and nothing
else.

**Also negative, so it does not get tried again: the luma-only arm.** The veins
read reddish, so transferring only the Y high-pass and keeping the source chroma
looked free. It is not - `RADIUS_faceB_f40.png` shows the marks still there with
the red drained out. They are luma structures, not a chroma cast.

#### FABIO'S VERDICT ON THE GATE, 2026-08-19 - partial pass, and it surfaced the real lead

*"the veins were gone, expressions were lost, and for the fabric, it was not just
the three dots that were created. It was some other speckles... There's something
weird going on in our face in the full gated 132. Hard to explain. It feels like
bad interpolation or something."*

Four separate readings, and they do not all point the same way:

1. **The veins ARE gone.** The gate does what it was built to do.
2. **The speckles are NOT all gone**, and my report of "three red dots" was an
   under-count taken from one crop. There is more invention on the fabric than
   the gate removes, which is consistent with its stated limit - anything landing
   on or near real evidence survives it.
3. **Expressions were lost.** New, and NOT explained by the gate's design:
   expression is low-frequency and comes from the source untouched in every
   detail-transfer arm. Either the 132% strength is over-driving on-edge detail
   until the face reads mask-like, or the eye is reading the flat-region
   suppression as deadness. Untested either way.
4. **"Feels like bad interpolation."** Leading hypothesis, and cheap to test:
   **the gate is recomputed per frame from a noisy source, so the mask itself
   flickers**, the transferred amount pulses frame to frame, and a pulsing detail
   layer reads exactly like a bad interpolation. Nothing in the op temporally
   smooths the gate. Test: rebuild `FULL_gated132.mp4` with the gate averaged
   over a 3-5 frame window, or held from a single frame, and compare. Zero GPU.

### THE POSITIVE PROMPT HAS BEEN ASKING FOR THE ARTIFACT ALL ALONG

Fabio, 2026-08-19: *"Is there anything happening in the positive prompt, or does
it not take a positive prompt? My observation is based on possibly using the
positive prompt to help the model understand what's happening."*

It takes one. `build_v2v.py` has a full text stack - `DualCLIPLoader` (gemma3-12b
+ the ltx-2.3 projection) at node 5, `CLIPTextEncode` positive at node 30 and
negative at node 31, through `LTXVConditioning` at node 32. And the default it
has been running on **every arm of this card** is:

```
"a woman's face in close up, natural skin texture, freckles, sharp eyes"
```

**It asks for freckles.** Every downstream instrument, dial, radius sweep and
gate on this card has been trying to filter out speckled skin texture that the
prompt was ordering. This is an uncontrolled variable sitting upstream of every
measurement taken so far, and it was never noticed because the prompt was written
once at graph-build time and never revisited.

Second thing found in the same read: **`cfg: 1` at the sampler (node 33), so the
negative prompt is inert.** There is no classifier-free guidance, so node 31 has
never done anything. Anyone reaching for the negative prompt to suppress an
artifact has to raise cfg first, and raising cfg is its own change to the arm.

**This outranks every remaining post-processing idea.** The order is: fix the
prompt, re-measure, and only then decide what the gate and the detail dial are
still for. Do NOT tune more filters on top of an arm whose conditioning asks for
the defect.

#### THE A/B RAN AND THE LEAD IS CONFIRMED - 2026-08-19

Three arms, identical in every respect except the prompt string: 25 frames,
sigmas `0.85, 0.7250, 0.4219, 0.0`, `img_compression` 0, x2 spatial, seed
984885689, same source. `s085_c00_00001.mp4` was already on disk and served as
the freckle-prompt control, so only two runs were needed (`prompt_arms.py`,
96s and 66s, peaks 15633/15849 MB).

| arm | prompt |
|---|---|
| freckles (control, on disk) | `a woman's face in close up, natural skin texture, freckles, sharp eyes` |
| `p_neutral` | `a woman in close up` |
| `p_empty` | `` |

**The prompt is wired and it is a SECONDARY variable** (`prompt_measure.py`,
frames 2/12/22):

| pair | L1 |
|---|---:|
| freckles vs neutral | 4.32 - 4.79 |
| freckles vs empty | 5.50 - 6.32 |
| neutral vs empty | 4.02 - 4.74 |
| freckles vs sigma 0.30 (reference rung) | 15.2 - 16.9 |
| freckles vs lanczos source (reference rung) | 15.0 - 15.6 |

So it moves real pixels, at roughly a third the magnitude of a sigma step. It is
neither inert nor dominant.

**FABIO'S VERDICT, on `PROMPT_cheek_f12.png`** (3x zoom on flat cheek, the three
arms side by side): *"I can clearly see two moles, which probably were the
model's attempt at doing freckles."* The freckle arm carries two discrete dark
marks on flat cheek skin; the neutral and empty arms do not.
`PROMPT_cheek_f10.png` is the second sample and agrees, weaker - a reddish blotch
plus a small mark where the other two are smooth.

**What the prompt fix does NOT buy.** All three arms still render the same
different woman, the same changed pose and framing, and the zipper is a button
placket in every one (`frames_f12.png`). Identity replacement at sigma 0.85 was
never the prompt's doing and dropping "freckles" does not touch it. The prompt
explains the SKIN MARKS, not the 0.85 regeneration.

**Fixed at source**, so the next session cannot re-contaminate: `build_v2v.py`,
`sweep.py` and `full_arms.py` all default to `"a woman in close up"`, each with a
dated comment naming what the old default was doing.

**Still open, and it is a product question rather than a bench one:** neutral vs
empty as the shipped default. Both cheeks came out clean. Empty is the honest
default for an upscale op (a user upscaling footage is not writing a prompt), but
it was not the arm Fabio looked at closely, and at `cfg: 1` an unconditioned
distilled model is the less-tested path. Decide it on the app card, not here.

### THE KNOB QUESTION, THIRD TIME - and the two askings are different questions

Fabio, 2026-08-19, after approving 0.50 in motion: *"going to 085 has a much
better improvement, although a lot of changes happen. Can we have a knob that
can be used more or less like denoise on image upscalers? Do we already have
it?"*

**Yes, and it is `sigmas`.** This card has answered the knob question twice and
reversed itself once, and the reversal is what makes it look unsettled. It is
not. The two askings are different questions and both answers are right:

| the ask | answer |
|---|---|
| *"a knob like DENOISE on image upscalers"* (this one) | **`sigmas`. We have it.** A denoise slider on an image upscaler has exactly the property the sweep table measured: raise it and you get more reconstruction AND more change, welded together. That is not a defect in our knob, it is what that control IS everywhere. |
| *"a dial on the CHANGE that leaves the reconstruction alone"* (2026-08-19, earlier) | **No sampler parameter can be that**, and `sigmas` specifically is not. By the time the sampler has run the change is in the pixels. That is why the detail transfer exists - it acts after the pass. |

**Do not read this as reopening "sigma is the change knob".** It is not, and
Fabio rejected that twice. What is being corrected is a narrower thing: the plan
let "sigma is not the change knob" harden into "we have no denoise knob", and
that second sentence was never true.

**So the shippable product shape is one slider, `sigmas`, across its FULL range
0.15 - 0.85.** Low is true-to-original with improvements; high is a cleaner,
sharper result that re-renders. 0.50 at full length in motion is *"the best
result we had so far"*.

#### 0.85 STAYS ON THE SLIDER - the card had this wrong, corrected by Fabio

This plan said three times that 0.85 was "off the top of the range", and I
repeated it as "0.85 is not going to become selectable". **That was a product
decision being made inside a bench card, and it was the wrong call.**

Fabio, 2026-08-19: *"going up to 0.85 did give us a clear, cleaner result at the
expense of changes, which is something that the user might want. Sometimes
identity is not the issue. Sometimes it's not a consistent character, and it just
needs a sharper generation. Plus there's also identity LoRAs that can be explored
in other flows to restore identity, which we will not do here because that's not
the goal of the upscaler."*

So the three findings against 0.85 have to be re-classified, because two of them
were never defects:

| finding at 0.85 | what it actually is |
|---|---|
| identity replacement | **A TRADE the user chooses.** Exactly what a denoise slider does at the top of its range on any image upscaler. Not every clip is a consistent character. |
| object deletion (zipper -> button placket) | **Same trade**, same slider position. Worth documenting in the UI copy, not worth removing the range. |
| swim 4.13, level with a rejected clip | **The only one that is still a defect**, because the user is not choosing it and it is not what "more denoise" is supposed to buy. It needs its own read at 0.85 in motion on the clean arm. |

**Identity restoration is explicitly OUT OF SCOPE for the upscaler.** Identity
LoRAs belong to other flows. Do not let a future session re-open "how do we keep
her at 0.85" - that question was answered by moving it off this card.

**What this does to the detail transfer.** It stops being the thing that makes
the product work and becomes an optional extra. *(Then it died outright when
watched in motion - see THE DETAIL TRANSFER IS CLOSED NEGATIVE below. The
product is the slider alone.)*

**Where 0.85 is actually useful, per Fabio 2026-08-19** - he declined a
full-length watch, having seen enough: *"I think it will be useful for certain
things, maybe not others. Like animated pictures, cartoons, anime... It's
probably going to clean things up a little bit and also just plainly regenerate
certain parts."* So the top of the range is a content-dependent choice, not a
defect to design away, and the UI should let a user reach it.

### THE CARD BENCHED THE WRONG SOURCE CLASS

Fabio, 2026-08-19: *"We've been working with a very degraded video of the lady
dancing. The real application is most likely going to be AI-generated at a lower
resolution that needs a bump in resolution."*

Clip A is a degraded real-camera phone clip. It was the right choice for
comparability with MPI-506, and it is NOT the footage this op will actually be
pointed at. **Every number and every eye verdict on this card describes the
hard case, not the real one**, and the two differ in the way that matters most:
an AI-generated source has no sensor noise, no compression mush and clean
synthetic edges, so there is far less for the model to "fix" and far less cover
for invention.

Clip B was supposed to close this and never landed - interrupted three times.

#### THERE ARE TWO TARGETS, AND THE SECOND ONE MAY NOT FIT THE CARD

Fabio named both, 2026-08-19:

1. **Low-res AI generation -> a bump.** *"not 100% the target, but I'd like to
   see if it can fix it, because it would be one of the targets."* Supplied:
   `ref2v_ms_006.mp4` from the `cowboys` project, staged as
   `G:/ComfyUi/ComfyUI/input/mpi568_ai_cowboys.mp4`.
2. **High-res AI finished generation -> even higher, for a finished product.**
   *"quite important as well."* Clip to follow.

**Target 2 is the one to worry about, and this card already knows why.** MPI-506
died on a VRAM ceiling and clip A's 2x arm peaks at 97% of a 16 GB card from a
0.82 Mpx source. A "high-resolution finished generation" is the opposite end of
that axis.

**Do NOT settle this from the x1.5 result.** That measurement - 43% fewer output
pixels peaking HIGHER - was taken with the SOURCE held constant and only the
upscaler swapped, so it says peak is insensitive to the OUTPUT resolution. It
says nothing about the SOURCE resolution, which sets the latent size at encode,
upsample, sample and decode alike. Extrapolating it to target 2 would be reading
a same-source comparison as a general law.

**The cowboys clip gives that second data point for free.** Its source is
0.41 Mpx against clip A's 0.82, so if peak VRAM drops materially below clip A's
15.3-15.9 GB, source size drives peak and target 2 is in real trouble at 2x on
this card. If peak barely moves, the transformer dominates and target 2 may be
reachable. Read the `cb_*` peaks with that question in mind - it was not what the
run was for, but it is the cheapest answer available.

#### The ladder on target 1

`cowboys_ladder.py`, 4 arms: 0.15 / 0.30 / 0.50 / 0.85, `img_compression` 0,
neutral prompt (`a covered wagon pulled by two horses on a desert road`), full
73 frames, `out_fps` 24. Baseline `cb_lanczos2x.mp4`.

The clip gets two things clip A never did, both by luck: **73 frames is already
8n+1** and **864x480 is already divisible by 32**, so there is no decimation, no
crop and no fit - the model sees the generation exactly as it was made. It also
carries FAST LATERAL MOTION with real motion blur (galloping legs, spinning
wheels), which stresses the swim harder than clip A's dancing did.

**One thing the bench drops that a product could not:** the source has an AAC
audio track and `VHS_LoadVideo` takes video only, so every output here is silent.
Irrelevant to the quality question, not irrelevant to shipping.

#### TARGET 1 RESULT - the ladder on the AI source, and a default to argue with

Four arms, 73 frames, full clip (`cb_s015/030/050/085`), baseline
`cb_lanczos2x.mp4`. Sheets: `CB_ladder_f36.png` (wide), `CB_face_f36.png` (4x on
her face), `CB_horses_f60.png` (3x on the harness, fast motion).

| arm | time | peak VRAM |
|---|---:|---:|
| `cb_s015` | 97s (incl. model load) | 15142 MB |
| `cb_s030` | 61s | 15228 MB |
| `cb_s050` | 86s | 15283 MB |
| `cb_s085` | 86s | 15423 MB |

**What the ladder shows, and it is NOT clip A's shape:**

1. **Every sampled arm beats lanczos decisively on faces and static detail.** The
   baseline is mush; even 0.15 resolves her face and finds hair strands.
2. **0.15 / 0.30 / 0.50 cluster tightly**, far closer than on clip A. The
   hypothesis held: a clean synthetic source needs less regeneration, so the low
   end is already most of the way there.
3. **In FAST MOTION the sampled arms are SOFTER THAN LANCZOS** (`CB_horses_f60`,
   the galloping harness). This is the VAE round trip's cost landing where the
   source had hard edges, and it is the one region where the op currently loses
   to doing nothing. **Checked for the obvious confound first:** `align.py` gives
   BEST OFFSET +0 at 0.0739, against 0.16 at +/-1, so it is not a frame shift -
   which fast motion would have exaggerated into exactly this appearance.
4. **0.85 overcomes the softening by regenerating** and is sharpest everywhere.
   It invents structure - the wagon canopy gains cross-braces and bolts, and the
   shawl becomes a tailored jacket with buttons - **but it does NOT replace the
   person**, which is the failure that killed 0.85 on clip A. The source class
   changes 0.85's cost, exactly as Fabio predicted when he called it useful for
   animation and cartoons.

**RECOMMENDED DEFAULT: `sigmas 0.50`, range exposed 0.15 - 0.85.** Reasoning, so
it can be argued with rather than inherited: 0.50 is the top of the
identity-safe range on degraded footage (Fabio's own verdict), it sits inside
the tight cluster on AI footage so it costs nothing there, and it buys the most
margin against the VAE softening in motion. 0.30 is defensible and slightly
faster; below 0.30 is not worth the VAE round trip. **This is a recommendation,
not a measurement - the card is `user-ux` and Fabio picks.**

#### FABIO'S VERDICT ON TARGET 1, 2026-08-19 - HE PICKED 0.85, NOT 0.50

*"85 is a much better result, with clean output. Obviously, the clothes changed,
and the character changed quite a bit. It is hard to figure out what the
character was, considering it was actually a blob at the beginning, but most
things can be changed by prompt, I believe, like prompting what type of clothing
she was wearing."*

**The recommendation above is overruled and stays on the page as the argument
that lost.** Two things in his verdict are the reasoning, and neither is a
preference:

1. **On a low-res AI source there is no identity to preserve.** The woman was a
   blob at 864x480. "Preserve identity" was the whole case for capping at 0.50,
   and it was carried over from clip A, where there WAS a real person in the
   source to lose. It does not transfer to a source that never resolved a face.
2. **Invention is only a defect when it cannot be directed.** He reads the
   changed clothing as steerable rather than as damage. That is a testable
   claim, not an opinion - see the prompt-steer test below.

**THE DEFAULT IS NOW A PRODUCT FORK, and it is the one thing this verdict does
not settle.** The two source classes want opposite ends of the same slider:

| source | best | why |
|---|---|---|
| low-res AI generation (target 1) | **0.85** | nothing to preserve, and it is the only rung that beats the VAE softening in motion |
| degraded real camera footage (clip A) | **0.50** | 0.85 renders a different woman - Fabio's own ship/no-ship verdict was that 0.50 "holds up motion" |

One `sigmas` default cannot serve both. Three ways out, and it is Fabio's call:
default 0.85 and accept that phone footage gets a stranger; default 0.50 and
make the AI case reach for the top of the slider; or let the Flow pick the
default from the source, which is more machinery than a one-slider op was
supposed to need. **Not decided - do not let this be settled by whichever number
someone types into a descriptor first.**

#### THE PROMPT-STEER TEST - Fabio's clothing claim, with its own sensitivity control

His claim is that 0.85's inventions can be directed by prompt. This card has
already proved the prompt has causal power in this graph at `cfg: 1`: the
default positive was ordering the skin speckles that four post-pass dials were
built to remove. So the claim is plausible, which is exactly why it needs the
control.

Two arms at 0.85 on the cowboys clip, both appending a garment clause to the
same base prompt so clothing is the only variable (`finish568.py`):

- `cb_s085_pdress` - a PLAUSIBLE garment (brown wool shawl, long grey prairie
  dress). Does the output follow?
- `cb_s085_pred` - a CONTRADICTORY garment (bright red leather biker jacket).
  **This one is not optional.** 0.85 already renders something shawl-shaped
  unprompted, so a plausible prompt appearing to work proves nothing on its own;
  only a prompt the footage argues against can separate steering from
  coincidence. Seven instruments on this card passed until they were asked to
  fail on purpose.


**The variant now running, and it is the literal form of his ask** (zero GPU):
`transfer_clip.py` takes any src/gen pair, so the base does not have to be the
lanczos source. **Use `nb_s050_x2` as the base and `nb_s085_x2` as the detail
donor** - 0.50's identity and grade, 0.85's texture, on a dial, adjustable after
the fact without re-running anything. Every earlier transfer arm used the lanczos
source as base, which was strictly weaker: it threw away the reconstruction 0.50
had already earned. Rendering at 0.35 and 0.70 as `T50from85_*.mp4`.

Risk to watch, and it is the op's known failure mode: 0.85 renders a different
face at a different scale, so its high frequencies may be misaligned against
0.50's, and a misaligned transfer degenerates into an unsharp mask - crunch and
halos. The earlier lanczos-based arms carried a drift-matched unsharp control for
exactly this reason and passed it. **This variant has NOT been checked against
one yet, and that is the first thing to do if Fabio likes the look.**

It rendered, and **on a still the ladder reads correctly** (`KNOB_f65.png`, 3x
on the face): 0.50 base softest, +35 sharper, +70 sharper again, the woman
staying the 0.50 woman at every rung. **That still was wrong, the same way every
still on this card has been wrong.**

#### THE PROMPT DOES STEER THE CLOTHING - Fabio was right, and the first read here was wrong

**This section replaces a wrong conclusion, kept as a lesson rather than
quietly deleted.** The first pass reported the prompt-steer test as NEGATIVE -
"the prompt is not inert, it is unaimed" - on the strength of a garment-box mean
RGB and a crop that sat too low to include her collar. **A mean RGB can only see
colour.** The thing the prompt actually changed was the garment's STRUCTURE, and
the crop that would have shown it was 40 px higher up the frame. Eighth
instrument-honesty trap on this card, and the first one where the instrument was
mine and the eye it fooled was mine too.

**What the arms actually show** (`STEER_shape_f36.png`, 3.4x at frame 36, three
arms at sigma 0.85, same seed, garment clause the only variable):

| prompt | what she is wearing |
|---|---|
| base ("a covered wagon pulled by two horses...") | an ambiguous draped blue garment |
| `+ brown wool shawl over a long grey prairie dress` | **a shawl** - soft, wrapped over the shoulders, no structure |
| `+ bright red leather biker jacket` | **a structured jacket** - notched lapel, collar, studs, and a red garment at the neck |

Three prompts, three garments, each matching its words. **The prompt steers
garment TYPE and SHAPE.** What it does not do is repaint the jacket red: the
dominant colour stays blue in every arm, and the red the biker clause bought
shows up as a shirt at the neckline rather than as the jacket itself.

**So the split is by spatial frequency, and the mechanism survives - with its
prediction corrected.** At sigma 0.85 the sampler starts from the SOURCE latent.
It rebuilds high-frequency content, so texture (the old prompt's skin speckles)
and now garment structure (lapels, drape, collar) follow the text. It cannot move
the lowest-frequency content - the large flat colour field of the jacket - which
survives the round trip from the source. The earlier prediction that "no prompt
changes her jacket" was too strong; the correct one is **no prompt changes her
jacket's COLOUR, while its cut is fair game.**

**Prompt POSITION is ruled out as a factor.** `cb_s085_front` puts the same red
clause at the head of the prompt instead of appended, and lands at mean|diff|
4.174 against the appended arm's 3.869 and the shawl arm's 3.765 - the same
magnitude. The clause was never buried.

**`cfg` IS THE AMPLIFIER, and the graph has it pinned at 1.** The `CFGGuider`
runs `cfg: 1`, which is no guidance at all - the negative is ignored and the
positive is unamplified. At `cfg: 3` the same red-biker prompt moves **9.891**
from the cfg-1 base against the cfg-1 red arm's 3.869, the lapels become
pronounced, the red neckline reads clearly (`STEER_cfg_f36.png`), and the
DISTILLED transformer did not break, which was the risk worth expecting.

**Not yet reportable as steering.** Raising cfg changes the sampler trajectory
whether or not the prompt is doing any work, so `cb_s085_cfg3base` runs cfg 3
with the BASE prompt and no garment clause. Close to the cfg-1 base means the
9.891 belongs to the prompt and cfg is a real product lever this graph has been
suppressing; nearly as far means cfg changes the image by itself and the lapels
are what cfg 3 does to a jacket.

**Product consequence, and it restores the ground Fabio chose 0.85 on.** His case
was that 0.85's inventions can be directed. For wardrobe cut that is true at cfg
1 already and stronger at cfg 3. It remains false for large flat colour. So 0.85
is not "undirected invention" as the earlier draft of this section claimed - it
is invention that follows the prompt in shape and resists it in colour.

#### TARGET 2 PROMPT CONFOUND - CLOSED, the ladder's verdicts stand

`hi_s085_p` re-ran target 2's top rung with a prompt matching its actual footage
(the hi ladder had inherited target 1's wagon prompt). 701s, peak 14768 MB. The
rider's face at 0.85 is the same transformed face under both prompts
(`HI2_promptface_f50.png`):

| change | mean\|diff\| |
|---|---:|
| correcting the prompt | **2.864** |
| dropping sigma 0.85 -> 0.50 | **7.812** |
| doing nothing at all (lanczos) | 10.907 |

The prompt is worth about a quarter of what the sigma is worth, and a correct
prompt does NOT restore an identity that 0.85 replaced. Wardrobe is steerable;
a face is not.

#### THE LADDER IS NOT ONE PARAMETER - a confound in every arm on this card

Found while answering Fabio's ask for a rung between 0.50 and 0.85. The four arms
differ in step COUNT and schedule SHAPE as well as in start sigma:

| arm | schedule | steps | ratios of first |
|---|---|---:|---|
| `s015` | 0.15, 0.075, 0 | 2 | 1, 0.50 |
| `s030` | 0.30, 0.15, 0 | 2 | 1, 0.50 |
| `s050` | 0.50, 0.30, 0.15, 0 | 3 | 1, **0.60**, 0.30 |
| `s085` | 0.85, 0.7250, 0.4219, 0 | 3 | 1, **0.853**, 0.496 |

0.85 does not merely start higher, it STAYS high - its second step is at 85% of
the first against 0.50's 60%. **So "0.85 replaces the identity" is a claim about
an arm, not yet about a number**, and the two rungs Fabio is choosing between
differ in two ways at once. Nothing measured is invalidated; the parameter it is
attributed to is.

`between.py` runs both readings of "in between" on target 1 (86s an arm against
target 2's 12 minutes):

- **A - same shape, lower start.** The shipped 0.85 ratios scaled: `cb_x060`,
  `cb_x0675`, `cb_x075`, plus **`cb_s050shape`** (0.50 with the 0.85 shape),
  which is the control that separates start sigma from shape against the
  existing `cb_s050`.
- **B - low start, deeper tail.** `cb_s050deep` = `0.50, 0.40, 0.30, 0.20, 0.10,
  0`. The FIRST step is where the model re-decides global structure, which is
  where an identity goes; the low-noise steps are where texture is built. If that
  holds, B buys 0.85's crispness at 0.50's identity risk - not a compromise
  between the two rungs but a different trade entirely.

If B wins, the slider stays one control with a fixed schedule behind it. If only
A wins, the slider is genuinely continuous and 0.675 becomes the default
candidate. The winner gets confirmed on target 2, where the rider's face is big
enough to judge identity properly.

#### TARGET 2 RESULT - the production upscale, and the low end is dead everywhere

Four arms, 121 frames, 1344x768 -> **2688x1536 (4.13 Mpx)**, `img_compression` 0,
one pass, no chunking. Baseline `hi_lanczos2x.mp4` (built here - target 2 had
none). Sheets: `HI2_wide_f50.png`, `HI2_face_f50.png` (1.9x on the rider),
`HI2_motion_f30.png` (2x on the flying mane), plus `HI_eye2_f50.png` at 5x.

| arm | time | s per s of footage | peak VRAM |
|---|---:|---:|---:|
| `hi_s015` | 512s | 102 | 14921 MB |
| `hi_s030` | 478s | 95 | not sampled |
| `hi_s050` | 680s | 135 | not sampled |
| `hi_s085` | 732s | 145 | 15555 MB |

The two missing peaks are missing because the previous session's runner was
reaped at handoff and its stdout went with it; the sampler here started after
those arms had finished. Do not backfill them by guessing - the two that ARE
measured bracket the answer.

**THE VRAM CEILING QUESTION IS CLOSED. It fits, with room.** 4.13 Mpx out peaks
at 14921-15555 MB against clip A's 15301-15898 MB at **3.27** Mpx. A 26% bigger
output cost *less* peak, so **peak is set by the transformer, not by the source**,
across 0.41 -> 1.03 Mpx of input. MPI-506's ceiling was not a property of this
op.

**FABIO'S VERDICT, 2026-08-19** - on the rider in motion: *"The 15 had a lot of
motion blur. It looked like motion blur. It's not real motion blur. The 30 had a
bit less. The 50 was spot-on, much better."* On the woman (target 1): *"I would
either choose 50 or 85, depending on if I wanted to keep her face more consistent
or not. 15 and 30 again proved to be not enough."*

**1. The low rungs' failure mode is SMEAR, not softness, and that is why the
stills undersold it.** `HI2_motion_f30` is the picture of his words: at 0.15 the
flying mane is one black blob, at 0.30 it is a blob with edges, at 0.50 the
strands separate, at 0.85 they are individually crisp. A still of a static region
reads 0.15 as "slightly soft" and hides this completely - the eighth time on this
card that a still has been the wrong instrument.

**2. NOTHING BELOW 0.50 HAS EVER WON, ON ANY SOURCE CLASS.** Degraded real
footage picked 0.50; low-res AI picked 0.85; high-res AI picked 0.50 or 0.85.
0.15 and 0.30 have now been rejected by eye on all three. **The shipped range
0.15-0.85 has a dead bottom half** and that is a product question, not a bench
one - see the open decisions.

**3. On a source that HAS an identity, 0.85 still replaces it.** `HI2_face_f50`:
the rider at 0.85 is a younger, cleaner, differently-bearded man. This is clip
A's failure returning on a *high-res* source, and it confirms the split is about
whether the source resolved a face at all, not about resolution: target 1's woman
was a blob so nothing was lost; target 2's rider is fully resolved so 0.85 costs
him. **0.85 is an identity trade on every source with a real face.**

**4. 0.85 invents on textures too, visibly.** Same motion sheet: the wagon canvas
behind the mane gains rope, stitching and rust spots that are in no other arm.
Consistent with target 1's cross-braces and buttons.

**5. Grade drift is real, small, monotonic with sigma, and NEUTRAL** (mean level
over 60 frames vs the lanczos baseline, out of 255):

| arm | R | G | B | luma |
|---|---:|---:|---:|---:|
| `hi_s015` | -3.35 | -3.64 | -3.59 | **-3.53** |
| `hi_s030` | -4.10 | -4.22 | -4.32 | **-4.21** |
| `hi_s050` | -5.03 | -4.95 | -5.32 | **-5.10** |
| `hi_s085` | -4.41 | -5.26 | -6.48 | **-5.38** |

Everything comes back darker, and up to 0.50 the channels move together within
0.4 levels, so it is an exposure offset an app-side lift corrects - not a colour
cast. 0.85 is the one arm that skews (B falls 2.1 more than R), which is
regeneration changing the grade rather than the round trip losing level.

**6. In fast motion target 2 does NOT lose to lanczos** - the opposite of target
1, where the galloping harness at 864x480 came back softer than doing nothing.
At 1344x768 the source detail sits above what the VAE round trip costs. One clip
each, so this is an observation about the two sources, not a resolution law.

**Alignment was checked before any of the above, both ways**: temporal offset
**+0** (0.0607 against 0.198 at +/-1, `align.py`) and spatial shift **(0,0)** on
all three arms tested (`spatial.py`, +/-8 px search). A first read of the face at
1.6x said the sampled arms were softer than lanczos and that read was WRONG - at
5x lanczos is a stair-stepped block grid and 0.50 has a defined eyelid crease,
directional brow hairs and real skin grain (`HI_eye2_f50.png`). **On this card the
eye usually beats the instrument; this is the one time the instrument beat the
eye, and only because the eye was working at too low a zoom.**

**Confound, being measured rather than argued:** the whole hi ladder ran the
TARGET 1 prompt ("a covered wagon pulled by two horses on a desert road") while
target 2 is a different clip - one rider on a grey dappled horse beside a wagon.
Uniform across all four arms, so the ladder is internally comparable, but at
`cfg: 1` the positive is the only steer and it lands hardest at 0.85.
`hi_prompt.py` re-runs 0.85 alone with a matching prompt: if little changes
there, the mismatch is closed for every lower rung too.

#### THE IN-BETWEEN LADDER - Fabio's ask, answered, and one of my hypotheses died

Fabio, after seeing the 0.50/0.85 pair: *"is there anything that we can do
between 50 and 85, because at 85 we start seeing identity loss?"* Two readings
of "in between" were run on target 1 (86s an arm), plus the shape control the
existing ladder never had.

**FIRST, THE SHAPE CONFOUND IS REAL BUT SMALL, and it was overstated when it was
found.** `cb_s050shape` is 0.50 carrying the 0.85 schedule shape (second step at
85% of the first instead of 60%). Against the original `cb_s050`:

| change | mean\|diff\| |
|---|---:|
| schedule SHAPE alone, at the same 0.50 start | **1.209** |
| 0.50 -> 0.30 | 2.965 |
| 0.50 -> 0.85 | 9.538 |
| doing nothing (lanczos) | 6.144 |

Shape is worth about 13% of the start-sigma gap. **So the slider is effectively
the start sigma after all**, every earlier verdict on this card stands, and a
single continuous control is well defined. The confound was worth measuring and
was not worth the alarm it was raised with.

**A - SAME SHAPE, LOWER START: this is the answer.** The rungs interpolate
smoothly and monotonically (`BTW_face_f36.png`, 4.2x on her face):

| rung | schedule | distance from 0.50 | % of the way to 0.85 |
|---|---|---:|---:|
| `cb_x060` | 0.6000, 0.5118, 0.2978, 0 | 2.507 | 26% |
| `cb_x0675` | 0.6750, 0.5757, 0.3350, 0 | 3.947 | 41% |
| `cb_x075` | 0.7500, 0.6397, 0.3723, 0 | 5.691 | 60% |
| `cb_s085` | 0.8500, 0.7250, 0.4219, 0 | 9.538 | 100% |

Features sharpen at every rung and **she stays recognisably the same woman
through 0.75**; at 0.85 the hair changes volume and the face rounds.

**STRUCTURAL INVENTION ONSET IS BETWEEN 0.75 AND 0.85.**
`BTW_canopy_f36.png`: the wagon canopy is plain at 0.50, 0.60, 0.675 and 0.75,
and grows dark cross-braces at 0.85 - the same rung at which she becomes a
different woman.

**That looked like one threshold and it is not - target 2 disproves it, see
INVENTION HAS A SCALE LADDER below.** On this clip structural invention and
identity replacement happen to coincide at 0.85; on target 2 fine texture
invention starts three rungs earlier. Reading "invention begins at 0.85" off
target 1 alone would have been a one-clip law.

**B - LOW START, DEEPER TAIL: DEAD.** `cb_s050deep` (`0.50, 0.40, 0.30, 0.20,
0.10, 0`, six steps, all the extra ones at low noise) is visually identical to
plain 0.50 and measures **1.181** away - the same magnitude as changing nothing
but the schedule shape. The hypothesis was that identity is decided in the first
high-noise step while texture is built in the low-noise tail, so a deeper tail
would buy 0.85's crispness at 0.50's risk. **It does not.** Reconstruction happens
at high noise; the low-noise tail adds nothing but time (132s against 86s).

**Consequence, and it is the honest shape of the trade: crispness and identity
are the SAME axis.** There is no free lunch and no clever schedule that separates
them. The only way between 0.50 and 0.85 is to sit between them.

**RECOMMENDED: 0.675 conservative, 0.75 as the last rung before invention
starts.** `hi_x0675` / `hi_x075` confirm this on target 2, where the rider's face
is big enough to judge an identity properly - target 1's woman was a blob in the
source and is the weaker evidence for exactly the question being asked.

#### TARGET 2 CONFIRMS THE IN-BETWEEN RUNGS - and a slider value MEANS the same thing on both clips

`hi_x0675` (714s, peak 14970 MB) and `hi_x075` (678s, peak 15427 MB), same
shaped schedules, on the clip whose rider is big enough in frame to judge an
identity properly (`HIBTW_face_f50.png`, 1.9x).

| rung | distance from 0.50 | % of the way to 0.85 | target 1's % |
|---|---:|---:|---:|
| 0.675 | 3.179 | **41%** | 41% |
| 0.75 | 4.746 | **61%** | 60% |
| 0.85 | 7.812 | 100% | 100% |

**The fractional positions match target 1 to within a point.** The absolute
distances differ (7.812 against 9.538 to reach 0.85) because the sources differ,
but where a rung sits BETWEEN 0.50 and 0.85 does not. That is what makes a single
number on a slider mean something across footage - a user who learns "0.675" on
one clip has learned it for the next.

**By eye:** 0.675 is unmistakably the same weathered man, sharper - deeper lines,
grey stubble resolved. 0.75 is sharper still and still him, with the moustache
starting to fill. 0.85 is a younger, smoother, fuller-moustached man under a
differently-creased hat. **0.675 is safe, 0.75 is the last rung before the face
starts to go, 0.85 is gone.**

#### INVENTION HAS A SCALE LADDER - fine texture first, structure and identity last

`HIBTW_canvas_f30.png` puts the lanczos baseline beside the arms on the wagon
canvas behind the flying mane, and it separates two things this card had been
calling one:

| sigma | what appears on a flat canvas the source renders smooth |
|---|---|
| lanczos / 0.50 | faint creases only - what is actually in the source |
| **0.675** | **rust/dirt speckles that are in no source frame** |
| 0.75 | the same speckles, more of them |
| 0.85 | speckles PLUS invented rope and stitching lines |

So invention does not switch on at one sigma. **Its SCALE grows with sigma:**
fine texture from about 0.675, discrete structures and identity replacement at
0.85. That reconciles the two clips rather than contradicting either, and it
refines the earlier "structure invention and identity replacement switch on
together" reading, which was true of target 1's canopy and is not a law.

**Product consequence:** 0.675 is not "invention-free", it is free of the
invention anyone would notice. Speckles on a canvas are not a changed face. The
rung to defend is the identity one.

#### `cfg` IS A SECOND LEVER, AND THE CONTROL SETTLED IT

`cb_s085_cfg3base` runs cfg 3 with the BASE prompt - no garment clause - and it
is the arm that decides whether cfg steers or merely changes.

| comparison | mean\|diff\| |
|---|---:|
| cfg 3, base prompt, vs cfg 1, base prompt | **8.702** |
| cfg 1: base prompt vs red-biker prompt | 3.869 |
| **cfg 3: base prompt vs red-biker prompt** | **9.231** |

**Both things are true, and only the control could separate them.** Raising cfg
does change the image substantially on its own (8.702). But the PROMPT'S OWN
influence, measured at fixed cfg on both sides, grows from **3.869 to 9.231 -
2.4x**. So cfg genuinely amplifies steering; the earlier 9.891 headline was
mostly cfg's own move and would have been the wrong number to quote.

**cfg 3 does not break the distilled transformer** (`CFG_wide_f36.png`): the
frame is clean, slightly more contrasty and saturated, no artifacts, 91s at
15163 MB. That was the risk worth expecting and it did not happen. It is not
free, though - the cfg-3 wagon carries more invented structure than the cfg-1
one, which is consistent with guidance pushing harder on everything the prompt
implies, not only on the clause someone added.

**This is a real product lever the graph currently pins shut at `cfg: 1`, and it
is NOT one of this card's closed-negative post-pass dials** - those were all
post-processing on a finished frame. Whether it ships is a separate question from
whether it works: a second slider costs the "one slider is the product"
simplicity this card has been defending. **Undecided, and Fabio's call.**

#### THE DETAIL TRANSFER IS CLOSED NEGATIVE - and Fabio's words name the mechanism

Watched in motion, 2026-08-19: *"35 has a bit of morphing in her mouth at a
certain part of the video. 70 has even more prominent morphing in her eyes.
There are parts where her eyes are open and closed at the same time, like a bad
interpolation or two frames fighting over each other. On 70, her face just looks
weird. Almost like it was stamped on it on the video."*

**"Eyes open and closed at the same time" is the root cause stated exactly.** The
op is `out = base + s * (highpass(donor) - highpass(base))`, and it rests on an
assumption nobody wrote down: that the donor re-rendered TEXTURE while leaving
the PERFORMANCE alone. It does not. At sigma 0.85 the model regenerates motion
and expression, so donor frame `i` and base frame `i` are not the same moment of
the performance - the donor can be mid-blink where the base is open-eyed.
Transferring the donor's high frequencies then stamps a closed eyelid's edges
onto an open eye. Two expressions in one frame. That is the "bad interpolation"
percept, and "stamped on" is the same observation about the whole face.

**This retro-explains the evidence gate's verdict from earlier today** -
*"expressions were lost"* and *"feels like bad interpolation"* - which the plan
recorded as NOT predicted by the gate's design, on the grounds that expression is
low-frequency and comes from the source untouched. That reasoning was wrong.
Expression has high-frequency EDGES (lash line, lid crease, lip edge), the donor
moved them, and the transfer imports them. The gate never had a flickering-mask
problem; it had this one. **Drop the temporal-smoothing test - it was chasing the
wrong hypothesis.**

**Why the stills could never show it.** A still shows one frame of the donor
stamped on one frame of the base, and if both happen to be mid-expression it
looks like clean added detail. The defect only exists as a disagreement ACROSS
frames. Six instruments and a dozen sheets missed it; one watch found it.

**Consequences, all of them:**
- The detail transfer is dead as a product control, at every strength and with or
  without the gate. Not a tuning problem - the op's premise is false whenever the
  donor regenerates the performance, which is exactly when it is worth using.
- The evidence gate dies with it. It was a refinement of a broken op.
- The split-radius sweep, `band_split.py` and the gate's whole measurement stack
  were all built on top of it. They stay closed.
- **The product keeps ONE control: `sigmas`.** No post-pass dial. Fabio: *"if we
  can just land that slider in its best position, I think it's better, because
  changing it is not proving anything better."*

#### THE RE-BASELINE LANDED, AND THE SPECKLES ARE GONE AT SOURCE

Two full-length arms on the neutral prompt, 81 frames, `img_compression` 0, x2
(`full_arms.py nb_s050_x2 nb_s085_x2`, one lease):

| arm | time | peak VRAM |
|---|---:|---:|
| `nb_s050_x2` | 294s | 15868 MB |
| `nb_s085_x2` | 258s | 15481 MB |

`nb_s085_x2_00001.mp4` is the direct twin of `full_s085_x2_00001.mp4` - same
seed, same source, same everything except the prompt string. Compared at the
face on two independent frames (`REBASE_face_f40.png`, `REBASE_face_f65.png`):

**The old arm's cheeks carry a field of small dark marks; the new arm's cheeks
are clean.** f65 is the plain one - the freckle-prompt panel has speckles across
both cheeks plus a distinct mole, and the neutral panel has smooth skin. f40
agrees.

**So the artifact this card spent its middle section building filters for was
being ordered by the conditioning, and deleting six words removed it with no
post-processing at all.** The detail transfer, the radius sweep and the evidence
gate were all aimed at it.

**What this does NOT change**, stated so the re-baseline is not over-read:
- Sigma 0.85 still replaces the person. The neutral arm is still a different
  woman with a button placket where the zipper is. 0.85 stays off the slider.
- The fabric speckles are unresolved here. `REBASE_fabric_f40.png` landed on the
  button placket rather than the flat panel, and both arms look alike on it. The
  three red dots were reported on the ungated detail-100 output, not on raw 0.85,
  so that question belongs to the transfer re-run on the new base.
- The swim, the VAE damage and the identity boundary are all untouched by this.

**Consequence for the downstream work:** the evidence gate was bought at a real
price - expressions lost, plus the interpolation-like artifact - to suppress
invention on flat skin. Most of what it was suppressing was prompt-ordered and is
now absent. **Re-look before spending anything more on the gate, its temporal
smoothing, or the split radius.** They may have no job left.

#### SEVENTH INSTRUMENT-HONESTY TRAP - three high-pass measures, all blind

**No number on this card may be quoted for the speckle question.** Three were
built and every one failed its own control:

1. **Whole-face high-pass** (`prompt_sensitivity.py`). An injected, plainly
   visible 16-grey-level speckle rash moves it **+0.147** against a **+/-0.3**
   spread between the arms. Lashes, nostrils, lip line and hair edges dominate
   the band and drown cheek texture.
2. **Flat cheek / forehead patches** (`prompt_cheek.py`). Worse: within a SINGLE
   arm, `cheek R` reads 15.19 / 3.72 / 5.72 across frames 2/12/22, because the
   subject moves and a fixed box drifts off skin. Instrument noise is ~30x the
   between-arm spread of 0.21-0.40.
3. **The first sensitivity control was itself wrong**, and is worth recording
   because both bugs are easy to write again: `energy()` compared a float array
   against a low-pass built from a QUANTISED copy, leaving a constant ~0.1
   residual that swamped the signal; and the speckle mask was blurred as uint8
   then divided by 255, so an isolated pixel peaked near 0.1 and the injected
   amplitude was ~10x below its label. **The tell was that the deltas refused to
   scale with amplitude** (+0.104 at 1 grey level, +0.086 at 16). Both fixed;
   the fixed version is what produced the +0.147 above.

The finding that closed this question was two moles visible at 3x zoom, which no
mean-over-a-box statistic was ever going to see. That is the sixth time on this
card that the eye beat the instrument, and the reason `Verify mode: user-ux` is
the right setting for it.

### THE WAVY DISTORTION IS THE VAE, NOT THE INTERPOLATION - root-caused 2026-08-19

Fabio saw it on `real_temporal_gt_00001.mp4` and all three instruments scored
that clip well. New instrument: `wave.py` (self-checked). Two ideas the old
three lacked:

- **Split the output by parity.** The temporal upscaler doubles frames, so EVEN
  output frames came from REAL input frames. Those cannot carry interpolation
  error. Any residual on them is upstream.
- **Measure how much the residual CHANGES frame to frame ("swim"), not how big
  it is.** A constant difference is invisible - it just looks like a slightly
  different render. One that is re-drawn every frame is what the eye calls
  waviness. `flicker.py` measured the FRAME's temporal difference, which is
  dominated by real motion, and that is why it was blind.

**The frames that should have been copies are not.** On `real_temporal_gt`, an
even frame sits 7.58 grey levels from its true source frame, against a **0.31
codec floor** measured on an h264 re-encode of the same frames.

**Attribution - four arms, same 25 decimated inputs, one variable each**
(`warp_arms.py`, all `no_sample`, 3-12s and 4.6-8.7 GB each, so this whole
investigation cost under a minute of GPU):

| arm | even-frame residual | swim |
|---|---:|---:|
| h264 re-encode (floor) | 0.31 | 0.51 |
| VAE round trip only, crf 0 | **4.06** | 2.63 |
| + `LTXVPreprocess(img_compression=18)` | 4.93 | 2.67 |
| + temporal upscaler x2 | 5.54 | **4.76** |
| `real_temporal_gt` (the flagged clip) | 7.58 | 4.72 |

So: **the LTX VAE round trip alone accounts for ~13x the codec floor and is the
floor under everything.** The preprocess adds ~20% to the residual and nothing
to the swim. The temporal upscaler adds ~12% more residual but nearly **doubles
the swim**, which is the part the eye sees.

**Two hypotheses died to their own controls, and both are worth keeping:**

- **It is NOT the frame count.** "Fewer frames = fewer latent frames = more
  warp" was the obvious story (9 frames is 2 latent frames, LTX's VAE compresses
  time by 8). Measured flat: 9/25/49 consecutive frames score 3.83 / 3.89 /
  3.93. The `real_temporal_gt` clip being worst is the crf-18 preprocess plus
  its DECIMATED input (double displacement between input frames), not its length.
- **It is NOT a geometric warp**, despite the residual map looking like one.
  Searching a per-tile +/-2px shift (`wave.py warp`) removes only 10-19% of it,
  against **0% and a 0.00 mean shift on the codec control** - so the instrument
  does not overfit, and the content is REWRITTEN rather than MOVED. "Wavy" is
  the right percept and the wrong mechanism.

**The visual proof is `EVENFRAME_f24.png`** - a frame that came from a real
input, three ways: REAL / TEMPORAL x2 / VAE-round-trip-only. The temporal panel
is visibly softer and geometrically looser; the VAE-only panel is close to the
real one. **The temporal upscaler degrades frames that needed no work at all.**
`SWIM_triptych.mp4` and `SWIM_zoom_face.mp4` show it in motion, which is the
only way the swim is visible.

**Laplacian variance failed again, in the same way MPI-506 recorded.** It scores
the temporal even frames 14.7 against the real source's 12.2 - i.e. it calls the
visibly-softer frame the sharper one, because ringing is edge energy. Do not use
it to check the hybrid arm below.

#### What this costs the product - the swim is in the arm Fabio approved

Same instrument on the 2x spatial arms, reference = lanczos 2x, codec floor 0.43:

| arm | swim |
|---|---:|
| h264 control | 0.43 |
| sigma 0.30 c0 (**the shippable arm**) | 2.79 |
| sigma 0.50 | 3.00 |
| sigma 0.85 c0 | 4.13 |
| temporal x2 on decimated input (rejected by eye) | 4.76 |

**The swim is not a temporal-upscaler bug, it is an LTX-latent-path property.**
It is present at 2.79-3.00 in the arm Fabio just approved - roughly 60% of the
level he rejected, on a clip where he did not see it. That is a margin, not an
absence: flatter, longer or slower footage may cross the line. And **sigma 0.85
sits at 4.13, level with the clip he rejected** - a third independent reason to
keep it off the slider's range.

#### FABIO CONFIRMED ALL THREE, 2026-08-19 - and the VAE panel is the finding

Shown `SWIM_zoom_face.mp4`, `EVENFRAME_f24.png`, `INTERP_f09.png`:

1. *"The right panel, the Temporal x2, is what I called wavy, which now, zoomed
   in, is clearly distorted."* The instrument and the percept are the same thing.
2. *"Temporal frame looks like an undercooked upscale, and **the VAE distorted
   and messed up parts of the face**."* He saw damage in the VAE-ONLY panel too -
   the one arm that applies no upscaler at all. That is the floor under every
   LTX latent path in this app, including the sigma 0.50 arm he approved. It is
   the most consequential sentence on this card.
3. *"Temporal x2 is just a blob. The crossfade: you can see both frames, so
   that's useless."* Both interpolation candidates rejected by eye. The 4.5% L1
   tie between them was two failures scoring alike, not two near-equals.

#### The obvious fix for the temporal arm - and it should NOT be run

**Deleted from the queue rather than left pending.** The idea was: keep the real
frames, take only the invented ones from the model, so the even-frame damage
disappears by construction.

It cannot work here, and finding 3 is why. The invented frames are *blobs* at
fast motion. Interleaving blobs with sharp real frames does not average the
defect away - it puts a sharp reference next to it 30 times a second, which
makes it MORE visible, not less. The hybrid is only worth building if the
invented frames are independently acceptable, and Fabio has now said they are
not. Skipping the run.

The model damages frames it was handed intact. So: **keep the original frames
and take ONLY the invented ones from the model.** That deletes the even-frame
damage by construction and costs nothing.

The risk it introduces is a 30 Hz sharpness pulse between real and invented
frames. Laplacian variance says 1%, and laplacian variance is exactly the
instrument that just failed on this footage - so **this needs an eye check, not
a number.**

### THE GROUND-TRUTH REDO, WITH LEGAL FRAME COUNTS - the 22/28% figures are replaced

The old run was mis-framed (13 frames is not 8n+1, LTX cropped to 9). The clean
version is `warp_tmp00_9`: **25 legal input frames -> 49 out**, 24 invented
frames, matched sample sizes, compared against the 24 real frames withheld.

| invented frames only, vs withheld truth | L1 |
|---|---:|
| **temporal upscaler** | **7.50** |
| naive duplication, raw source | 10.22 |
| naive duplication, VAE-matched (fair) | 11.87 |
| **plain CROSSFADE of the two real neighbours** | **7.85** |

**27% better than duplication, 37% against a VAE-fair duplication.** Those
replace the un-quotable 22%/28%.

**But a plain crossfade ties it to within 4.5%, and that is the finding.** An
average of two frames is the L1-optimal hedge under motion, so pixel distance
systematically flatters a blend and cannot establish that this is a GOOD
interpolator - only that it beats duplication. The eye splits them and the split
depends on motion (`INTERP_f09.png`, `INTERP_f25.png`):

- **fast motion (f09):** the crossfade double-exposes but stays readable; the
  temporal output **smears the face into mush** - the VFI failure mode the card
  told us to watch for, and it does appear on this clip.
- **slow motion (f25):** the crossfade is the sharper of the two.

So the temporal arm is **not** the clean win the earlier note claimed. It is
worth keeping only if the hybrid fixes it.

### The fps bug is NOT fixed, and it is parked

`build_v2v.build` now takes `out_fps`, which sets `VHS_VideoCombine.frame_rate`
independently of the source fps - that half is real and future runs can use it.

**The remux of the existing clips FAILED and was reported as working.**
`ffmpeg -r 60 -i in.mp4 -c copy out.mp4` sets the INPUT frame rate, which mp4
demuxing ignores, so `FIX_temporal_only_60fps.mp4` still plays at 30 - Fabio
checked and it is still slow motion. A stream copy cannot retime an mp4 this
way; it needs `setpts` with a re-encode, or the rate set at write time via
`out_fps`.

**Parked on Fabio's call, 2026-08-19:** *"There is no point in spending energy on
fixing FPS at this point"* - not until an upscaler is chosen. Both readings stay
products when one is (49 frames at 60 = smooth doubling, at 30 = half speed),
and neither is automatic.

### LTX 2.5 - RESEARCHED, AND ITS VAE IS THE PART THAT MATTERS HERE

Sub-agent research, 2026-08-19, on Fabio's request. **Treat the 2.5 facts as
sourced-but-unverified-locally; the compatibility claim in particular is
inference, and the agent said so itself.**

**LTX 2.5 exists** - released 2026-08-11, `Lightricks/LTX-2.5` on HF (gated),
22B, ComfyUI core support merged the same day.

**It ships two latent upscalers, and drops the x1.5:**

| file | size | type |
|---|---:|---|
| `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` | 996 MB | spatial x2 |
| `ltx-2.5-latent-temporal-upscaler-x2-bf16-1.0.safetensors` | 262 MB | temporal x2 |

Both sizes match our 2.3 x2 files byte-for-byte within rounding (ours are
995,743,560 and 261,944,000 bytes), which is the agent's main compatibility
evidence. **Note the unit trap that nearly produced a false discrepancy here:
this plan quoted 0.99 / 0.24 / 1.02 GB, which are GiB; the agent quoted 996 MB /
262 MB / 1.09 GB, which are decimal. Same files.** Repo layout changed - 2.5 puts
them under `latent_upscale_models/` rather than the repo root.

**NOT verified and worth 30 seconds on the bench before adopting:** whether the
state-dict still carries `post_upsample_res_blocks.0.conv2.bias` and whether the
`config` metadata fields are unchanged. Read the safetensors header directly.

**Do not confuse it with `Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler`**
- that is an IC-LoRA pixel-space mechanism, NOT a latent upsampler, and it does
not load through `LatentUpscaleModelLoader` / `LTXVLatentUpsampler`.

#### THE 2.5 VAE MAY INVALIDATE THIS CARD'S CENTRAL NEGATIVE FINDING

2.5 ships a new **DiffVAE** (`ltx-2.5-video-vae-bf16.safetensors`, 1.47 GB) plus
a cheaper conv VAE (1.45 GB) and an audio VAE (365 MB). Lightricks describe it as
"Diffusion Fidelity Rendering" - an extra diffusion-based decode stage explicitly
targeting sharper faces and **less smearing during fast motion**.

**That is the exact symptom class this card root-caused to the 2.3 VAE round
trip** - the swim, measured at ~13x a codec floor with no upscaler in the graph
at all, and the thing Fabio saw when he said the VAE "messed up parts of the
face". So **the swim finding does not automatically carry to 2.5**, in either
direction: DFR may fix it, or may merely move it. Re-run `warp_arms.py`'s
VAE-round-trip-only arm on the 2.5 VAE before quoting any swim number against
2.5. Nothing about that is settled by the 2.3 measurements.

#### SHIPPING DECISION - v1 on 2.3, 2.5 is a later bump

Fabio, 2026-08-19: *"we could release the first version of our upscaler in 2.3
and, at a later release, bump it to 2.5 once we have bumped ComfyUI."* Adopted.
So this card's deliverable stays a 2.3 op and does not block on the engine.

**Two different bumps, do not conflate them** (CLAUDE.md Context Router):
- Evaluating the 2.5 upscalers on the BENCH needs `/mpi-bump-local-comfy`
  (standalone `G:\ComfyUi`, currently ComfyUI 0.31.0). Never reaches a user.
- Shipping 2.5 to users needs `/mpi-bump-engine` and its playbook, including the
  smoke evidence `npm run release:check` refuses to ship without.

Neither belongs to MPI-568. This card records the finding and hands it on.

## Phase 1: Correct the brief's premises

Three claims in `brief.md` were checked against `/object_info` on 2026-08-19 and
two are wrong. Fix them before running anything, so the next session does not
plan around them.

1. **The LTX spatial upscaler already ships.** `comfy_workflows/ltx_i2v_t2v.json`
   node `123` is `LTXVLatentUpsampler` on node `125`
   `LatentUpscaleModelLoader` / `ltx-2.3-spatial-upscaler-x2-1.1.safetensors`.
   Stage 1 samples at `floor(w/2) x floor(h/2)` (nodes `155`/`156`), the latent
   is upsampled x2, and node `39` refines at full res from
   `sigmas 0.85, 0.7250, 0.4219, 0.0`. So "does a regenerative LTX upscale
   work at all" is already answered in production. **The open question is
   narrower than the card states: does it hold up as a STANDALONE v2v upscale
   of existing footage, with no LTX generation behind it.**
2. **`LowVRAMLatentUpscaleModelLoader` is not core.** It is
   `custom_nodes.ComfyUI-LTXVideo`. If it ever reaches the app it needs a
   `node_lock.json` entry - part of the integration tax the card claims is zero.
3. **The core interpolation pair is unusable today.**
   `FrameInterpolationModelLoader`'s `model_name` combo is **empty** - there is
   no `frame_interpolation` model folder, and `rife47.pth` sits at
   `G:\CubricModels\` root. `RIFE VFI`
   (`custom_nodes.comfyui-frame-interpolation`) has five checkpoints loaded and
   works now. The "no node pack needed" claim holds only for the upscaler, not
   for phase 7.

**Verify:** the three corrections are in `brief.md` and readable without this
plan.

## Phase 2: Build the standalone v2v upscale graph

Graft stage 2 of `ltx_i2v_t2v.json` onto a video input instead of a generated
latent: load clip -> `LTXVPreprocess` -> VAE encode -> `LTXVLatentUpsampler`
(x2) -> conditioning -> partial-denoise refine -> `VAEDecode`.

The AV plumbing is the fiddly part: the shipped graph carries a joined
audio+video latent (`LTXVConcatAVLatent` / `LTXVSeparateAVLatent`) and this arm
is video-only. Neutralise the audio branch rather than deleting it, so the graph
stays diffable against the shipped one.

**Verify:** one x2 run completes on the real-camera clip and decodes to a video
of the expected dimensions.

## Phase 3: Q1 + Q4 - does it run on 16 GB, and what does it cost

Run x2 on both sources (`clip_1774824957518.mp4`, 678x1214 real camera; the AI
clip). Log wall-clock and peak VRAM per run.

The bar is MPI-506's, and it is a floor not a target: SeedVR2 needed 1278s for a
2-second clip at 3x, and collapsed to `frames_per_chunk = 13` at 2x. Anything
that cannot clear that is not interesting.

**Verify:** seconds-per-second-of-footage for both clips, next to SeedVR2's
number. Note that `:8188` is NORMAL_VRAM while the app runs `--lowvram`, so
these are ceilings, not app numbers - the gate MPI-506 never closed.

## Phase 4: Q2 - sharpener or reconstructor (DECISIVE)

Re-run `detail_vs_sharpen.py`: radial-FFT `top/mid` against a fixed lanczos
baseline, with the h264 re-encode control. Both clips.

SeedVR2's row: 0.57 at 1.5x, 0.43 at 2x, 0.24 at 3x, control 1.06.

**If LTX also lands well below 1.0, the semantic-prior thesis was wrong and the
card closes `rejected` here** - phases 5-7 are not run. Say so plainly rather
than looking for a kinder number.

**Verify:** a printed table - LTX x2, lanczos baseline, h264 control, SeedVR2 -
for both clips.

## Phase 5: Q3 - does it keep an eye an eye

Face-crop triptychs at matched frames, same crops MPI-506 used. This is the
failure that started the whole line of work.

**Verify:** PNGs handed to Fabio. His call, not a metric.

## Phase 6 (gated on phase 4): Q5 - denoise, conditioning, drift

Being regenerative is the entire thesis, so measure what it invents: sweep the
refine denoise, test prompt-steerability, and check identity drift across the
clip. Drift is the risk that mirrors SeedVR2's flicker.

**Verify:** a denoise sweep with the point where invention overtakes
restoration named.

## Phase 7 (gated on phase 4): the reduced-frame-set + interpolate arm

Decimate to every Nth frame, upscale those, interpolate back with `RIFE VFI`
(not the core pair - see phase 1.3). Start at N=2.

Measure **flicker**, not sharpness - that is the claim. Watch the VFI failure
mode: fast motion, occlusion, thin structures. Bench a turning face, not a slow
push-in. Do not conflate this with Fabio's WAN case, where the source was
natively 16 fps and no decimation happened.

**Verify:** flicker metric for straight-upscale vs decimate-then-interpolate,
plus cost per second for both.

## Remaining Work

**The temporal upscaler is CLOSED and negative** - rejected by eye on both the
frames it invents and the frames it was handed. Not a tuning problem; do not
re-open it with a different sigma or frame count. What remains is the spatial
arm and one open question that outranks the rest.

1. **THE SHIP/NO-SHIP TEST - the swim on a full clip in motion.** Fabio approved
   sigma 0.50 from a still ladder, then separately said the VAE alone "messed up
   parts of the face". Those two verdicts are in tension and only a full-length
   moving clip resolves it. Run clip A at 81 frames, sigma 0.50, `img_compression`
   0, and watch it - the swim is invisible on a still by construction. This also
   discharges the uncontended re-time the card owes, since it needs an exclusive
   GPU anyway (97% of 16 GB).
1b. ~~Re-run sigma 0.85 with a NEUTRAL and an EMPTY positive prompt~~ **DONE,
   POSITIVE, and fixed at source.** The prompt was rendering as two moles on
   flat cheek skin; neutral and empty are clean. See the A/B section. Left open
   deliberately: neutral vs empty as the shipped default (a product call for the
   app card), and `cfg: 1` still makes the negative prompt inert - raising cfg to
   use it is its own change to the arm and has not been tried.
1d. **RE-BASELINE, in flight** - `nb_s050_x2` and `nb_s085_x2`, 81 frames,
   `img_compression` 0, neutral prompt. The first is the ship/no-ship arm in
   motion (folds item 1 into it); the second replaces `full_s085_x2_00001.mp4`
   as the base for anything downstream. **Until these land, the detail transfer,
   the radius sweep and the evidence gate are all measured against contaminated
   conditioning** - re-look before spending any more on them, and expect the
   gate's job to have shrunk.
1c. ~~Temporal stability of the gate~~ **DROPPED - wrong hypothesis.** The
   "bad interpolation" percept is not a flickering mask; it is the donor's
   expression being stamped onto the base's. The gate and the transfer are both
   closed negative. Do not smooth anything.
2. ~~Fabio's eyes on the evidence gate~~ **DONE - partial pass.** Veins gone,
   speckles only partly, expressions lost, plus a new interpolation-like face
   artifact. See the verdict section.
2b. **Ground-truth test for invented texture.** Downscale the source 2x, upscale
   it back, compare the invented high frequencies against the withheld real
   frames. Separates "resolved real detail" (the nose stud) from "made-up
   detail". ~1 minute of GPU. **Demoted** - it was doubly needed as the gate's
   only independent check, and the gate is now closed. It is worth running on the
   AI source, where invention matters more, not on clip A.
2d. **THE REAL NEXT ARM - the sigma ladder on an AI-GENERATED source.** Fabio is
   supplying the clip; it goes in `G:/ComfyUi/ComfyUI/input/`. Run the same rungs
   (0.15 / 0.30 / 0.50 / 0.85, `img_compression` 0, neutral prompt) and let him
   pick the default. This supersedes item 3 - it IS the clip B cross-check, with
   footage that matches the real application instead of a substitute.
2c. ~~Sweep the detail-transfer split radius~~ **DONE, NEGATIVE.** Radius is
   strength in disguise and lowering it is strictly worse; leave it at 10. The
   luma-only arm is negative too. See the radius-sweep section.
3. Clip B (non-LTX AI source) cross-check - interrupted twice, never landed.
4. `LTXVAddGuide.attention_mask` - the in-graph version of 2. Only worth it if
   the pixel-space mask proves the idea and something still needs the model to
   know about the region.

**Answered and closed:** the x1.5 arm (does not solve VRAM, is 40% faster) and
the uncontended re-time (97 s per second of footage at 2x).

## Completed

- Phases 1-5. Phase 4's metric verdict is void by its own control; phases 4 and
  5 close on Fabio's eye verdict instead, which is what `Verify mode: user-ux`
  always meant.
- Phase 7 answered by a better route than the card proposed (latent temporal
  upscaler, no RIFE) - but answered NEGATIVELY on quality until the hybrid arm
  is tried: it degrades the frames it was handed and only ties a crossfade.
- The wavy distortion root-caused to the LTX VAE round trip, with the temporal
  upscaler as a ~2x amplifier. New instrument `wave.py`, self-checked.
- The output-fps bug fixed (`out_fps`), existing clips remuxed.

## Plan Drift

- 2026-08-19: written at pickup. The card had no plan - the ordered question
  list in `brief.md` is its ancestor. Phase 1 exists because three of the
  card's stated premises did not survive a `/object_info` check.
- 2026-08-19: **phase 4 gains two A/Bs that the plan did not anticipate**, and
  they have to run *before* the verdict, not after it. The preliminary 0.58
  cannot be read as "LTX is a sharpener too" while two settings copied from the
  shipped i2v graph are still confounding it:
  1. `LTXVPreprocess(img_compression=18)`. In the shipped graph this exists to
     make a *conditioning image* match LTX's training statistics. Applied to a
     v2v source it is a deliberate JPEG-ish degradation of the very detail the
     upscale is supposed to keep. A=18 vs B=0.
  2. `sigmas "0.85, ..."`. That is a light partial denoise. The card's whole
     thesis is that being *regenerative* is what buys a semantic prior, and a
     0.85 start barely regenerates. Sweep it up.
  If the top band lifts under either, the verdict changes, and phase 6 was
  never really a separate question from phase 4.
- 2026-08-19 (later): **the card's decisive question was the wrong one twice
  over.** Phase 4 asked "sharpener or reconstructor" and its metric could not
  survive its own control. The thing that actually decides whether this ships is
  neither - it is the SWIM, a per-frame rewriting of fine detail that is a
  property of the LTX latent path itself and is present in every arm including
  the approved one. No phase on this card was looking for it, and three
  instruments were built that could not see it. A fourth (`wave.py`) can.
- 2026-08-19 (later): phase 7's verdict is downgraded. The earlier note called
  the temporal upscaler "the best find of the session"; with legal frame counts
  and a crossfade control it only ties a linear blend, and it damages the real
  frames. The hybrid arm is what decides it.
- 2026-08-19: **the radius hypothesis died and this plan's own wording was part
  of why.** "A lower split radius (coarser high-pass)" describes two opposite
  operations; raising r widens the band downward, lowering it narrows to the
  finest detail. Corrected in the radius-sweep section. The sweep then killed the
  hypothesis outright - radius is dominated by strength at matched drift - and
  the instrument built to prove it named the evidence gate instead. The sixth
  instrument-honesty trap on this card was caught before it was quoted rather
  than after: `band_split.py` shares a statistic with the gate and may never
  score it.
- 2026-08-19: MPI-506's AI-generated source clip no longer exists on disk, so
  clip B is a substitute (a non-LTX WAN clip) rather than the same footage.
  Clip A is unchanged, so the headline comparison still holds.
- 2026-08-19 (later): **the card spent its whole middle section tuning filters
  against an artifact its own conditioning was ordering.** The positive prompt
  asked for freckles, the model drew moles, and the detail dial, the radius
  sweep and the evidence gate were each built to remove them downstream. Fixed
  at source and re-baselining. The transferable lesson is not "check the
  prompt" - it is that this card had an UNCONTROLLED VARIABLE upstream of every
  measurement for its entire life, written once at graph-build time and never
  revisited, and nothing in the method surfaced it. Fabio found it by asking
  whether the graph even took a prompt.
- 2026-08-19 (later): **the GPU is no longer arbitrated by asking.**
  `/mpi-project-refresh` (908343a0) turned on `guard-gpu` with
  `gpu_command_patterns`, so a sampler run is wrapped in the machine-global
  lease (`<mpi-lib>/scripts/gpu_lease.py run --`) and queues behind whoever
  holds the slot, in any repo on this box. The card's old "ASK before any
  sampler run" constraint is superseded - wrap it and background it instead.
  Note the regex would NOT have fired on `python prompt_arms.py` (the URL is
  inside the file, not the command line); wrapping it was a judgement call, and
  the right one, because the arm peaks at ~15.8 GB of 16.4.
