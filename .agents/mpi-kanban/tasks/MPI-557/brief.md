# MPI-557 - Video face detailer

**Fabio, 2026-08-13:** *"One major issue with video models is that small faces
lose identity and sometimes look distorted because they don't have enough
resolution. This is already fixed in images by using detailing with a mask...
A video detailer is something that doesn't exist. This would be a major thing
if we can pull it off. High value. Very high value."*

**Status: experimental.** Phase 0 is a GO/NO-GO bench gate. Nothing in the app
gets built until it passes.

---

## 1. Why per-frame detailing cannot work

`MaskDetailerPipe` is not an upscale. Crop the masked region -> scale it UP to
`guide_size` -> VAE-encode -> **KSampler at `denoise` ~0.4-0.6** -> decode ->
scale down -> feather-paste. The upscale only buys the sampler pixels; the
detail is *invented* in the sampling step.

There is **no identity source anywhere** in that path - no reference, no
embedding. Identity is whatever the low-res pixels plus the checkpoint's prior
agree on. Fine for a still, sampled once.

On video, "plausible detail" is re-invented independently every frame. Fixed
seed does not save it: the input differs per frame and diffusion decorrelates
fast. Result is boiling features and identity flicker.

**The fix is not a new model. It is swapping the sampler in the middle of the
existing detailer skeleton for one that sees all frames at once.**

## 2. Pipeline

1. `face_yolov8n` on every frame -> per-frame bboxes.
2. Collapse to **one stable window** for the whole clip: union of all bboxes,
   squared, padded ~30%. No per-frame tracking.
   `ponytail:` union only. A subject crossing frame swallows half the shot and
   loses the resolution win - that is when smoothing gets built, not before.
3. Crop that rectangle out of every frame (e.g. 128x128 x 120 frames).
4. Scale the sequence up to sampler res (512 or 768).
5. **Temporal resample - one pass over all frames.** Swappable slot:
   - **SeedVR2** - `SeedVR2TemporalChunk` -> restore -> `SeedVR2TemporalMerge`.
     Restoration, faithful, risk is a plastic/waxy result.
   - **LTX v2v** at denoise ~0.3 - invents more detail, prompt-steerable, risk
     is drift. `raw/ltx_v2v_template.json` already carries
     `ImageBatchExtendWithOverlap` + `GetImageRangeFromBatch`.
6. Cross-fade chunk overlaps. Identity can step at a seam otherwise.
7. Scale back down to crop size.
8. **Detail transfer, NOT colour match** - see section 3.
9. Feather-paste each frame back at the window position. Re-mux original audio
   (`video_upscale.json` already does this).

Only steps 5 and 8 are genuinely new logic. Everything else is nodes already
shipped.

## 3. Colour match is BANNED here - use detail transfer

Fabio, 2026-08-13: *"Careful with colour matching. We've tried that several
times before. All the colour match nodes in ComfyUI are shit. They usually end
up fucking up the colour more than fixing it."*

Do not paste the restored crop. Paste only its high frequencies:

```
out = source_crop + (restored - blur(restored, r))
```

- Every colour, exposure and lighting value comes from the **source**. Sampler
  drift lives entirely in the low frequencies, which are discarded. Structurally
  immune to the failure mode, not tuned around it.
- Mush *is* missing high frequency, so this transfers exactly the wanted signal.
- Damps flicker as a side effect: low-freq carries perceived face shape at a
  glance and comes from the source video, which is already temporally stable.
  Residual sampler variation is confined to high frequency.
- Two blurs and a subtract. No `color-matcher` lib, deterministic.

Ghosting only if the restored face has different *geometry* than the source. At
denoise <= 0.35 it does not.

## 4. Identity - three levels

| Level | Source | Fixes |
|---|---|---|
| 0 | none (image detailer today) | mush |
| 1 | none, but SeedVR2 is a restoration prior | mush, more faithfully |
| 2 | LTX **identity LoRA** on the v2v pass | drift (wrong person) |

Levels 0/1 are the same graph with a different node in step 5. Level 2 changes
the graph and is out of scope until Phase 3.

Already in `loraDeps.js`: `ltx23-lora-merged` is
*"Soft+Abliterated+**Detailer** Merged"* - a detailer LoRA is already baked into
the shipped LTX stack. The identity LoRA is **not** wired yet and needs a
`loraDeps` entry.

### REJECTED: MiniMax H3 ref2va

Its own ModelDef says *"references never become frames"*. It generates new video
from references with no frame-locked v2v path, so its output cannot track source
motion frame-for-frame - paste it back and it desyncs from the body it is
attached to. H3 ref2va answers *"regenerate the whole shot with this
character"*, a different (also valuable) flow. Do not re-litigate this.

## 5. Custom nodes

| Step | Node | Status |
|---|---|---|
| 1-2 | **`MpiFaceWindow`** | NEW. `UltralyticsDetectorProvider` is per-image; nothing collapses per-frame SEGS across a batch into one stable box. In: IMAGE batch. Out: `MPI_BOX`. Reuses the `face_yolov8n` dep already shipped. |
| 3 | `MpiBoxCrop` | exists |
| 4, 7 | `ImageResizeKJv2` | exists |
| 5 | SeedVR2 / LTX v2v nodes | exist |
| 6 | `SeedVR2TemporalChunk/Merge`, `ImageBatchExtendWithOverlap` | exist, one per branch |
| 8 | **`MpiDetailTransfer`** | NEW. ~8 lines torch. |
| 9 | **`MpiBoxPaste`** | NEW. Inverse of `MpiBoxCrop` - patch batch + `MPI_BOX` + feather -> composited batch. `InpaintStitchImproved` is welded to its own `STITCHER` and its batch behaviour over 120 frames is unverified. |

Completes the family `MpiBox -> MpiBoxCrop -> MpiBoxMask -> MpiBoxPaste`. All
three are pure tensor ops - no weights, no new deps, no pip.

Node work runs through `/mpi-nodes-sync`. **Trap:** the dev machine symlinks the
pack into `custom_nodes` and the drift check skips it, so a node ships only when
committed -> pushed -> pinned in `dev_configs/node_lock.json`. Local work passes
every check with no pin.

---

## Phases

### Phase 0 - bench GO/NO-GO (needs ZERO new nodes)

The one unknown that decides everything: **does a ~128px face upscaled to 512
come back sharp, or waxy?**

- Hand-wire on the bench (`G:\ComfyUi`) against one existing clip with a small
  face.
- **Hardcode the window** - read the box off a frame by eye, type numbers into
  `MpiBox`. No detection needed.
- **Skip paste-back and detail transfer entirely.** Look at the restored crop.
  The question is face quality, not seam quality.
- Run **both samplers on the same clip** - SeedVR2 and LTX v2v + detailer LoRA.
  Identical graph except one box, so it is one extra run, not two builds.
- Watch for: waxy/plastic skin, identity drift across the clip, step changes at
  chunk seams.

**Gate:** if the face comes back waxy on both branches, the card is `rejected`
and we spent an afternoon. Record the verdict and the winning sampler here
before Phase 1.

### Phase 1 - the three nodes

Only after Phase 0 passes. Their spec is *informed by* Phase 0 (blur radius,
512 vs 768, whether seams actually show) - which is why they are not built
first. `MpiFaceWindow`, `MpiDetailTransfer`, `MpiBoxPaste` in
`c:\AI\Mpi\ComfyUi-MpiNodes`, then pinned.

**Gate:** full graph runs end to end on the Phase 0 clip, automatic window,
seamless paste-back, audio intact.

### Phase 2 - the Flow

`/mpi-add-flow`. Video-media flow, `requiresVideo: 1`, no prompt required. A
Flow, not a model op - `detail` needs `canMask` and the video workspace has no
mask tool. Alternative home worth weighing at the time: an entry in the video
tool dropdown via the MPI-506 contribution mechanism, alongside
[MPI-507](../MPI-507/brief.md).

v1 is **fully automatic - no mask UI.** Largest face, union window, one button.

### Phase 3 - identity (optional, only if drift is the real complaint)

Wire the LTX identity LoRA as a `loraDeps` entry on the v2v branch. Only worth
it if Phase 0/2 show the failure is *drift* rather than *mush*.

---

## Phase 0 findings - desk pass (D1-D3, 2026-08-14)

No GPU, no bench run. Every answer cites the file it came from.

### D1 - batch behaviour of the crop and detect nodes

**`MpiBoxCrop` already handles a multi-frame batch.** `crop()` slices
`image[:, y:y+h, x:x+w, :]` - the batch axis is untouched, so a 120-frame IMAGE
passes straight through (`ComfyUi-MpiNodes/img.py:605`). `MpiBoxMask` likewise
builds its mask as `(B, H, W)`. Nothing to change for the video path.

**`UltralyticsDetectorProvider` is per-image, and that is enforced.** The
provider only loads the model; detection happens in `UltraBBoxDetector.detect()`,
which calls `tensor2pil(image)` -> `numpy.squeeze(0)`, a hard error for B > 1
(`Impact-Subpack/modules/subcore.py:418-420`, `impact-pack/modules/impact/utils.py:53`).
The consuming node refuses a batch outright: `BboxDetectorForEach.doit` raises
*"[Impact Pack] ERROR: BboxDetectorForEach does not allow image batches"*
(`impact-pack/modules/impact/detectors.py:101-102`). SEGS also carries a single
`(H, W)` shape plus an item list - there is no frame index to collapse on.

-> **`MpiFaceWindow` is confirmed necessary**, as the brief assumed. Bonus:
`img.py:637` already holds `square_bbox_from_mask(mask, padding)` - tight box ->
centred square -> clamped and shrunk to stay inside the image, with asserts at
`img.py:859-879`. The squaring/padding half of the node is already written and
tested; only the per-frame loop and the union are new.

### D2 - the LTX identity LoRAs (this re-scopes Phase 3)

**There is more than one LTX ID LoRA. They are not interchangeable.** Fabio,
2026-08-14, correcting a first pass of this section that had found only the
shipped one and wrongly concluded no face LoRA existed.

**1. The one we already ship is voice-ID, not face-ID.** `ltx23-lora-talkvid` -
*"LTX-2.3 ID LoRA TalkVid-3K (baked - voice-ID)"*
(`js/data/modelConstants/loraDeps.js:412-421`) - loads in
`comfy_workflows/ltx_i2v_t2v.json` node 277 at strength 1.0, bound to
`LTXVReferenceAudio` (node 274), whose own description reads *"Set reference
audio for ID-LoRA **speaker** identity transfer"*. It encodes a reference
**audio** clip and needs an audio VAE (`comfy_extras/nodes_lt.py:852-893`). No
face-reference input anywhere in it. **Not the Phase 3 mechanism.**

**2. The face one is `Alissonerdx/LTX-Best-Face-ID`** (huggingface.co, and
comfyui-wiki.com/en/news/2026-07-06-ltx-best-face-id-lora). Targets **LTX-2.3
(22B) - the same checkpoint we already ship.** Two files:

| File | What |
|---|---|
| `Best_FaceID_v1.0_LoRA.safetensors` | base, close-up / bust-crop reference |
| `Best_FaceID_CharacterSheet_v1.0_LoRA.safetensors` | continuation trained on 4-panel character-sheet references, refs **exactly 1536x1024** |

LoRA rank 128 / alpha 128. Conditioning is an overlap reference latent plus
TASS-RoPE source-phase tagging (`source_id=2`), trained with an ArcFace identity
loss and temporal consistency. Prompts take a `ref_t2v:` prefix. Mixing both at
~0.2+ is the documented combination ("the base close-up LoRA strengthens
identity while the character-sheet LoRA keeps handling clothing/body"). Licence
is `other` - **read it before shipping anything**, cf.
[[project_model_licences_can_be_territory_restricted]].

Its own stated limitations matter for this card: the reference *"can look like
it is 'pasted'/masked rather than freshly generated"*; identity is *"much
stronger when the prompt describes the person"*; training skews close-up/frontal
so *"full-body or large-angle shots hold identity less well"*; and *"ArcFace
similarity is unreliable on small / turned / occluded faces - judge visually,
not only by score"* - which independently confirms this plan's front-loaded
"eye, not metric" decision.

**3. The open question is whether it composes with a v2v pass.** The wiki is
explicit that it is *"strictly reference-to-video generation... It does not
perform frame-by-frame transformation of existing video footage."* That is the
same sentence that killed H3 ref2va in section 4 - **but it does not kill this
one the same way.** H3 had no v2v path at all. Here the LoRA is weights plus a
conditioning node stacked on the LTX-2.3 checkpoint we already run v2v on, and
in a denoise ~0.3 pass the frame-for-frame motion lock comes from the **source
latents**, not from the conditioning. Whether reference conditioning survives a
partial-denoise init is a **bench question, not a documentation question**. Do
not re-reject it from the docs.

**4. Bench state: testable, but not yet.** `ComfyUI-BFSNodes` is already
installed at `G:\ComfyUi\ComfyUI\custom_nodes\ComfyUI-BFSNodes`, but it is an
older build - it registers `LTXVEditAnything*`, `BFSHeadSwap*`,
`ReservedRegionFrameComposer`, `FrameRangedFaceLoader`, `FaceSequenceBatch`, and
**no `LTX Identity Transfer` node**, which the model card names as its primary
node. The pack needs updating, and neither weight file is on disk
(`G:\CubricModels\loras\ltx-2.3\` holds only merged / transition / talkvid /
foley).

-> **Phase 3 stands, re-scoped.** Not "wire the ID LoRA we already have" - that
one is the wrong sense of identity. It is: update BFSNodes, fetch
`Best_FaceID_v1.0`, and test whether its reference conditioning composes with a
denoise~0.3 v2v pass on a face crop. Still gated behind Phase 0/2 showing the
failure is **drift**, not mush.

**Side value, outside this card:** the character-sheet variant takes 4-panel
sheet references, which is exactly the keystone artifact of
[[project_lora_free_character_system]]. Worth its own look regardless of what
this card does.

### D3 - `SeedVR2TemporalChunk`, and three things that change the plan

**Chunking is arbitrary-length and self-sizing.** The node consumes a **LATENT**,
not an image: 5-D `(B, 16, T, H, W)`, split on the temporal axis
(`comfy_extras/nodes_seedvr.py:423`). `chunking_mode` is `auto` (predicts the
largest chunk that fits free VRAM) or `manual` (`frames_per_chunk`, must be
4n+1). Clip length is not a constraint.

Then the three that matter:

**(a) The chunk crossfade is already built.** `SeedVR2TemporalMerge`
(`nodes_seedvr.py:517`) crossfades every overlap with a Hann window over the
middle third and flat shoulders on the outer thirds
(`_seedvr2_chunk_crossfade_weights`, `nodes_seedvr.py:416`), driven by the
`temporal_overlap` **output** of the chunk node wired into the merge node's
input. **Brief step 6 is free on the SeedVR2 branch** - a wire, not work. Only
the LTX v2v branch needs its own overlap handling.

**(b) `SeedVR2PostProcessing` already contains the brief's detail transfer.** Its
`color_correction_method` offers `wavelet`, which is
`wavelet_reconstruction(content, style)` =
**`content_high_freq + style_low_freq`** over a 5-level decomposition
(`comfy/ldm/seedvr/color_fix.py:45-60`, `constants.py:48`; node at
`nodes_seedvr.py:161`). Content = the restored frames, style = the original
resized crop. That is exactly `out = source_crop + (restored - blur(restored, r))`
from section 3, done multi-scale rather than at one blur radius, with no radius
to pick.

This does not breach the section 3 ban - the banned nodes are histogram /
`color-matcher` colour matching, which is what the `lab` and `adain` options here
are. But it sits under a menu labelled "color correction", so this is flagged,
not decided: **`MpiDetailTransfer` may be redundant**, and B6 gets a free
reference implementation to A/B the hand-wired version against. Fabio's call at
B6.

**(c) Two shape traps.** `cut_videos` (`nodes_seedvr.py:75`) pads the frame count
up to 4n+1 by **repeating the last frame** - 120 frames in, 121 out - so
paste-back must trim back to the source length or the clip gains a frozen tail
frame. And `SeedVR2Preprocess` **drops alpha** and pads spatially to a multiple
of 16.

### VRAM - predicted, not measured (partial B8)

`auto` mode's own arithmetic (`constants.py:8-11`):
`budget = free_GiB - 8.5 - 4x0.55`, then
`chunk_latent_max = budget / (0.55 x Mpx_per_frame)`, pixel frames = `4(n-1)+1`.
A 512x512 crop is 0.262 Mpx, so `chunk_latent_max = budget / 0.144`.

This box is an **RTX 4060 Ti, 16 GB**, 4.3 GB already resident. The fixed 8.5 GiB
reserve is over half the card, so the answer swings hard on what else is loaded:

| Free VRAM | Predicted chunk | 120-frame clip |
|---|---|---|
| ~15.5 GB (clean) | ~129 frames | one chunk, no seams |
| ~12 GB (as now) | ~33 frames | ~4 chunks, seams matter |

-> **Shut everything else down before B1**, and read the node's own
`SeedVR2TemporalChunk auto:` INFO line out of the bench log rather than guessing.
This also means **B5 is not a fixed property of the pipeline**: at crop
resolution on a clean card the whole clip may be a single chunk, and the seam
question only exists on a loaded one.

### B7 answered early - the union window fails on most real clips

Measured 2026-08-14 on **every mp4 in the Vision projects tree** (274 clips,
`face_yolov8n` at conf 0.35, 16 frames sampled evenly per clip, largest face per
frame, union squared and padded 30% exactly as section 2 step 2 specifies). The
plan budgeted "3-4 real clips" for this; the detector is cheap enough that all of
them ran, so B7 is closed before the bench was even up.

142 clips hold a tracked face in at least 12 of 16 sampled frames. Of those:

| | union > 50% of frame height | blowup median | p90 |
|---|---|---|---|
| **All 142** | **88 (62%)** | 2.31 | 7.85 |
| Single-face only (104) | **57 (55%)** | 2.19 | 5.56 |
| Multi-face (38) | 31 (82%) | 3.57 | 12.38 |

*blowup = union side / median face side. "union > 50%" is the point where the
window covers half the frame and the resolution win is mostly gone.*

The multi-face split was measured to rule out an obvious confound - "largest face
per frame" can jump between people, inflating the union for a reason that is not
subject motion. It is a real effect (82% vs 55%) but **it does not rescue the
rule**: over half of single-subject clips still blow the window, on clips only
3-5 seconds long.

-> **The static union window is not a viable v1.** Section 2's
`ponytail:` note deferred the smoothed window until "a real clip breaks it" -
the answer is that most real clips break it, and the median clip already needs a
window 2.2x the face it is trying to detail. `MpiFaceWindow` should be specced
with per-frame tracking (or per-segment windows) from the start, not as a
follow-up. This does not gate B1, which uses a hardcoded box by design.

**Caveat on scope:** these are generated clips from this machine's own projects,
which skew short and are mostly single-shot. A cut inside a longer clip would
make the union worse, never better.

### B1 source clip

Picked against the plan's criteria from the same scan - single-face, small face,
well-behaved window, detector solid across the clip:

- **Primary: `v1.1 LTX Examples/Media/t2v_ms_001.mp4`** - 2560x1408, 3.0s, face
  7.7% of frame height (~108 px), union window 14.3% (~201 px), blowup 1.85,
  face found in 16/16 sampled frames. Cropping ~201 px and sampling at 512 is a
  ~2.5x upscale, which is close to the brief's own 128->512 worked example.
- **Stress option: `cowboys/Media/ref2v_ms_006.mp4`** - 864x480, face 6.1%
  (~29 px), union 13% (~62 px). A 62->512 crop is over 8x. Keep in reserve for
  after the primary answers, so a NO-GO cannot be blamed on an unreasonable
  upscale.

Both live under `<Documents>/Cubric Vision/Projects/`.

### B1 - executed 2026-08-14, awaiting Fabio's verdict

Ran on the bench (core 0.31.0, RTX 4060 Ti 16 GB). Graph is the shipped donor
`comfy_workflows/raw/seedvr2_video.json` with `MpiBoxCrop` spliced in after the
loader - no detection, no paste-back, exactly as the plan specifies.

    MpiLoadVideo -> MpiBox(1173,300,208,208) -> MpiBoxCrop -> ImageResizeKJv2 512
      -> SeedVR2Preprocess -> VAEEncodeTiled -> SeedVR2Conditioning
      -> SeedVR2TemporalChunk(auto, overlap 2) -> KSampler -> SeedVR2TemporalMerge
      -> VAEDecodeTiled -> SeedVR2PostProcessing

- Model `seedvr2_3b_int8_convrot`, VAE `seedvr2_ema_vae_fp16`. KSampler
  **1 step, cfg 1.0, euler/simple, denoise 1.0** - SeedVR2 is a one-step
  restoration model, so this is the donor's own setting, not a shortcut.
- Clip `v1.1 LTX Examples/Media/t2v_ms_001.mp4`, 73 frames, 2560x1408. Window
  208x208 at (1173, 300), upscaled 2.46x to 512.
- **35.1 s** for sample + decode (load/crop/encode were cache hits from the
  previous attempt, so this is not a cold end-to-end number).

Three outputs so the comparison is against a fixed baseline, per the plan:

| | what |
|---|---|
| **A** | lanczos only - the crop upscaled, no model. The fixed baseline. |
| **B** | SeedVR2, `color_correction_method: none` - raw model output |
| **C** | SeedVR2, `color_correction_method: wavelet` - the section 3 detail transfer |

**Collapse detector** (laplacian variance, normalised per-frame against the
fixed lanczos baseline - used only to detect a within-clip collapse, never to
rank quality):

- B and C both carry **~10.8x** the baseline's high-frequency energy
  (min 8.3x, max 18.4x).
- Held across the clip - by thirds, **11.6x / 10.2x / 10.7x**. **No collapse.**
- B and C are within 0.02x of each other, as expected: `wavelet` swaps the low
  frequencies, which barely register in a laplacian.
- **One thing to watch by eye:** frame-to-frame laplacian change is **10.0% mean
  / 29.3% max** against the baseline's 3.5% / 10.4%. Roughly 3x the baseline's
  temporal jitter. Some of that is real detail moving with the face, but boiling
  would look the same to this metric - which is exactly why the gate is the eye.

**B5 did not arise in this run.** `auto` chunking logged
`free=14.36GiB, 0.26Mpx -> frames_per_chunk=73 (t_pixel=73)` - the entire clip
was one chunk, so there were no seams to see. That confirms the predicted table
above: at crop resolution on a clean card, chunking does not engage. Seams only
become a question on a loaded card or a longer clip.

**B and C are indistinguishable to Fabio** (2026-08-14): *"the WaveLet and the
RAW SeedVR 2 are basically the same in my eyes."* The metric agrees - they sit
within 0.02x of each other.

**This is not yet B6's answer, and must not be read as one.** It says SeedVR2
barely shifted colour *on this clip*, so the wavelet pass had little to correct.
It does not test what detail transfer exists for:

- **B1 skipped paste-back entirely by design.** The restored crop was judged on
  its own. Detail transfer earns its keep at the boundary with the surrounding
  frame, which nothing here exercised.
- The LTX v2v branch (B2) samples at a real denoise and invents more, so it has
  far more room to drift than a 1-step restoration model.
- Degraded footage - the case Fabio named - gives the sampler more latitude in
  every direction, colour included.

So `wavelet` stays free insurance for now: identical output when the sampler
behaves, low-frequency protection when it does not. Whether `MpiDetailTransfer`
needs to exist is still open, and is decided at B6 after paste-back exists.

**Judging assets** (in the session scratchpad `b1_compare/`):
`B1_side_by_side.mp4` (A | B | C, 24 fps, for flicker), and
`B1_200pct_frame002 / 037 / 073.png` (200% face crops at start, middle, end, for
sharpness and drift). Raw outputs and all 73 PNGs per branch are in
`D:\WORK\Images\Outputs\MPI557_B1_3b_*`.

**Verdict: GO.** Fabio, 2026-08-14, after viewing the 200% stills and the
side-by-side: *"looks fabulous, mate. If we manage to place this on a shitty
face video, it's gold, all right."*

The gate question - does a ~108 px face upscaled to 512 come back sharp, or
waxy - is answered **sharp**. Not plastic: the 200% crops carry visible skin
grain and brow hair, which is the opposite of the failure mode this gate
existed to catch. Phase 0 continues to B2.

**Scope note that came with the GO, and it changes the next test.** B1 ran on a
**clean 2560x1408 LTX generation**. The product case Fabio named is a *"shitty
face video"* - compressed, noisy, small soft face. That is a different input
distribution and B1 does not speak for it. Before Phase 1 specs anything, point
the same graph at genuinely degraded footage; the held-back stress clip
`cowboys/Media/ref2v_ms_006.mp4` (864x480, ~29 px face, 8x upscale) is the
nearest thing already on disk, and real compressed footage would be better
still.

### B2 - sampler bake-off, 2026-08-14. WINNER: SeedVR2

Same clip, same window, same 512 sample resolution as B1. Only the sampler
changed. Graph is `comfy_workflows/raw/ltx_v2v_template.json` **pruned to a pure
v2v** - that template is Video *Extend*, so `ImageBatchExtendWithOverlap` and
`LTXVAudioVideoMask` come out, and B1's `MpiBox`/`MpiBoxCrop`/`ImageResizeKJv2`
go in after the loader.

    MpiLoadVideo -> MpiBox(1173,300,208,208) -> MpiBoxCrop -> ImageResizeKJv2 512 (device cpu)
      -> VAEEncodeTiled -> LTXVConcatAVLatent(+ LTXVEmptyLatentAudio, silent)
      -> SamplerCustomAdvanced(euler_ancestral_cfg_pp, cfg 1.0, ManualSigmas)
      -> LTXVSeparateAVLatent -> VAEDecodeTiled -> SaveImage

- Model `ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot` + the baked
  `ltx-2.3\LTX23_softenhance_abliterated_detailer_merged` LoRA at 1.0/1.0 - the
  detailer this test is about. Gemma CLIP + text projection as shipped.
- **The AV latent concat is kept.** LTX-2.3 22B is a joint audio-video model;
  sampling a video-only latent is untested. Audio comes from
  `LTXVEmptyLatentAudio` (silent, 73 frames @ 24) and is discarded after
  `LTXVSeparateAVLatent`.
- **denoise == sigma0.** There is no `denoise` widget on this path -
  `SamplerCustomAdvanced` takes `ManualSigmas`, and in flow matching the first
  sigma *is* the denoise level. 0.30 ran `0.3, 0.2, 0.12, 0.05, 0.0`.

**The plan asked for ~0.3 only. 0.50 and 0.70 were added** so a NO cannot be
blamed on under-driving the branch - and they are the reason the answer is
solid rather than a schedule artefact.

| run | wall | peak VRAM | sharpness (x lanczos) | drift from source | jitter |
|---|---|---|---|---|---|
| **B - SeedVR2 3B** (B1) | 35.1 s | ~1.6 GiB in use (free 14.36 GiB logged) | **10.86x** (8.34-18.53) | 3.86 | 9.9% |
| D - LTX v2v 0.30 | 86.7 s cold / **30.3 s warm** | **15.71 / 16 GiB** | 2.15x | 2.81 | 3.1% |
| D - LTX v2v 0.50 | 30.3 s warm | 15.47 GiB | 2.22x | 4.11 | 3.1% |
| D - LTX v2v 0.70 | 32.4 s warm | 15.60 GiB | 2.45x | 5.72 | 4.5% |

Sharpness is the B1 collapse detector (laplacian variance per frame, normalised
against the same fixed lanczos baseline). Drift is mean absolute pixel distance
from that baseline, 0-255 - a *distance* measure, not a quality one. Neither
ranks two healthy runs; the eye does. They are here because the gap is 5x, not
because a metric decides this.

**What the numbers say.** More denoise buys LTX **drift, not detail**: sharpness
crawls 2.15 -> 2.45 while distance from the source doubles, 2.81 -> 5.72. There
is no setting where the LTX branch adds micro-detail and keeps the face. At 0.30
it is indistinguishable from the lanczos baseline; at 0.70 the brows and eyes
have visibly moved and the skin is *smoother*, not more detailed. SeedVR2 sits
at 10.86x with the lowest cost.

- **Speed is roughly a tie, warm** - 30 s LTX vs 35 s SeedVR2, both measured with
  loaders and encode cached, so it is a like-for-like number. LTX's 86.7 s cold
  is the 20 GB transformer loading.
- **VRAM is not a tie.** LTX pinned **15.71 of 16 GiB** on the 4060 Ti - a 20.03 GB
  int8 transformer on a 16 GB card, offloading throughout. SeedVR2 3B is 3.5 GB
  of weights and B1 logged 14.36 GiB still free mid-run. For a detail pass that
  must run *alongside* whatever generated the video, that is decisive.
- **Plastic-ness inverts the expectation.** The generative model is the waxy one
  here. SeedVR2's 200% crops carry skin grain and brow hair; LTX 0.70 renders a
  cleaner, flatter face.

**Judging assets** (session scratchpad `b2_compare/`): `B2_side_by_side.mp4`
(A lanczos | B seedvr2 | D 0.30 | D 0.70, 24 fps, for flicker) and
`B2_200pct_frame002 / 037 / 073.png`. All 73 PNGs per branch are in
`D:\WORK\Images\Outputs\MPI557_B2_ltx_d030 / d050 / d070`.

**Verdict: SeedVR2 wins.** Fabio, 2026-08-14, after viewing the side-by-side and
the 200% stills: *"B seedvr2 wins by a long shot."* Winner on all four
judgements - sharpness (10.86x vs 2.45x at best), identity stability (LTX drifts
as soon as it is driven hard enough to add anything), plastic-ness (LTX is the
waxier of the two), and VRAM (3.5 GB vs a 20 GB transformer pinning the card).
Speed is the one tie.

**The LTX v2v branch is closed, and B4 dies with it.** B4 was the LTX-only
denoise floor/ceiling sweep; B2 already ran 0.30 / 0.50 / 0.70 and showed there
is no floor-to-ceiling window where that branch both adds detail and holds the
face. Nothing left to sweep. Steps 5 and 6 of the section 2 pipeline collapse to
the SeedVR2 branch only - and `SeedVR2TemporalMerge` already does step 6, so the
per-branch crossfade work the brief scoped is gone too.

**One honest limit on this result.** It says LTX-2.3 v2v is the wrong tool for
*adding detail to a face crop*. It does not say the LTX branch is useless to
this card - a re-render at high denoise is a different product (replace the
face) with a different failure mode (it is no longer the same person), and
nothing here tested that. It is also not a verdict on degraded footage, which
remains the outstanding B1 caveat.

### B1-stress - degraded footage, 2026-08-14. FAILED, confirmed by Fabio

The re-run the B1 GO came with. Same graph, same SeedVR2 3B, different clip:
`cowboys/Media/ref2v_ms_006.mp4`, 864x480. Window read off frames 0 / 24 / 72 by
eye as B1 did - the face spans x 245-288, y 50-100 across the clip - squared to
**64x64 at (234, 43)**, which is an exact **8x** to 512 against B1's 2.46x.

**Result: the face does not come back. It comes back as sharp mush.** Hair,
fabric, the wagon canvas and the background are restored beautifully. The face
has no eyes, and the features melt.

Two controls were run to find out *why*, because "degraded footage" and "8x
upscale" changed at the same time and one run cannot separate them:

| run | window | factor | wall | sharpness (x its own lanczos) | jitter | face |
|---|---|---|---|---|---|---|
| 3b | 64 px | 8x | 43.3 s | 60.89x | 12.0% | destroyed |
| 3b, wider window | 128 px | 4x | 37.2 s | 36.80x | 5.5% | destroyed |
| 7b-sharp | 64 px | 8x | 41.2 s | 31.52x | 7.1% | destroyed, least badly |

- **Upscale factor is not the limiter.** Halving it to 4x with a window carrying
  twice the context restored the background even better and left the face just
  as broken.
- **Model capacity is not the limiter.** 7B-sharp produces the best hair in the
  set and the same eyeless face.
- **The limiter is the source.** Look at the `A source (lanczos)` panel: at 64 px
  this face has no eyes *in the pixels*. There is no identity signal to restore.

This is section 4 Level 1 failing exactly where section 4 predicted it would.
SeedVR2 is a **restoration prior with no identity source** - it recovers detail
that is present but buried, and it cannot invent an identity that was never
recorded. B1 worked because a 108 px face still carries eyes.

**Note what the metric did here.** The branch with the *worst* face scored the
*highest* sharpness - 60.89x, nearly six times B1's 10.86x. The number is
measuring how blurred the source was, not how good the output is. This is the
third time the laplacian has been observed picking a loser (memory
`tool_measure_generative_upscale_quality`), and it is the whole reason the gate
is the eye.

**What this changes.** The product claim has to be scoped: *detail a face that is
small* is answered GO; *rescue a face the generator already destroyed* is
answered NO for the restoration branch. Whether Phase 3 (identity) is optional or
load-bearing now depends on which of those Fabio means by "shitty face video" -
and the two are genuinely different inputs:

- **Small but intact** - a compressed phone video, a distant subject. Eyes are
  present, just mushy. This is B1's case and SeedVR2 handles it.
- **Small and already destroyed** - this clip. A *generated* video whose face the
  generator itself broke. No restoration model can fix it, because nothing is
  there. It needs an identity source, which is section 4 Level 2.

Level 2 is awkward now: B2 just closed the LTX v2v branch as a *detailer*. It did
not close it as an *identity* carrier, and this is precisely the case that would
need one - a generative pass with a reference. That is an open question, not a
decision, and it should not be settled without a bench run.

**Fabio, 2026-08-14, on this run:** *"these results were terrible. It just messed
up her face even more."* Confirmed - the restoration branch is a NO on this input.

**The clip was also the wrong test, and that is on the selection, not the
sampler.** 864x480 with a ~29 px face is not "a face that needs fixing", it is a
face that was never recorded. Fabio is supplying a **higher-resolution clip whose
face is messed up but present** - which is the actual product case and the input
this section should have been run against. B1-stress therefore answers *"can
restoration rescue a face with no pixels"* (no, definitively, three ways) and
does **not** answer *"can it fix a wrong-but-present face"*. That run is
outstanding.

**Selection rule for the replacement clip, so this does not repeat:** the source
face must carry recoverable structure at native resolution - eyes readable as
eyes in the un-upscaled frame. Check the `A source (lanczos)` panel *before*
spending a run: if the baseline has no eyes, no restoration model can put them
back and the run measures nothing.

**Judging assets** (session scratchpad `b1s_compare/`): `B1S_side_by_side.mp4`
and `B1S_face_frame002 / 024 / 048 / 073.png` (source | 3b 8x | 3b 4x | 7b-sharp).
PNGs in `D:\WORK\Images\Outputs\MPI557_B1S_*`.

**VRAM on these runs is not a clean number** - 14.11-14.17 GiB peak, measured with
the 20 GB LTX transformer from B2 still resident on the card. B1's own logged
`free=14.36GiB` is the trustworthy SeedVR2 figure.

### B10 - the REAL degraded case, 2026-08-14, awaiting Fabio's verdict

The clip Fabio supplied after B1-stress proved to be the wrong test:
`cowboys/Media/ref2v_ms_062.mp4`, 1920x800, 124 frames. Copied to the session
scratchpad first - it is an active project and the originals were not touched
again. He also supplied the character sheet `t2i_022.png` (1792x1120); see
"the sheet is unused" below.

**This is the case nothing had tested: a face with enough pixels to exist, that
the generator got wrong.** Median face height over the shot is **112 px** -
*larger* than B1's 108 px. It is not a small-face problem, it is a wrong-face
problem.

Three things about the input changed the plan before a single sample ran.

**1. The clip contains a CUT.** Frame-difference scan finds a hard cut at frame
77: shot A (0-76, the wide riding shot, small face) and shot B (77-123, an
extreme eye close-up that needs no detailing at all). A clip-wide window is not
merely bad across a cut, it is meaningless. Shot A was cut to its own file and
everything below runs on that.

**2. Largest-face-per-frame is not a tracker, and it fails on this shot.** Running
`face_yolov8n` over shot A finds a face in **77/77** frames - but 6 frames carry
more than one face, and taking the largest box alternates between two people. The
resulting "union" was **1055 px wide**, half the frame, from a 112 px face. A
one-line nearest-centre track seeded on the target collapses it to **202 x 221**.

**3. The window that survives is 288x288 at (1104, 220)** - squared, padded 30%,
which is **2.57x the median face** and 36% of frame height. That is B7's measured
median blowup (2.2x) reproduced on a fresh clip, and it is why `MpiFaceWindow`
cannot be a static union box.

| run | sample res | factor | wall | peak VRAM | chunks | sharpness (x source) | jitter |
|---|---|---|---|---|---|---|---|
| SeedVR2 3B | 512 | 1.78x | 39.7 s | 12.49 GiB | 1 x 77 | **3.78x** | 12.9% |
| SeedVR2 3B | 768 | 2.67x | 72.6 s | 12.97 GiB | 2 x 41, overlap 2 | 2.99x | 17.6% |

Both scored against the same lanczos source baseline, with the 768 run downscaled
to 512 first so the two sample resolutions are compared on equal pixel counts.

**B3 gets its first real answer, and it is not the expected one: 768 is WORSE
than 512 here**, at 1.8x the wall clock. Sampling above the model's comfortable
scale dilutes rather than adds - 2.99x against 3.78x. On a 288 px window, returns
die *before* 768. Whether that is a property of the window size or of SeedVR2
itself needs the 1024 run and a second window size before it becomes a rule.

**B5 gets its first real answer too: no seam.** The 768 run is the first in this
card to actually chunk - `frames_per_chunk=41` over 77 frames, overlap 2, so the
join sits at frame 41. A frame-to-frame delta probe across frames 36-46 shows the
768 run tracking the single-chunk 512 run and the source within noise
(17.2-20.7 against 17.7-20.5), with **no step at the join**. `SeedVR2TemporalMerge`'s
Hann crossfade is doing its job. Confirm by eye before treating it as settled.

**A graph bug worth keeping - it is a silent one.** `SeedVR2Conditioning` must be
built from the **same latent the sampler receives**. The donor wires one
`MpiIfElse` output to both `KSampler.latent_image` and
`SeedVR2Conditioning.vae_conditioning`; feeding conditioning the *unchunked*
latent instead works fine for as long as `auto` returns a single chunk, then dies
the moment it splits:

    SeedVR2 conditioning shape must match latent batch/temporal/spatial
    dimensions; got latent (1, 16, 11, 96, ...)

That is why it survived B1, B1-stress and the 512 run here undetected - every one
of them was single-chunk. Any hand-built SeedVR2 graph must wire conditioning off
the chunker output.

**The character sheet is unused, and cannot be used on this branch.** SeedVR2 has
no reference input - `SeedVR2Conditioning` takes only `(model, latent)`. An
identity sheet is a section 4 **Level 2** asset and needs a carrier that accepts a
reference. Holding it for that question; it is not wasted, it is just not
answerable here.

**Judging assets** (session scratchpad `b10_compare/`): `B10_side_by_side.mp4`
(source | 512 | 768) and `B10_face_frame005 / 025 / 041 / 060 / 077.png` - frame
041 is deliberately the 768 run's chunk join. PNGs in
`D:\WORK\Images\Outputs\MPI557_B10_cowboy_3b_512 / _768`.

**Verdict: weak.** Fabio, 2026-08-14: *"The result is not that great. It's just
cleaned up the noise. That's it."* Why, measured, is the section below.
**SUPERSEDED 2026-08-14 - read § CORRECTION - B10 was under-resolved before
citing anything in this section.** The face reached the sampler with 25% fewer
pixels than B1's did, so this run does not isolate wrongness, and its
768-vs-512 answer was scored in a way that cannot detect a resolution win.
**Correction from Fabio, 2026-08-14 - `MpiFaceWindow` does NOT need shot
detection.** *"The user would do that as well. It would cut only the part that has
the face and provide that to the model, and then the close-up would be cut off,
obviously, because it doesn't need it."* Trimming to a single shot is the user's
job, done before the clip reaches the tool. The cut in B10's clip is therefore a
property of that raw source, not a case the node must handle. **The tracking and
multi-face findings above still stand** - those happen *within* one shot.


### THE PHASE 0 FINDING - restoration fixes SOFT, not WRONG

> **PARTIALLY SUPERSEDED 2026-08-14.** The law below still holds on its own
> reasoning, but **B10 is no longer its evidence** - that run was starved of face
> pixels, not merely fed a wrong face. Read § CORRECTION - B10 was under-resolved
> alongside this section.

**Fabio on B10, 2026-08-14:** *"The result is not that great. It's just cleaned up
the noise. That's it. Perhaps the provided video is not great. I'm not sure."*

The video is fine. It is the opposite of not-great, and that is the finding.

Source sharpness measured on each run's own lanczos crop at 512, so all three are
directly comparable:

| clip | geometry | src lapvar | src HF frac | restored / src |
|---|---|---|---|---|
| B1 - clean LTX gen | 108 px face, 2.46x | **1.7** | 0.312 | 10.92x |
| B1-stress - 864x480 | 29 px face, 8x | 1.8 | 0.220 | 61.05x |
| **B10 - cowboy** | 112 px face, 1.78x | **13.5** | 0.259 | **3.84x** |

**B10's source is roughly 8x sharper than B1's.** SeedVR2 is a restoration prior:
it supplies high frequency where high frequency is *missing*. Feed it a source
that is already sharp and there is no deficit to fill, so what is left to do is
denoise - which is precisely what Fabio saw. The multiplier tracks the deficit
inversely across all three clips (1.7 -> 10.9x, 1.8 -> 61x, 13.5 -> 3.8x), and
that relationship is the whole story of this card so far.

**So the three runs are not three results, they are one law:**

| source | what is wrong with it | SeedVR2 |
|---|---|---|
| soft, face intact (B1) | missing high frequency | **fixes it** - the GO |
| soft, face never recorded (B1-stress) | no identity in the pixels | sharpens mush |
| sharp, face wrong (B10) | wrong *structure* | denoises, nothing more |

**A restoration model cannot change face STRUCTURE.** It has no identity source
and it is not asked to move anything - by construction, section 4 Level 1.

**And that is the harder half of the original complaint.** Fabio's opening line
was *"small faces lose identity and sometimes look distorted"*. Those are two
different defects. **Distorted is wrongness, and the restoration branch does not
answer it.** The branch answers "lose identity" only in its blur sense.

**What this points at, for the next session to decide - not decided here:**

1. **Section 4 Level 2 is no longer optional.** Fixing a wrong face needs an
   identity source and a model willing to move geometry. Fabio has already
   supplied the asset: the character sheet `t2i_022.png`.
2. **B2 must be re-read, not re-run.** B2 closed LTX v2v as a *detailer* because
   at denoise 0.5-0.7 it restructured the face - recorded there as "drift". With
   an identity anchor, restructuring toward the *right* face is the goal, not the
   failure mode. B2 explicitly did not close LTX as an identity carrier.
3. **There are already two head-swap assets, and they are NOT the same thing.**
   Corrected 2026-08-14 by reading the flow's node inventory rather than its
   filename:
   - The **bench lora enum** carries `LTX2.3\head_swap_v3_rank_64.safetensors`
     and `LTX2.3\head_swap_v3_rank_adaptive_fro_098.safetensors` - these are for
     the LTX-2.3 checkpoint we ship, and are still unlooked-at.
   - `comfy_workflows/raw/flow_head_swap.json` is **not LTX**. It is
     **Qwen-Image-Edit 2511** - `TextEncodeQwenImageEditPlus`, `UNETLoader`,
     `bfs_head_v5_2511_merged_version_rank_32_fp32` plus the Lightning 4/8-step
     LoRAs, cropping through `InpaintCropImproved`/`InpaintStitchImproved` and
     windowing through `MpiBox`/`MpiBoxCrop`/`MpiBoxMask`.

   So the repo flow **is** a reference-conditioned identity carrier - it has the
   input SeedVR2 structurally lacks, and it already uses this card's own face
   window primitives. But it is a **still-image** graph: applied per frame it
   reintroduces exactly the temporal flicker section 1 exists to avoid. It is a
   lead for the wrongness branch, not a solution.

**A cheaper question to ask first, though:** is the *product* case soft faces or
wrong faces? If a user's real complaint is small-and-soft, B1 already says GO and
the card can ship the restoration branch without touching identity at all. B10
was chosen to probe wrongness. Whether wrongness is the thing worth building for
is Fabio's call, and it decides whether this card stays one card or becomes two.

### SCOPE DECISION - Fabio, 2026-08-14: SOFT faces

**Answer: A - soft faces.** The product target is small-and-soft. The restoration
branch ships as-is on the B1 GO, and identity work is out of scope for this card.

Consequences, binding on the rest of Phase 0:

- **SeedVR2 is the sampler, settled.** No further sampler questions.
- **B1-stress is closed as an out-of-scope probe, not a failure.** A 29 px face
  carries no identity to restore; that is not the product case.
- **B10 is INCONCLUSIVE, not a failure and not proof of anything.** See the
  correction below - it was under-resolved, and the "wrong face" reading is only
  one of two explanations that fit.
- **Section 4 Level 2, the character sheet `t2i_022.png`, the LTX2.3 head_swap
  LoRAs and the Qwen `flow_head_swap.json` are all PARKED.** Not rejected. If
  wrongness ever becomes the target it is a **separate card**, and the three
  leads above are its starting point. Do not fold them back into MPI-557.
- **Remaining Phase 0 is settings + paste-back only:** B3 (crop resolution),
  B5 (chunk seams), B8 (VRAM ceiling at 120 frames), B6 (frequency-separation
  paste-back). Then the verdict section, then the build plan.
- **The gating risk moves to B6.** With the sampler settled, the only thing left
  that can still sink the card is paste-back: if frequency separation ghosts or
  the graft is visible, a GO on the crop does not survive the composite. B6 is
  now the highest-value remaining run, not the last one.

### CORRECTION - B10 was under-resolved, not proof of wrongness

**Fabio, 2026-08-14:** *"The guy's face wasn't that bad, and there weren't enough
pixels to make it that much better. This falls back to what happens in image
detailing as well... what he needs to do is just upscale first with a simple
upscaler and then try restoration, and that happens a lot better. The previous
test with the cowboy was probably missing that upscale phase, but that's not up
to us. That's up to the user, so it might not have been a fail."*

**He is right, and the geometry already recorded in this brief proves it.** The
comparison that matters is not source face height, it is **how many pixels the
face occupies inside the sampled crop** - and B10 lost that comparison despite
having the *larger* source face:

| run | window | face | face % of window | upscale | **face px at 512 sample** |
|---|---|---|---|---|---|
| B1 (GO) | 208 px | 108 px | 52% | 2.46x | **266 px** |
| B10 (weak) | 288 px | 112 px | 39% | 1.78x | **199 px** |

B10's face was 4 px taller at source and arrived at the sampler with **25% fewer
pixels**, because the 30% pad on a 2.57x-blown-up window spent the resolution
budget on background. The `112 px face` headline made B10 look like the
better-resourced run. It was the worse-resourced one.

**Two consequences, and the second is a design lever we own.**

1. **The wrongness conclusion is downgraded.** "SeedVR2 denoised because the face
   was structurally wrong" and "SeedVR2 denoised because it was starved of face
   pixels" both fit every number in B10. The run cannot separate them, so it
   proves neither. The *law* above (restoration supplies missing high frequency,
   and cannot supply what is not missing) still stands on its own reasoning -
   section 4 Level 1 - but **B10 is not its evidence.** Nothing in Phase 0 has
   actually tested a wrong face at an adequate pixel budget.
2. **"Upscale first, then restore" is not only the user's job - it is B3.** In
   Fabio's image-detailing analogy the user pre-upscales the footage. Inside this
   pipeline the equivalent lever is ours: the crop -> `ImageResizeKJv2` factor is
   exactly that pre-upscale, and **window padding is a hidden tax on it.** Two
   knobs fall out, neither yet measured:
   - **Sample resolution should be driven by the FACE, not the window.** Sizing
     the resize so the *face* lands at a target height makes the pad free instead
     of expensive.
   - **Pad tighter.** 30% on an already-2.57x window is the difference measured
     in the table.

**And this invalidates B10's 768-vs-512 answer.** The two runs were scored *after
downscaling the 768 result to 512* so the pixel counts matched. That normalisation
is fair for judging sharpness-per-pixel and structurally **cannot show a benefit
from extra resolution** - it throws away the exact thing more resolution buys,
before measuring. So "768 is worse than 512" is an artifact of the scoring method
as much as a finding. **B3 must be re-run and judged at native resolution, by
eye.** The B5 no-seam result from the same run is unaffected - that was a
frame-to-frame delta probe, not a resolution comparison.

### B3 re-run - 2026-08-14, six runs on the B1 clip, awaiting Fabio's verdict

Bench rebooted (core 0.31.0, RTX 4060 Ti 16 GB), schema gate passed - all five
`SeedVR2*` nodes plus `MpiBox`, `MpiBoxCrop`, `ImageResizeKJv2`, `VAEEncodeTiled`,
`VAEDecodeTiled` and **`ImageBlur`** (which B6 needs) present. Same clip as B1
(`t2v_ms_001.mp4`, 73 frames, 2560x1408), same graph, SeedVR2 3B, seed 20260814.
Two variables swept: **sample resolution** and, new this session, **window pad**.

Face geometry measured with `face_yolov8n` over all 73 frames, filtered to
detections inside the B1 window (largest-per-frame picks up a second face and
returns a useless 1125 px union - the same multi-face trap B10 hit):

- median face height **108 px**, but the face's **travel union is 115 x 160 px**.
  The face is 108 tall and moves through a 160-tall envelope over the shot.

| window | pad x median face | sample | **face px delivered** | wall | peak VRAM |
|---|---|---|---|---|---|
| 208 | 1.93 | 512 | 266 | 47.8 s | 14.92 GiB |
| 208 | 1.93 | 768 | 400 | 97.5 s | 15.57 GiB |
| 208 | 1.93 | 1024 | 533 | 194.4 s | 14.09 GiB |
| **176** | **1.63** | **512** | **315** | **36.3 s** | 14.35 GiB |
| **176** | **1.63** | **768** | **472** | 101.3 s | 13.44 GiB |
| 144 | 1.33 | 512 | 385 | 34.4 s | 12.58 GiB - **CLIPS** |

**1. The pad tax is real and it is free money.** `176 @ 512` delivers **315 face
px in 36.3 s** against `208 @ 512`'s **266 px in 47.8 s** - *more* face resolution
for *less* wall clock, because the smaller window means fewer pixels sampled.
Same at the next rung: `176 @ 768` gives 472 px vs `208 @ 768`'s 400 px at
effectively the same cost (101.3 s vs 97.5 s). **18% more face for free.** This is
Fabio's "upscale first, then restore" instinct, as an internal lever.

**2. The window must cover face TRAVEL, not face size.** `144` is 1.33x the
*median* face and looks generous - it clips 7 px off the top and 8 px off the
bottom of the travel envelope. The rule is therefore **pad the union of the face
across the shot**, not the median box. `MpiFaceWindow` already has to track; this
says what it must output.

**3. VRAM does not climb with sample resolution.** 14.92 / 15.57 / 14.09 GiB for
512 / 768 / 1024 - the chunker adapts, so 1024 is not a ceiling at 73 frames.
Partial B8; the 120-frame question is still open.

**4. NO METRIC CAN RANK THESE, and that is now settled rather than suspected.**
The B10 method (downscale everything to a common size) erases the benefit of
resolution before measuring. Scoring at native resolution has the *opposite*
confound: laplacian variance falls as the same edge spreads over more pixels, so
the ladder reads 7.27x / 4.35x / 3.10x for 512 / 768 / 1024 - which measures
scale, not quality, and would "prove" 512 wins. **Both normalisations are wrong in
opposite directions.** There is no single-number sharpness comparison across
sample resolutions on this card. Stop trying to build one - the plan's front-loaded
decision (judge by eye, metrics as collapse-detector only) was correct, and this
is the third time the metric has tried to pick a winner it cannot see.

**Judging assets** (session scratchpad `b3_compare/`), built so nothing is ever
downscaled - every panel is upscaled `INTER_NEAREST` to the largest run's size,
which adds no smoothness the run did not produce:

- `B3_side_by_side.mp4` - all seven strips, for identity stability and jitter.
- `B3_face_frame005 / 020 / 040 / 055 / 070.png` - stills.
- `native_*_f040.png` - each run at its own native pixels, for 1:1 peeping.

**Open for Fabio's eye:** (a) where do returns actually die - 512, 768 or 1024;
(b) does `176` framing look right or too tight; (c) does the clipping run visibly
cut the chin, confirming the travel-union rule.

### B3 verdict + the drift artifact - 2026-08-14

**Fabio's verdict, verbatim: *"the bottom right one is the best one"*** - the
`144 / 512` tile: 385 face px, 34.4 s, 12.58 GiB. It reached this session by relay:
he pasted the grid into the MPI-536 foley session by mistake, and that session
forwarded it as message `4f94885d` (acknowledged). Its analysis is folded in below.

**His eye picked face pixels per second, which is the pad lever working.** Of the
seven tiles that one carries the second-most face pixels at the *lowest* cost. Both
knobs are now confirmed by his judgement, not only by geometry.

**But that tile clips, and it is arithmetic, not a framing opinion.** The face
travels through a **160 px-tall envelope** while measuring 108 px tall, so a 144
window cannot contain it *at any centre*. Measured per frame against the tracked
boxes: **the face is cut in 24 of 72 frames, worst 8 px** (frames 10-13, 23-25,
35-38, 43-44, 54-56, 60-63, 67-70). One frame in three.

**Resolution: keep what he picked, drop the clipping.** `176 @ 640` delivers **393
face px** - two more than his pick - in **68.6 s**, with no cut. That is the
recommended default shape, and it generalises as a rule rather than a number:

> **window = union of the face box across the shot + ~10% margin;
> sample resolution = whatever lands the face at ~380-400 px.**

#### The 'wavy shadows' - measured, and it is a one-word fix

Fabio, on every tile: *"wavy kind of shadows on the video ... in still frames you
can't really see it, but when you look at the video you can. Like clouds moving on
top of the video."*

The forwarded message identified this as **MPI-506 § 2e DEFECT 3**,
`color_correction_method` on `SeedVR2PostProcessing`, and it was right. **Every B3
run used `none`. The app ships `lab`.** The drift was uncorrected in all seven
tiles he judged.

Swept at `176 / 640`, all four modes, against a lanczos baseline rebuilt at the
same geometry, low spatial frequencies only (Gaussian sigma = res/16), luma, 0-255.
**`temporal sd` is the column that matters** - how much the drift *moves* over the
shot, which is what reads as clouds sliding:

| correction | drift p2..p98 | max abs | **temporal sd** |
|---|---|---|---|
| `none` (what B3 ran) | -1.3 .. 5.0 | 12.3 | **1.19** |
| **`lab` (shipped)** | -0.9 .. -0.1 | 2.7 | **0.10** |
| `wavelet` | -0.7 .. -0.2 | 2.5 | **0.09** |
| `adain` | -3.7 .. 2.1 | 9.8 | 0.86 |

**`lab` cuts the moving component 12x, `wavelet` 13x, `adain` barely helps.** Same
ordering MPI-506 measured independently, so two cards agree. The artifact was not a
property of the pipeline - it was a wrong argument in the bench runner.

Cost is nil: correction is a post-process, so with the sampler cached each variant
re-ran in **4.1 s**. (The first `lab` run cost 33.5 s only because the intervening
176 runs had evicted the cache.)

**Caveat, stated rather than buried:** the baseline was rebuilt with cv2
`INTER_LANCZOS4` rather than `ImageResizeKJv2`'s lanczos, so the absolute numbers
carry a small systematic offset. All four variants share that baseline, so the
*ranking* - the finding - is unaffected.

**Assets** (scratchpad `b3_compare/`, H.264 so Windows plays them; the first
attempt was mp4v at 4858 px wide, over the 4096 limit most decoders enforce, and
would not open):

- `B3_colorcorrection_h264.mp4` - source + all four modes, 3200x670, in motion.
- `B3_driftmap_h264.mp4` - the drift itself at 8x gain. `none` visibly breathes;
  `lab` and `wavelet` sit flat.
- `B3_grid_h264.mp4` - the original 2x4 resolution/pad grid.

**Still open for Fabio's eye:** does `176 @ 640` + `lab` look right - does fixing
the clip and the drift preserve what made his pick the best one.

### The wavy shimmer, ROOT-CAUSED 2026-08-14 - it is in the SOURCE, not the model

Fabio, after seeing `lab` still shimmer: *"lab shipped is the best one but it still
has the wavy stuff ... I can't remember if I settled for less wavy shit or if we
carried on until we had no wavy shit at all"*, and then the question that drove
this to root: *"I just find it weird that SeedVR2, which everybody's talking about
as the best open-source model to upscale videos, would upscale a video with wavy
shit on the face of their characters."*

**He was right on both counts, and the second question found the answer.**

**1. MPI-506 settled, it did not solve.** Its own words: `lab` and `wavelet`
*"both cut worst-case drift ~45%"* (36 -> 19 max abs). Colour correction was always
a mitigation. **And the node offers exactly four methods** - `lab`, `wavelet`,
`adain`, `none`, confirmed off `/object_info` - both cards swept all four, so there
is no untried setting. That question is closed.

**2. Temporal VAE tiling is NOT the cause.** `temporal_size` 64 vs 128 on 73 frames
produced **byte-identical output** (drift equal to 4 dp). The SeedVR2 VAE compresses
time, so 73 frames were never more than one temporal tile. The donor
`raw/seedvr2_video.json` also uses the same `[512, 128, 64, 8]` tiled VAE and `lab`,
so we are not diverging from the reference. Hypothesis killed for ~70 s of GPU.

**3. FROZEN-INPUT TEST - the model's own instability is real but sub-visible.** Fed
73 identical frames (lossless, verified worst frame-to-frame delta **0**), SeedVR2
still varies its output. Per spatial band, temporal sd on a 0-255 scale:

| model / correction | low (s32) | mid (s8) | fine (s2) | fine max swing |
|---|---|---|---|---|
| 3B `none` | 0.294 | 0.208 | 0.299 | 8.7 |
| 3B `lab` | **0.014** | 0.124 | **0.290** | 8.4 |
| 7B `lab` | 0.013 | 0.091 | 0.230 | 6.4 |
| 7B-sharp `lab` | 0.014 | 0.101 | 0.251 | 7.4 |

Two things fall out. **`lab` kills the low band (21x) and does nothing to the fine
band** - which is why no colour-correction value was ever going to remove what
Fabio sees; it is not a colour problem. And **Fabio's own eye on the frozen clips:**
*"her face doesn't have anything moving ... the grey stuff has stuff moving"* - the
artifact is only visible in the x16 drift map. So the model's intrinsic swim is
**below visibility**, and cannot be what he sees on real clips.

**4. THE ROOT CAUSE: the shimmer is already in the LTX source, and SeedVR2 sharpens
it.** Motion confounds any temporal measure, so source and restored were compared
as a ratio - detail gain against churn gain, per band, on the real clip at
`176 / 512` with `lab`:

| band | detail gain | churn gain | reading |
|---|---|---|---|
| low (s32) | x0.99 | x1.01 | unchanged |
| mid (s8) | x1.04 | x1.11 | tracks |
| **fine (s2)** | **x1.45** | **x1.58** | **churn tracks detail** |

**Churn rises in proportion to sharpening in every band.** SeedVR2 is not injecting
temporal instability - it is a faithful restorer, and restoring detail necessarily
restores the source's own temporal noise with it. The test clip is an LTX
generation that already shimmers; sharpening it 1.45x makes the shimmer 1.58x more
visible. **Nothing is wrong with the model, and nothing is wrong with our graph.**

**Consequences for this card, and they are load-bearing:**

- **Stop looking for a sampler-side or correction-side fix.** There isn't one. Ship
  `lab` (it does remove the low-frequency drift, cheaply) and treat the remaining
  shimmer as a source property.
- **This lands directly on B6.** Frequency-separation paste-back grafts the
  restored *high* frequencies onto the source - which is exactly the band that
  carries the amplified shimmer. A naive graft imports it wholesale. B6 must now
  answer a sharper question than "does the maths work": **how much of the finest
  band to graft**, and whether it needs temporal smoothing before it lands.
- **Judge shimmer on real degraded footage, never on an LTX generation.** The test
  clip's shimmer is a property of how it was made. A user's real clip carries
  compression noise instead, and the same amplification logic applies to that.
- 7B is mildly steadier than 3B on the frozen test (fine sd 0.230 vs 0.290). Not a
  reason to switch on its own; note it for the settings table.

**Assets:** `B3_frozen_none_x16.mp4` / `B3_frozen_lab_x16.mp4` (output beside the
x16 drift map - the artifact is invisible at x1, which is the point) and
`B3_shimmer_source_vs_restored.mp4` (lanczos source left, SeedVR2 `lab` right, same
geometry - the source's own shimmer is visible there before any model touches it).

### Bench facts corrected

- Bench core is **0.31.0**, not the 0.30.2 recorded at plan time.
- Bench path is `G:\ComfyUi\ComfyUI\` (nested) - `G:\ComfyUi\custom_nodes\` does
  not exist.
- `custom_nodes` confirmed present: `ComfyUI-LTXVideo`, `comfyui-impact-pack`,
  `ComfyUI-Impact-Subpack`, `comfyui-kjnodes`,
  `comfyui-inpaint-cropandstitch`, `ComfyUi-MpiNodes` (symlink).

---

## Open questions

- Multiple faces in one shot: v1 does the largest only. One run per tracked face
  is the obvious extension, unscoped.
- Subject crossing frame: union window degrades to useless. Smoothed window is
  the fix, deferred until a real clip breaks it.
- Frame budget: 5s @ 24fps = 120 frames. Chunk size vs VRAM unmeasured.
