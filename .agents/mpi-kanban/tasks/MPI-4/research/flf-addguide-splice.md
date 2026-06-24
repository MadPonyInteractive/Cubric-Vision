# FLF (first-frame / last-frame) — LTXVAddGuide rewire

**Date:** 2026-06-24. **Workflow:** `G:\ComfyUi\ComfyUI\user\default\workflows\LTX_i2v_t2v_template.json`
(finished copy mirrored to `D:\WORK\workflows\App\LTX_i2v_t2v_template.json`).
**Backup:** `D:\WORK\workflows\App\backups\LTX_i2v_t2v_template.pre-flf-addguide.bak.json`.

## Why
FF/LF was done with the WRONG node: `LTXVImgToVideoInplaceKJ` ("FL ImgToVideoKJ") — a **multi-image
sequence** node (index = which frame each image lands on; model continues PAST image 2). That mis-modeled
first→last frame and caused the **tail "wave" distortion**. The correct primitive is the official
`ComfyUi_video_ltx2_3_flf2v.json` pattern: **two chained `LTXVAddGuide` nodes** (first @ frame_idx 0,
last @ frame_idx -1), guiding BOTH conditioning and latent, gated by `Input_Use_End_Image`.

## What was removed (the wrong chain)
- `178` FL ImgToVideoKJ (S1), `179` FL ImgToVideoKJ (S2) — wrong multi-image node
- `177` MpiMath "index_2 = Frames-1" — dead (frame_idx is literal -1 now)
- `184` MpiReroute "IMG2 compressed 18" — only fed 179
- **KEPT** `319` (disconnected FL ImgToVideoKJ copy) — reserved for future multi-image input (deferred)

## What was added (agent: 4 AddGuide in "New Nodes" group)
| id | title | frame_idx | strength |
|---|---|---|---|
| 321 | FLF AddGuide First (S1) | 0 | 0.7 |
| 322 | FLF AddGuide Last (S1) | -1 | 0.7 |
| 323 | FLF AddGuide First (S2) | 0 | 0.7 |
| 324 | FLF AddGuide Last (S2) | -1 | 0.7 |

Each pair chained first→last (pos/neg/latent). Image feeders: 147 (first), 176 (last End), both
img_compression=18. vae: 149 (S1) / 137 (S2). Counters synced (no drift).

## Conditioning tail (user-wired in UI — the working logic)
Both **latent** and **guider** are gated on `Input_Use_End_Image` (FLF on/off):

```
S1: 325 Original Cond → 321 → 322 →┬ pos/neg → 330 FLF-CFGGuider(model←191 Transition) → 328 IfElse[FLF] → 70 sampler.guider
                                   └ latent → 316 IfElse[Use_End_Image].true → stage-1 latent path
S2: 101 From Stage 1  → 323 → 324 →┬ pos/neg → 326 FLF-CFGGuider(model←258 Model)     → 327 IfElse[FLF] → 39 sampler.guider
                                   └ latent → 318 IfElse[FLF].true → stage-2 latent path
```
Post-sample guide cleanup rides the EXISTING `46 LTXVCropGuides` (latent 68→46→101); the new guiders
feed the sampler directly, gated. Plain i2v (`Use_End_Image` off) = false branches = original nodes 146/168.

## Gaps — CLOSED
- ✅ `323` (S2 first) `latent` ← `123 LTXVLatentUpsampler`. **Was the critical fix** — earlier wired to
  `143 EmptyLTXVLatentVideo` (empty) which gave "very bad results"; S2 must guide the UPSCALED stage-1
  latent so stage-2 builds on stage-1's motion. Parallel to plain-i2v S2 (168 also takes 123).
- img_compression stays **18** (intentional — less compression = more detail at lower res, user's call,
  not official's 25).

## FINAL STATE — FLF WAVE RESOLVED ✅ (tested 2026-06-24)
- Stage-1 + stage-2 both FLF-guided; wave gone end-to-end. Side-by-side A/B (cond propagation on/off)
  showed negligible visual delta → **S1-FLF-cond → S2 left CONNECTED for correctness** (325 Original Cond
  feeds S1; S2 cond ties back to stage-1 path).
- New crop nodes added by user: `334 "LTXVCropGuides FLF"`, `335` (guide-token cleanup on FLF cond).
- New FLF guiders: `330` (S1, model←191 Transition Lora), `326` (S2, model←258 Model), each gated to the
  stage sampler via FLF IfElse (`328` S1 → sampler 70; `327` S2 → sampler 39).
- **Gates verified additive — pre-existing chains UNTOUCHED:** plain-i2v (146/168) + t2v (317) route through
  ORIGINAL nodes on the false/off branches. FLF only ADDED consumers to shared feeders, stole nothing.
- **Sanity tests PASS:** i2v-only (Use_End_Image off), t2v (Text_to_video on), FLF (both on) all correct.
- **Ship state:** FLF nodes active (mode 0); test/preview nodes bypassed (VHS combine 241/347, PreviewAny
  261/332, tiled-decode 122, keeper KJ 319); counters synced 347/610; FLF last-frame image path LIVE
  (176←95 IMG2←87 ImageResizeKJv2). Ready for API export.
- Finished copy: `D:\WORK\workflows\App\LTX_i2v_t2v_template.json` (139959 bytes, matches G).
- **Memory correction:** `[[project-ltx23-workflow-paths]]` says output→`LTX23.json`; actual live convention
  is edit G `LTX_i2v_t2v_template.json` IN PLACE, copy to D under SAME name (D = finished/editable backup,
  NOT a rename). See updated workflow-paths memory.

## Stage rationale
FLF guides BOTH stages on purpose: if stage-2 runs free it has no last-frame anchor and hallucinates the
tail (the wave). Stage-2 must re-lock onto the end frame. See `[[project-ltx-stage1-motion-stage2-detail]]`.
