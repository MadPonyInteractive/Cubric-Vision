# MPI-506 Validation

**Outcome: DROPPED, not delivered.** No app code shipped and none is expected.
What follows validates the *evidence* the card produced, since that evidence is
what the decision rests on. Fabio's call, 2026-08-16: *"we're going to drop
SeedVR implementation. We'll need to explore other ways, like, for example,
using LTX Upscaler."*

## What WAS delivered and verified

| Claim | How it was proven |
|---|---|
| Both workflows run end to end | `comfy_workflows/seedvr2_image.json` + `seedvr2_video.json`, converted against `:48188`, injection-gated, EXECUTED. Commit `57c92ae9` |
| Core nodes beat `numz/ComfyUI-SeedVR2_VideoUpscaler` | Both installed on the bench and run on the same clip/seed/factor. Matched chunk (33 frames): core 3.86 detail vs pack 2.57, core 13% faster. Brief S 2f-ter |
| BlockSwap does not fix the OOM | Escalated 0 -> 16 -> 32 + `swap_io_components`: 13.62 -> 13.21 -> 12.03 GiB allocated, still 1.46 GiB short every time. Brief S 2f-ter |
| SeedVR2 sharpens rather than reconstructs | Radial-FFT gain vs a fixed lanczos baseline, with an h264 re-encode CONTROL at top/mid 1.06 ruling out the codec. Measured 0.57 at 1.5x, 0.43 at 2x, 0.24 at 3x - monotonic. Brief S 2k |
| It is still far beyond a `.pth` upscaler | Same method: SIAX scores mid 1.23 / top 1.10 (near no-op) vs SeedVR2's 6.18 / 3.50, and the visual gap is obvious in `AI_siax_vs_seedvr2_f45.png`. **This is why "no better than SIAX" is NOT the finding** |
| The 16 GB ceiling | 2x on a 1.03 Mpx source needs `fpc = 13` (33 OOMs); 3x runs only at `fpc = 5`, the model's own temporal floor, in 1278s for a 2-second clip |

Evidence clips and frames: `C:\Users\Fabio\Downloads\seedvr2-eval\`.

## Corrections made during the work - each one changed a conclusion

1. **`fpc = 33` is not a universal optimum.** It won on the first clip (3.86 vs
   3.46 at 57) and LOST on the second (3.67 vs 3.79). Content- and
   aspect-dependent; the shipped **57 stays**. One clip was not enough, and the
   change was nearly made off it.
2. **3x does NOT OOM.** Reported as an OOM from a `/history` read taken while the
   job was still in flight, which picked up two earlier 2x failures. It completes
   at `fpc = 5`. Corrected in commit `fa5f6cd5`; the sharpening finding was
   strengthened, not weakened, by the real result.
3. **A stated hypothesis failed and is recorded as failed.** The prediction was
   that a higher factor would force reconstruction and raise top/mid. It fell at
   every step instead.
4. **The numz pack's parent repo was wrongly dismissed** in S 2f as unofficial,
   from evidence that only applied to a 0-star fork. Corrected in S 2f-bis, then
   settled by measurement in S 2f-ter rather than by reputation either way.

## What was NOT validated, and must not be assumed

- **`--lowvram`.** Every number here is NORMAL_VRAM bench; the app launches
  `--lowvram` on every NVIDIA GPU (`routes/comfy.js:432`). Any figure reused
  elsewhere - especially in MPI-557 - needs re-measuring under it.
- **7B / 7B Sharp under the S 2k analysis.** They lost at 1.5x on the real clip
  (S 2h) and share the one-step, no-conditioning architecture, so no different
  *signature* is expected - but it is unmeasured.
- **The image path.** None of S 2k's objections apply to it: no chunker, no
  temporal-consistency requirement, and a single frame has headroom the video
  path never gets. Untested against this analysis.

## Disposition

- Workflows stay committed - proven, and reusable if SeedVR2 returns.
- The numz clone is left disabled at
  `G:\ComfyUi\ComfyUI\custom_nodes\seedvr2_videoupscaler.disabled`; its 3.7 GB in
  `G:\ComfyUi\ComfyUI\models\SEEDVR2\` can be deleted, nothing we ship reads it.
- **SeedVR2 remains a live candidate in MPI-557's step-5 bench** - on a face crop
  (~100x fewer pixels) the VRAM and runtime objections largely evaporate.
- **MPI-507 absorbs the dropdown mechanism** this card was going to build, and is
  unblocked. Build it image-only: the `kind: 'video'` half now has no consumer.
- Successor directions, neither carded: the **LTX upscaler** (regenerative,
  conditioned, multi-step - it has the semantic prior SeedVR2 structurally lacks)
  and Fabio's **upscale-then-interpolate** pipeline.
