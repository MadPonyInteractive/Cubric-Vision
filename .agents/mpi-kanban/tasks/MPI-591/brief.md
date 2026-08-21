# MPI-591 - Extend Video on MiniMax H3

Blocked on an engine bump. Read `task.json` for the blocker and the scope; this
file holds the H3 seam physics, because every rule here fails SILENTLY - a wrong
context length does not raise, it produces a clip that looks like a bad model.

Source: `ethanfel/ComfyUI-MiniMaxH3-Contex-Loop` (GPL-3.0), read 2026-08-20.
Same author as our `h3-qwen3vl-32b-clip` dep. **Do not vendor it.** It is a whole
scene-production loop - planner UI, checkpoint manager, review gate, run manager -
and Vision's gallery, history and reuse already are that loop. The transferable
part is ~300 lines of seam math, and it is recorded below so nothing needs
copying: `ComfyUi-MpiNodes` has no LICENSE file, so pulling GPL source into it
would settle that question by accident.

## The grid

```
FRAME_PER_TOKEN = (1, 4, 4, 4, 4)    # video VAE temporal packing, period 5
FPS = 24 ; AUDIO_HZ = 40 ; FRAME_RESCALE = 5/3
valid clip lengths = 17k + 5  ->  5, 22, 39, 56, 73, 90, 107, 124, 141, ...
video latent [B,24,T,H/16,W/16]   audio latent [B,32,2,T40]
both streams live in one comfy.nested_tensor.NestedTensor pair
canvas multiple 32, spatial compression 16x
```

`MpiH3Length` in `ComfyUi-MpiNodes/h3.py` already snaps to `n % 17 == 5`, so the
frame-count half of this is owned. The context-window half is not.

## Three silent traps

1. **An off-grid context slice comes from the WRONG END.** Encoding 10 reference
   frames yields the same 2 latent steps as encoding 5, but those steps then cover
   frames `[-10..-6]` of the source instead of `[-5..-1]`. The seam lands five
   frames early and the continuation carries on from an instant that never was.
   Snap the requested context DOWN onto the grid BEFORE slicing the tail.
2. **Only 39 / 90 / 141 line both clocks up.** Audio runs at 40 Hz against video's
   24 fps, so a context length must be divisible by 3 to land on a whole audio
   latent step AND sit on the 17k+5 grid. Anything else leaves a fractional
   overhang that has to be added back to the guide's frame index or the audio seam
   drifts against the picture. 39 frames = 1.625 s = exactly 65 audio steps.
3. **Guides inside the preserved head must be dropped.** A stock first-frame guide
   sitting in the repeated span fights the prefix that already owns those frames.

Batch size 1 only, on both streams.

## Two ways to continue, pick one

| | Mechanism | Cost | Needs |
|---|---|---|---|
| guide | previous tail encoded and attached as `minimax_keyframes` conditioning at frames 0..N-1; the model REGENERATES that head and you trim N frames off the front | pays for N regenerated frames on every extend | PR 15439 only |
| masked prefix | write the encoded previous tail straight into the target latent's prefix, then protect it with a nested AV noise mask, `0 = preserve`, `1 = generate`, on video and audio alike | none, seamless, nothing to trim | PR 15439 + PR 15375 |

**Take the masked prefix.** It is the same shape `flow_ltx_extend.json` already
ships - `LTXVAudioVideoMask` (pad) then `LTXVConcatAVLatent`, sample, separate,
decode, `ImageBatchExtendWithOverlap` crossfade, join audio - so the graph is a
port with different constants, not a new design. Guide mode buys nothing here and
burns compute per extend.

Two details worth carrying over:

- Encode the whole context run in ONE VAE call, not frame by frame. The temporal
  packing means 22 pixel frames become 7 latent steps and the motion lives inside
  the latent instead of being implied across independent stills.
- Take the audio prefix from the PREVIOUS SAMPLED LATENT, not by re-encoding
  decoded audio. It skips a VAE round trip and the drift that comes with it.

Core does not ship a node that composes the masked prefix - PR 15375 supplies the
mask support, not the composition. That is roughly 80 lines in `ComfyUi-MpiNodes`
(encode tail, snap to grid, write the prefix, build the two-stream mask, drop the
conflicting guides), written from the rules above rather than ported.

## First checks when this unblocks

1. Re-read the core tags - both PRs may be released by then, which changes nothing
   except that the bump gets easier to justify.
2. Confirm `MiniMaxH3AddGuide` and the per-stream masks are live on the bumped
   engine by reading `/object_info`, not by reading the changelog.
3. Decide the per-member workflow-file contract before authoring the graph.
