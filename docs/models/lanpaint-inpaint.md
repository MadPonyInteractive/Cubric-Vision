# The LanPaint inpaint branch — Klein, SDXL x5, Krea 2 x2

> The shared `inpaint` op. One op key, one shape of graph branch, three model families.
> Per-family wiring lives in each model's own folder; what they have in COMMON is here.
> Op copy + help text → `inpaint` in `js/data/commandRegistry.js`.

FLUX.2 Klein shipped it first (MPI-598). The **SDXL family and both Krea 2 cards gained it
in MPI-615**, when Fabio re-exported `sdxl_t2i_template.json` and `krea2_t2i_template.json`
with a LanPaint branch on the previously-dead `Input_wf_type` slot **5**.

## Every master graph numbers it 5

| model | `Input_wf_type: 5` | file |
|---|---|---|
| `klein-4b` / `klein-9b` | `inpaint` | `klein_t2i.json` / `klein_9b_t2i.json` |
| `sdxl-realistic`, `sdxl-nsfw`, `ill-anime-beauty`, `ill-anime`, `pony-mix` | `inpaint` | `t2i_<variant>.json` |
| `krea2`, `krea2-nsfw` | `inpaint` | `krea2_t2i_<sfw\|nsfw>.json` |
| `chroma-flash`, `chroma-hyper` | **still dead** | — |

Chroma is the only master-template family without it; its graph has no LanPaint branch, so
do NOT add `inpaint: { Input_wf_type: 5 }` there. A gap the other way is worse than an
error: `commandExecutor` runs the graph's baked default (1 = t2i) and returns a plausible
image from the wrong op.

## What the branch does — it is NOT the edit op

The distinction is the whole point of having both on Krea 2:

- **`krea2Edit` (4)** takes an *optional* mask, crops to it, and **re-renders that crop**
  from an instruction, guided by the reference. It moves everything inside the crop.
- **`inpaint` (5)** holds every pixel outside the mask **still**, and regenerates only what
  is under it. LanPaint is mask-conditioned sampling: it sees the surrounding picture the
  whole way through, so the fill lands in the lighting and perspective already there.

That is why an empty prompt does nothing on this op (`promptRequired: true`), and why a
removal has to NAME its target — the model can see what is there, so "remove" alone is not
an instruction. The user-facing version of that is the op's `help` block.

## The node chain

Same three beats in all three families:

```
Input_Image ──┐
              ├─> InpaintCropImproved  (optional_context_mask <- MpiMaskSquareBbox(mask, 64))
Input_Mask  ──┘        │  cropped_image + cropped_mask
                       v
              LanPaint_ImageEncode -> LanPaint_KSampler -> LanPaint_ImageDecode
                       │                                            │
                       └────────────> InpaintStitchImproved <───────┘
                                              │
                                              v  full-size image, mask-region only changed
```

`MpiMaskSquareBbox` squares the mask's bounding box (padding 64) and hands it in as the
context mask, so the crop LanPaint sees is a square region around the edit rather than the
mask's own ragged shape. `InpaintStitchImproved` puts the crop back at input resolution —
which is why **the output is always the size of the input image**, never `Input_Width`/
`Input_Height`.

### Where the families diverge

| | SDXL x5 | Krea 2 x2 | Klein |
|---|---|---|---|
| sampler | `LanPaint_KSampler` (euler_ancestral, cfg 7, 5 LanPaint steps) then a **hi-res fix**: `MpiLatentUpscale` → a second `KSampler` at denoise 0.4 | `LanPaint_KSampler` (euler), no second pass | see `models/klein/removal.md` |
| steps / cfg | baked | **read from `Get_turbo`** — 8 steps / cfg 1.0 turbo, 15 / 2.0 quality | baked |
| accelerator LoRA | n/a | the shared `Accelerator Lora` runs at **0.7 on this branch** (`MpiMath "is inpaint"`), 1.0 everywhere else | n/a |
| style rack | none (no `capabilities.styleLoras`) | live — `styleOps` includes `inpaint` | live |

## Controls: what the op does and does NOT mount

`components: ['styleSelect', 'stylization', 'krea2Turbo']`, and all three are per-model
gated. Deliberately absent, each for a graph reason:

- **no `ratio`** — the output is input-sized (see above). This is also why `inpaint` is not
  in anyone's `imageSizedOps`: that list only ever gates the `ratio` control, and the op
  never mounts it.
- **no `batch`** — `Input_Batch_Size` reaches `EmptyLatentImage` alone in every graph we
  ship, and this branch samples a VAE-encoded crop.
- **no `denoise`** — SDXL bakes its hi-res pass at 0.4, Krea 2 has none to expose.
- **`krea2Turbo` is real here.** It is gated on `capabilities.turboToggle`, so only Krea 2
  renders it — and there it moves steps, cfg and the accelerator LoRA, not just speed.

The mask itself is not a `mediaInputs` slot: `requiresMask: true` on the op, and
`commandExecutor` sets `params.Input_Mask` from `payload.maskDataUrl`. Every graph that
runs this op therefore needs an `Input_Mask` node — all three families already had one.

## Dependencies

`comfyui-inpaint-cropandstitch` (InpaintCropImproved / StitchImproved) and `LanPaint`
(`LanPaint_KSampler`). Both are `type: 'custom_nodes'`, so `getUniversalWorkflowDepIds()`
puts them in the universal set and the boot gate installs them **regardless of which model
is installed** — declaring them on a ModelDef does not change what downloads. They are
declared anyway so the graph's needs are readable from the ModelDef and the uninstall
sweep never strands them. `MpiMaskSquareBbox` and `MpiLatentUpscale` ship in
`ComfyUI-MpiNodes`, which every model already declares.
