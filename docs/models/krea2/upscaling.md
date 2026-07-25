# Krea2 — upscaling (MPI-350)

The `upscale` op's graph: `krea2_upscaler_template.json` → `krea2_upscaler_sfw.json`
/ `krea2_upscaler_nsfw.json`. 37 nodes. Read this before re-tuning the upscaler or
adding another pass to it.

## Shape

```
Input_Image → ResizeImageMaskNode (÷16) → UltimateSDUpscale (1686)
                                        → VAEEncode (1708)
                                        → ClownsharKSampler_Beta (1705)   ← refiner
                                        → VAEDecode (1709) → Output_image (1556)
```

`1707 FromBasicPipe` supplies vae / positive / negative to the refiner. The refiner
shares `Input_Seed` with the main pass; its steps / cfg / denoise are **baked
widgets, not injected** — the app's sliders do not reach it.

## Why the refiner exists — it is a FIX, not a flourish

Before it, a single UltimateSDUpscale pass at cfg 2 produced heavy noise: unusable
at full quality, mediocre on turbo. Two things were wrong at once, and both had to
change:

1. **The accelerator LoRA was applied in BOTH tiers**, so "full quality" never
   actually ran at full quality.
2. **Nothing cleaned up after the tiled pass.** A short low-denoise pass over the
   whole frame puts the texture back — the same shape as the t2i graph's 3-step
   refiner (see [samplers.md](samplers.md)).

## The tier gate

`1697 Input_Tier` → `1700 MpiMath ("a == 1")` → `1711 MpiIfElse ("is high tier")`,
whose output feeds `1686 UltimateSDUpscale.model`:

| tier | turbo | branch | model on the tiles |
|---|---|---|---|
| 1 | OFF | true → `1685 FromBasicPipe` | base, **no accelerator LoRA** |
| 2 | ON | false → `1706 MpiLoraModel` | accelerator LoRA |

`1706` chains off `1680 Input_Lora_6`, so user LoRA slots stay upstream of it.

**The refiner takes its model from `1706` in BOTH tiers — deliberate.** High tier
gets a full-quality tiled pass followed by a cheap 2-step distilled polish, not a
full-quality refine. Do not "fix" this by routing the refiner through `1711`.

## Traps

- **Prompt applies PER TILE.** With `Use Grid` on, every tile is sampled with the
  full positive prompt at the current denoise, so a scene prompt ("two women on a
  ship") renders the whole scene *in each tile*. Grid upscaling wants an empty or
  generic prompt. Live-confirmed on a 4×2 grid.
- **Tile count is a runtime value.** `1639 MpiGridDimensions` derives tile size from
  the image × `Grid_H`/`Grid_V` × `Input_Upscale_Factor`, so the count scales with
  input size, factor and the Use Grid toggle. Never record a static stage total for
  this graph — see [../../generation-lifecycle.md](../../generation-lifecycle.md)
  for `postTile` and the T+1 tile-tick trap.
- **`Grid_H` / `Grid_V` (1604/1605) are NOT injectable** — no `Input_` prefix, fixed
  at 1. Only `Input_Auto_Grid` varies the split.
- **Injection surface is 16** (`Input_*` / `Output_*`) and did not change when the
  refiner landed. The node ids that moved (`1701` → `1706`) are referenced nowhere
  in `js/` — injection is title-keyed.

## Verified

Live, both tiers, 2026-07-25: 768×1344 at factor 1.5 → 1152×2016 with `Use Grid` on
(2 tiles). Turbo and non-turbo both accepted by the user in a side-by-side compare.
The tier-1 branch had never been exercised before this — every earlier upscale
sidecar recorded `Input_Tier: 2`.
