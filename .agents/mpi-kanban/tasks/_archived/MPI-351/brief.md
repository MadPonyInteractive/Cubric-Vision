# MPI-351 — Upscale applies the factor twice (wrong source image)

## Symptom

`upscale` on a 768x1344 image with factor **1.5** produced **1728x3024** — a
2.25x enlargement (1.5 squared). Reproduced across four consecutive runs
(`upscale_013/014/015/016`), with Use Grid both on and off.

## Ruled OUT (measured, not assumed)

1. **The factor.** `Input_Upscale_Factor` has exactly ONE writer —
   `PromptBoxControls.upscaleFactor.getInjectionParams()`, which returns the raw
   number. Grepped `js/` and `routes/`: no other writer. All four sidecars record
   `Input_Upscale_Factor: 1.5`.
2. **The graph.** Node `1657` feeds exactly two consumers:
   `MpiGridDimensions.upscale_factor` (tile sizing, which must be in output
   space) and `UltimateSDUpscale.upscale_by`. One real scale.
3. **The API conversion** (the user's first suspicion, given past USDU/detailer
   trouble). The baked card's USDU widget mapping matches the raw
   `widgets_values` tail exactly — `sampler_name`/`scheduler`/`mode_type`/
   `mask_blur`/`tile_padding`/`seam_fix_*`/`force_uniform_tiles`/`tiled_decode`/
   `batch_size` all land on the right names, and `upscale_by` resolves to
   `["1657", 0]`.
4. **The workflow itself.** The user ran the same graph in the ComfyUI browser
   and got the correct output size.
5. **The MPI-350 refiner.** The extra sampler is downstream of USDU and changes
   no dimension.

## What IS wrong: the graph gets the wrong input image

`generationSettings.mediaItems` on all four runs points at
`Media/.preview-assets/1ed8902c8252bcba2baad10f1eacaaa899dcdb56718e0fb62dac11283252ca8f.png`,
which measures **1152x2016** — the 768x1344 source already enlarged 1.5x.

`1152 x 2016 * 1.5 = 1728 x 3024` exactly.

`t2i_039`'s own sidecar reports `pixelDimensions: {w:768,h:1344}` and has **no**
`previewAssets`, so that file is not a full-res twin of the selected item — it
exists only in the content-addressed staging store, which holds assets at many
unrelated sizes (896x1088, 1024x1312, 1080x1920, 1536x2752, ...).

## Leading hypothesis — stale PromptBox media chip (MPI-225 shape)

See the comment above `_opScopedMediaItems` in `js/services/generationService.js`
(~line 142): a media chip left over from a PRIOR operation gets snapshotted into
`generationSettings.mediaItems` and "injects the wrong image on reuse", and the
reference "404s once a card in that lineage is deleted".

`_opScopedMediaItems` only filters chips whose **mediaType** the operation does
not declare. `upscale` DOES declare an image slot, so a stale *image* chip is not
filtered — it passes straight through and becomes `Input_Image`. That explains
every observation at once: the same asset hash on four consecutive runs, a
correct factor, a correct graph, and a wrong image.

## User-reported context at the time (both are candidate triggers)

1. **Entries were deleted mid-session** — several upscale entries were removed to
   make room to keep testing. Deleting a card in a lineage is exactly what the
   MPI-225 comment says orphans a preview-asset reference, so the PromptBox chip
   may have been left pointing at a stale staged asset.
2. **Concurrent generation** — at one point a generation was finishing in the
   ComfyUI browser while another was started in the app.

Note (2) is unlikely to be the whole story on its own: a one-off race would not
explain four consecutive runs recording the SAME asset hash at dispatch time.
(1) fits the repeat much better. Treat (2) as a possible aggravator.

Superseded: an earlier guess that the op deliberately pre-scales its input. No
code was found that does this, and the stale-chip path explains the data without
it. Do not start from the pre-scale theory.

## Where to start

1. Reproduce cleanly: fresh app state, no deletions, select a gallery item,
   upscale at 1.5, and check `generationSettings.mediaItems` in the new sidecar.
   If it points at the item's own file, the bug needs the deletion to trigger.
2. Then delete a history entry in the lineage and repeat — that is the suspected
   trigger.
3. Read the chip lifecycle: what clears the PromptBox media chip on gallery
   selection change, and what happens to it when its backing entry is deleted.
4. Whatever the fix, verify the recorded `mediaItems` in the sidecar, not just
   the output size — the size only tells you it went wrong, the sidecar tells you
   what it was handed.

## Useful measurement commands

Real pixels, not gallery labels (labels come from the sidecar and can disagree):

```js
// PNG IHDR: width @16, height @20
const b = fs.readFileSync(file).subarray(0, 33);
console.log(b.readUInt32BE(16) + 'x' + b.readUInt32BE(20));
```

Sidecars live in `<project>/Media/.meta/<historyItemId>.json`; the item ids are
in `project.json` under `itemGroups[].history[]`.
