# MPI-347 — App: localized edits on high-res (4K/8K) images

## The idea

User has a huge scene — 4K or 8K. They mask a small region and edit only that: place a
character into it, swap an object, fix a detail. Because only the crop is sampled, the
character can occupy a small fraction of the frame and still come back sharp — the whole
image is never downscaled to a model-friendly resolution.

Mechanism already proven by the user on Qwen. Not yet built as an App.

## Why crop-stitch is RIGHT here (and composite is not)

These are two different tools and this card is squarely the first one:

| path | wins when | why |
|---|---|---|
| `InpaintCropImproved` → sample → `InpaintStitchImproved` | **4K/8K source, small edit region** | Samples only the crop at working resolution. The only way to keep definition without sampling the whole frame. |
| `ImageCompositeMasked` | source is already ~1-1.5MP | Needs a FULL-FRAME generation to composite from — unaffordable at 8K. No resample, no zoom, less setup. |

Prior art in-repo: `remove_background.json` node `9` uses `ImageCompositeMasked`;
`app_head_swap.json` nodes `21` -> `6` use the crop/stitch pair.

## The trap this app MUST solve: the tone patch

Krea2 already shipped a masked-edit path and it was REMOVED — `b3f9a018` (2026-07-16),
"masked edits gave inconsistent results". The failure was a visible mask-shaped tone patch
after stitching. The removed config was already feathered:

```
mask_blend_pixels                = 32
context_from_mask_extend_factor  = 1.2
output_target_width/height       = 1024
```

Identical to what `app_head_swap.json` runs today. **So feathering was never the fix** — the
offset is region-wide, and feathering only softens the boundary. Three causes, likely order:

1. **Context starvation.** `context_from_mask_extend_factor: 1.2` = a 20% margin. The model
   white-balances to the crop, not the scene. **First dial to test** - raise it and trade
   effective subject resolution for tone agreement.
2. **Double lanczos resample.** crop -> 1024 -> back.
3. **VAE round-trip on the pasted region only.** The surrounding pixels never went through
   the VAE.

Mitigations to try, cheapest first: raise `context_from_mask_extend_factor`; drop
`device_mode: "cpu (compatible)"` to GPU for speed; colour-match the crop to the destination
before stitching; or round-trip the destination through `VAEEncode` -> `VAEDecode` so both
sides carry identical VAE error.

Krea2 v1.2 weights (shipped since 2026-07-09) list **inpainting** as a trained-in capability,
so the model side of this may already be better than when `b3f9a018` gave up. Re-test before
assuming the old verdict still holds.

## Defect found while scoping this — decide separately

`app_head_swap.json` uses `InpaintCropImproved` / `InpaintStitchImproved`. The app runs on
`qwen-edit` (`appsRegistry.js:171` `requiredModels: ['qwen-edit']`). But:

- `appsRegistry.js:171` declares `requiredDeps: ['qwen-lora-headswap']` — the LoRA only.
- The `qwen-edit` card's `dependencies` (`models.js:790-804`) has no inpaint pack.
- The ONLY declarers of `comfyui-inpaint-cropandstitch` are the two **Krea2** cards
  (`models.js:339`, `:413`) — and no krea2 graph has referenced those classes since
  `b3f9a018`.

⇒ Head Swap appears to work only because an installed Krea2 card drags the pack onto the
volume. A qwen-edit-only install should fail ComfyUI class validation at dispatch.

**Static analysis only — NOT reproduced live.** Node install is per-resolved-dep
(`_runCustomNodeInstall` per-dep loop, MPI-222), which is what makes this look real, but the
confirming test is a clean qwen-edit-only install running Head Swap. Fix, if confirmed, is one
line: add `comfyui-inpaint-cropandstitch` to the app's `requiredDeps`. Related: MPI-325.

## Open questions

- Does the App own the mask paint UI, or reuse the History-workspace mask path (MPI-272
  path->string pipe)?
- Which model backs it — Qwen (user's proof) or Krea2 v1.2?
- Max source resolution to accept, and where the crop working size is chosen from.
