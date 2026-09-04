# MPI-688 — Video Upscale: add H3 alongside LTX

## Why now

H3 gained a latent upscaler on 2026-09-04: `Comfyui_Minimax_h3_latent_Upscaler`
(`MinimaxH3LatentUpscaler3D`), installed on the bench at
`G:\ComfyUi\ComfyUI\custom_nodes\Comfyui_Minimax_h3_latent_Upscaler` @ `d7c01b9`.
Weights live in `latent_upscale_models` (`minimax_h3_latent_upscaler_3d_bf16.safetensors`).

Measured on the bench, 3-second clip, 608x352 -> 2x -> 1216x704: the upscale pass
produced better output than a native 1344x768 generation, and faster. Turbo applied to
the refine leg specifically gave **+20-30% detail** and **1-2.5 points less shadow crush**
over the same 3-sigma refine without it.

## The shape is already in the repo

`comfy_workflows/ltx_video_upscale.json` (29 nodes) is **latent space**, not pixel:

```
LatentUpscaleModelLoader -> LTXVLatentUpsampler -> SamplerCustomAdvanced + ManualSigmas
```

The H3 path is the same shape with `MinimaxH3LatentUpscaler3D` in the upsampler slot,
`LTXVConcatAVLatent` / `LTXVSeparateAVLatent` already appear in BOTH the LTX upscale graph
and the H3 workflows, and the refine is a partial-denoise pass from ~0.90 sigma either way.

## Scope

1. `Upscale Video` flow (`ltx-upscale` in `js/data/flowsRegistry.js:672`, MPI-584) accepts an
   H3 clip as well as an LTX one. The capability ships twice — as this Flow and as the
   History video Upscale dropdown plugin entry — and both read the same `upscale.fields`,
   so keep them in step.
2. Sweep the flows/workflows that use H3. Their graphs become **generation pass + upscale
   pass** and **drop `Input_Single_Pass`**, matching the LTX two-pass shape.

## Known traps (measured, not assumed)

- **i2v/fl2va conditioning does NOT survive an upscale.** `MiniMaxH3ImageToVideo` VAE-encodes
  its keyframe at the FIRST stage's width/height, while `PackedLayout`
  (`comfy/ldm/minimax/model.py:341`) sizes the keyframe cond rows off the TARGET grid —
  "sharing the target spatial grid". A 2x upscale raises
  `value tensor of shape [209, 96] cannot be broadcast to indexing result of shape [836, 96]`
  inside `SamplerCustomAdvanced` (4x the tokens, anchor still at 1x).
  Fix: a SECOND conditioning built at the upscaled dimensions. `MpiH3ImageToVideo` (MPI-687)
  exists so that costs one node instead of a boolean lattice.
- **ref2v is NOT affected.** Refs carry their own grid (`_frame_grid(blk["latent_h"],
  blk["latent_w"])`, model.py:369) and pack between text and targets, so they are
  independent of the target resolution. Only keyframes share the target grid.
- **The upscaler works from the LATENT**, `w_lat = w_px // 16`, then aligns to 32 px in
  pixel space with `round()` (half-to-even). At scale 2.0, `floor(a / 16) * 32` reproduces
  it exactly (verified 32..4096, 0 mismatches). At other scales no simple expression does —
  use the node's `target dimensions` mode and feed the same number to both sides instead.
- **The resolution table needs a decision.** Only 3 of 14 rows halve onto the 32 grid, so
  exact 2x from a table row is usually impossible. Working proposal, not yet agreed:
  `stage1_MP = max(floor, target_MP / 4)` with the upscaler in `target dimensions` mode —
  leaves the table unchanged, keeps scale <= 2.0, worst aspect error 4.55%. The floor
  (0.2 MP in the test runs) is a quality judgement the user owns.
