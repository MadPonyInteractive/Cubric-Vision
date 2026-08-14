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

**Judging assets** (in the session scratchpad `b1_compare/`):
`B1_side_by_side.mp4` (A | B | C, 24 fps, for flicker), and
`B1_200pct_frame002 / 037 / 073.png` (200% face crops at start, middle, end, for
sharpness and drift). Raw outputs and all 73 PNGs per branch are in
`D:\WORK\Images\Outputs\MPI557_B1_3b_*`.

**Verdict: NOT YET STATED.** Per this plan's verify mode, B1 does not close
without Fabio looking at the output. Nothing above is a GO.

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
