# MPI-628 - Character Sheet, head removal without the Klein edit pass

Fabio, at the bench, 2026-08-27: the flow was loading a whole second checkpoint to paint
studio grey. It ran a Klein 4B edit pass (LanPaint KSampler + a MaskDetailer refine) over a
SAM3 head mask, with its own CLIP and VAE beside it - a full model swap mid-run for a result
that is, in the end, backdrop-coloured pixels.

## What replaced it

The head mask already existed. So instead of regenerating those pixels, the graph now
subtracts them:

```
860 RemoveBackground (birefnet)  ->  subject matte
854 GrowMask expand 6            <-  757 SAM3 head mask, pasted full-size
858 MaskComposite "subtract"     ->  subject - head
742 MpiIfElse                    ->  true 858 (headless) / false 860 (intact)
859 InvertMask -> 851 ImageCompositeMasked
       destination 730 (sheet), source 852 EmptyImage(#808080), resize_source true
```

The backdrop is replaced across the whole sheet, so the removed head IS the backdrop by
construction - no fill, no colour sampling, no seam, no heal pass.

`#808080` (`color: 8421504`) was measured off the flow's own shipped tile
(`comfy_workflows/display/flow-character-sheet.webp`), whose dominant neutral bucket is 128
across 81,924 px. An earlier guess of `#DCDCDC` was far too light.

## What this deletes

Klein 4B UNET (3.79GB) + `qwen_3_4b` CLIP + `flux2-vae`, `LanPaint_KSampler`,
`MaskDetailerPipe`, both `InpaintCrop`/`InpaintStitch` pairs, and the Phase-2 LoRA rack.
94 API nodes -> 66.

## Dependencies after

Both survivors are `engineAsset: true` - they install with the engine, so neither is a flow
requirement:

| loader | weight | status |
|---|---|---|
| `Input_Base_Model` + CLIP + VAE | Krea 2 stack | the flow's one `requiredModels` slot |
| `SAM3 Model` | `sam3.1_multiplex_fp16` 1.63GB | engineAsset |
| `Load Background Removal Model` | `birefnet` | engineAsset |

So `requiredModels` collapses to the Krea 2 any-of slot plus its LoRA rack. The phase-2
`Blend model` slot and all four `modelParams` Klein/Edit entries become dangling and must go.

## Pre-sync verification (2026-08-27, before any repo write)

- bench 8188 and app engine 48188 both ComfyUI 0.31.0 / frontend 1.48.7 - no schema drift
- all 13 node classes present on both ports with identical signatures
- dry conversion against 48188: exit 0, no stderr, 66 nodes
- `verify-workflow.mjs` exit 0; `validate-injection-rules.mjs` exit 0
- `control_after_generate` phantom sweep clean (`ClownsharKSampler_Beta` is the flag-less biter)
- bypassed `MaskPreview` 856 dissolved correctly - `859 InvertMask.mask <- ["742",0]`
- only two output nodes survive: `Output_Image` (494), `Output_prompt` (673)

Fabio ran the graph on the bench before exporting.

## Not part of this card

`klein-lora-outpaint` in `loraDeps.js` is MPI-603's bookkeeping - no graph has loaded it
since 2026-08-23 and the entry must stay until a build without it ships.
