# LTX Tiled VAE Decode — research (REVISIT LATER)

> **Decision 2026-06-21:** keep `LTXVSpatioTemporalTiledVAEDecode` node in template
> but **DISCONNECTED**. Use plain `VAEDecode` for output. Revisit ONLY if last-frame
> artifacts appear or long videos OOM on low VRAM.
>
> **User confirmed:** 8s video works fine on 16GB VRAM with plain VAE decode. Tiled
> decode cost ~27% (4s: 75s plain vs 95s tiled). Not needed at current lengths.

## What the node does (source-verified, repo `Lightricks/ComfyUI-LTXVideo` commit e1d2cff3)
Splits decode into temporal chunks × spatial grid, runs `vae.decode()` per tile,
blends seams with linear ramps. Same output as plain decode, fraction of peak VRAM,
but N×M×T separate decode calls = slower.

## Why slower
Our config `spatial_tiles=4` (=4×4=16 tiles) + `temporal_tile_length=64` on a 4s clip
= ~2 temporal passes × 16 spatial = ~32 decode calls vs 1. Overlap zones re-decoded,
not cached.

## KEY: Lightricks already swapped it out
PR #471 (merged 2026-04-26) replaced tiled decode → plain `VAEDecode` in their own
example workflow. Reasons:
1. Tiled decode caused **flickering / ghosting / strobing** (issue #470) — temporal seam artifact.
2. Contributor note: "normal VAE Decode should work in most cases on ~24GB GPUs at least."
3. Old workflow note: "in case of OOM use tile_size 768 / temporal 16" — tiling = OOM fallback, not default.

## VRAM threshold
NOT FOUND as a hard number in source. GPU-dependent. User: 8s OK on 16GB plain.

## Widget reference (source-verified)
| Widget | Ours | Official | Does |
|---|---|---|---|
| spatial_tiles | 4 | 4 | NxN grid (4=16 tiles); 1 = whole frame |
| spatial_overlap | 8 | 4 | seam blend zone (latent); bigger = more recompute |
| temporal_tile_length | 64 | 16 | chunk length (latent frames); big = bigger VRAM spike, fewer passes |
| temporal_overlap | 8 | 4 | temporal seam blend |
| last_frame_fix | true | false | dupes last latent frame pre-decode, strips after; fixes last-frame blur/degrade (causal conv sees zero-pad at edge) |
| working_device | auto | auto | output/accum buffer device; cpu = offload |
| working_dtype | auto | auto | accum precision |

## Neutralize in-place (if revisited)
`spatial_tiles=1` + large `temporal_tile_length` → single pass, no seams. Still
allocates separate accum buffer → slightly heavier than plain VAEDecode. Not fully equal.

## last_frame_fix CATCH
Rides on tiled node. Plain VAEDecode loses it. If last frame degrades → either
re-enable tiled (low tile counts) or find separate fix. **Watch the last frame.**

## REVISIT TRIGGERS (note for later)
- Last-frame artifacts on plain decode → reduce tiling (spatial_tiles=1/2), re-enable.
- Low VRAM OOM on long videos → CAP video length (e.g. ~10s) and use VIDEO EXTEND
  for anything longer, instead of tiling. (User's idea — extend > tile for length.)

## Sources
- repo `Lightricks/ComfyUI-LTXVideo` `tiled_vae_decode.py` @ e1d2cff3 (ground truth)
- PR #471, issue #470
- example_workflows/2.0/LTX-2_I2V_Distilled_wLora.json (official widget defaults)
