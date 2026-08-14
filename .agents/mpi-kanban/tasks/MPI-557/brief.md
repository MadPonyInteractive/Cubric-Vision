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

## Open questions

- Multiple faces in one shot: v1 does the largest only. One run per tracked face
  is the obvious extension, unscoped.
- Subject crossing frame: union window degrades to useless. Smoothed window is
  the fix, deferred until a real clip breaks it.
- Frame budget: 5s @ 24fps = 120 frames. Chunk size vs VRAM unmeasured.
