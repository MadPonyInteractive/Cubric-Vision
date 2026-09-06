# Validation — MPI-701

**Verified by:** Fabio, on his own bench (RTX 4060 Ti 16GB, ComfyUI at `G:/ComfyUi`), 2026-09-06.
**Verdict:** PASSED on both paths.

## What was wrong

`MpiWindowedSampler` handed every window the sliced video but the **whole** soundtrack
(`sampler.py`, `_rejoin_av(seg_video, audio)`). H3 pairs audio tokens with video frames by
index — `MiniMaxH3AV.fix_empty_latent` sizes them `round(frame_count * 5/3)` — so a window
starting at latent frame 15 was told it begins at t=0. On a 124-frame clip planned as
`spans=[(0,22),(15,37)]` that is a ~2 s offset in window 2: the mouth opens but does not
track, worst at the seam where an aligned window cross-fades against a misaligned one.

It reads as insufficient overlap. No amount of overlap can fix it.

## The fix

`ed4d289` (ComfyUi-MpiNodes) — `_audio_span()` derives the audio token span matching the
video latent window, `_slice_rest()` slices the audio side of the AV latent by its last
(time) dim, and the window's noise is sliced to the same span. Rate is derived from the
tensors rather than hardcoded as 5/3.

Conditioning only. The refined audio is still discarded and the original stream restored,
so the "never stitch audio across seams" intent is untouched.

## Evidence

Two runs, both on a 124-frame clip windowed as `spans=[(0,22),(15,37)]`
(2 windows of 73 video frames, sharing 22):

| path | window 2 mouth | seam |
|---|---|---|
| plain refine | tracks the audio | clean |
| VDN | tracks the audio | clean |

Fabio, on the VDN re-run: *"She finally moves her mouth and says the words in sync."*

Before the fix, window 1 lip-synced and window 2 did not, with the mouth visibly sticking
at the boundary — reproduced on **both** paths, which is what proved it was the windowing
and not the model.

## Not part of this card

The morphing glass is VDN stage-1, not a windowing defect. VDN patches attention for the
whole pass, so its stage 1 diverges from the non-VDN trajectory (she points at her face on
"follow me" under VDN; she places the cup on the couch and never points without it).
Different trajectory, not a defect — dismissed by Fabio as not worth chasing.

The `taeh3` TAESD-preview warning in the run log is expected: the approx-VAE was not placed
in that path yet. Preview only, no effect on output.

## Ship state

`ed4d289` is committed **locally only**. `ComfyUi-MpiNodes` HEAD is 4 commits ahead of
`origin/main`, and two of those (`5319ed9`, `e9e3633`) are MPI-699's work, not cleared for
publication. `git push` sends the branch, not a commit — so the push, and the
`dev_configs/node_lock.json` pin bump that depends on it, both wait on Fabio clearing
MPI-699. The app's current pin `8505769` contains neither `MpiWindowedSampler` nor
`MpiClearVramEnd`, so nothing here is a live user bug.
