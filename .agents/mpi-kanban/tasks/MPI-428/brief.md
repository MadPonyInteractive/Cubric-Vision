# MPI-428 — Boogu Image Edit: localised (masked) edit

## Where this came from

MPI-365 migrated Krea 2, Klein and Qwen onto the one-master-template shape and gave all
three a **localised edit** — a mask crops the edit region, the model works at its native
size inside that crop, and the result is stitched back so the picture keeps its original
resolution. Boogu never needed migrating (already one file), so MPI-365's validation log
records it as out of scope and names this as a separate card.

The user re-authored `boogu_edit_template.json` in the standalone bench (`G:\ComfyUi`) and
exported it to `comfy_workflows/raw/`. This card syncs that export through to the runtime
files and covers whatever the new graph implies app-side.

## What actually changed in the graph

Diffed the export against `HEAD` (60 → 70 nodes). The mask half is a **copy of the shape
Krea 2 / Klein / Qwen already ship**, which is why the app side is nearly free:

| Node | Type | Pack |
|---|---|---|
| `Input_Mask` | `MpiString` | MpiNodes |
| `mask` | `MpiLoadImageFromPath` (`channel: red`, `block_if_empty: true`) | MpiNodes |
| — | `MpiAnyChecker` → `Set_has_mask` | MpiNodes |
| — | `MpiMaskSquareBbox` (padding 64) | MpiNodes |
| — | `InpaintCropImproved` / `InpaintStitchImproved` | **`comfyui-inpaint-cropandstitch`** ← NEW dep |
| — | 2× `MpiIfElse` gated on `Get_has_mask` | MpiNodes |
| — | `ImageScaleToTotalPixels`, `GetImageSize` | comfy-core |

Removed: the bench-only A/B widgets (`Image Comparer (rgthree)`, per-tier `PreviewImage`
taps — the generator's `_prune_to_capture` dropped those anyway), `MpiCrop`,
`ResizeImageMaskNode`, and the old `LoadImage`-class `Input_Image` (node 190's
`MpiLoadImageFromPath` is the live one). `Set_In_IMG_1` renamed `Set_img1`.

**`comfyui-inpaint-cropandstitch` is the ONLY new pack.** Everything else is MpiNodes,
KJNodes (`SetNode`/`GetNode`, already a dep) or comfy-core.

**`block_if_empty: true` on the mask loader is correct here** and matches Klein's
2026-08-02 fix, not Krea2/Qwen's `false`: Klein needed it because it has no `MpiBlocker`
gating the IMAGE upstream of its crop, so a blank-but-unblocked mask reached six
consumers. Boogu likewise has no such gate — the `MpiIfElse` pair is the only branch — so
blocking is what short-circuits the crop path on an unmasked run.

## App-side surface (small on purpose — verify, don't rebuild)

Mask delivery is already generic:

- `MpiGroupHistoryBlock` attaches `maskDataUrl` on every run whenever the canvas has a
  mask — no per-model or per-op flag.
- `commandExecutor` sets `params['Input_Mask']` unconditionally from it.
- `comfyController` routes it by **title**: a node titled `Input_Mask` whose class is in
  `PATH_MEDIA_CLASSES` (`MpiString` is) gets the `imagepath` kind, so the data URL is
  staged to a real file and the path is injected.
- The shared `edit` op is deliberately NOT `requiresMask`, so an empty mask self-gates to
  the whole-image edit.

So the expected app change is **one line per Boogu card**: add
`comfyui-inpaint-cropandstitch` to `dependencies` in `js/data/modelConstants/models.js`.

## Traps to respect

1. **The mask must be exported at the SOURCE image's pixels.** `InpaintCropImproved`
   asserts `mask dims == image dims`; mask layers work at `MASK_MAX_EDGE = 1536`. MPI-365
   fix 2 already made `MaskManager.getURL()` scale to source, so Boogu inherits it — but
   any masked-edit verification must use a source **over 1536px** or it proves nothing.
2. **Close the bench before verifying.** `G:\ComfyUi` holds port 8188; leave it up and the
   app's engine fails to start and every dispatch silently runs on the bench.
   (`tool_verify_through_the_app`.) It IS needed up for the sync — `/object_info` supplies
   widget names — so: sync first, then close it, then verify.
3. **`_prune_to_capture` keeps only nodes upstream of `Output_Image`.** The export added an
   untitled `SaveImage` and an `MpiClearVram`; confirm after baking that the stitch path
   survived and that nothing load-bearing was pruned.
4. `Input_Tier` must still bake 1 (high) / 2 (balanced) — `generate_boogu.py` asserts the
   node exists, and the export can come back with whatever the user was last testing.
