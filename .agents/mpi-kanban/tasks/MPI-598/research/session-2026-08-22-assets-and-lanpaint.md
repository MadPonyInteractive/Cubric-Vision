# MPI-598 addendum — 9B assets on disk, the `Input_is_9b` gate, and the inpaint change

Bench session 2026-08-22, after MPI-600 decided the weight. Everything here is verified on
disk or traced in the saved bench graph. Read alongside `../brief.md` — this does not
replace it, it adds what MPI-600 could not know.

## 1. Both 9B LoRAs are downloaded and verified

`G:\CubricModels\loras\flux2-klein\`

| file | bytes | sha256 | proof it is really 9B |
|---|---|---|---|
| `flux2_klein_9b_refcontrol_depth.safetensors` | 165,704,480 | `d627631d39a6a7c7b2951b029a1a0c72b40809b27d4049b708129e1832c9bb8d` | 224 tensors vs 4B's 160; `lora_A [32,4096]` vs `[32,3072]`; meta `ss_base_model_version: flux2_klein_9b` |
| `NSFW_party_time_v2.0_klein9b.safetensors` | 318,784,864 | `cc369cda4370cde8244e5934ac7323b9d39f0797d729c1931c8c0621692ce91c` | 112 tensors vs 4B's 80; `lora_A [128,4096]` vs `[128,3072]` |

Both use the same key prefix as their 4B twins (`diffusion_model.*` for depth,
`transformer.*` for NSFW), so **no comfy-conversion step is needed** — this is not the
outpaint-LoRA situation.

**Sources.** Depth: `thedeoxen/refcontrol-FLUX.2-klein-9B-reference-depth-lora` on HF,
**Apache-2.0**, same creator as our 4B (CivitAI 2657241, already cleared in
`docs/models/klein/licences.md`). NSFW: CivitAI model **2458332**, version **3028788**
(`https://civitai.com/models/2458332?modelVersionId=3028788`) — creator `whoforscuba`,
licence badge **none**, cleared on creator flags only, identical posture to the 4B we
already ship. Fabio pulled it over the VPN 2026-08-22.

> **HF hash trap.** The ETag on a `resolve/` URL is a **CDN etag, not the LFS sha256**. Use
> `POST /api/models/{repo}/paths-info/main` and read `lfs.oid`. Trusting the ETag makes a
> perfectly good download look corrupt.

**Still missing: there is no 9B outpaint LoRA.** `flux2-klein-4b-outpaint` has no identified
9B equivalent. Decide what outpaint does on the 9B arm before wiring it.

## 2. The `Input_is_9b` gate Fabio added to the bench template

`G:\ComfyUi\ComfyUI\user\default\workflows\klein_t2i_template.json`

```
#660 MpiSimpleBoolean ["Input_is_9b"]
  -> #661 MpiIfElse ["is 9b"].boolean
  -> #662 MpiIfElse ["is 9b"].boolean

#661  true  <- #8  MpiIfElse ["Input_enhance_prompt"]     (9B: raw prompt)
      false <- #88 StringConcatenate                       (4B: styles prompt concat)
      out   -> #108 SetNode ["Set_positive text"]

#662  true  <- #27  UNETLoader                             (9B: model straight through)
      false <- #101 MpiStyleLoras [slot 1]                 (4B: style LoRA stack)
      out   -> #99 MpiLoraModel ["Input_Lora_1"].model
```

So `is_9b` bypasses **both halves of the styles system** — the prompt injection and the LoRA
stack. Styles for 9B are deliberately deferred to a later version.

## 3. What the converter script must change for the 9B variant

| # | node | 4B value | 9B value |
|---|---|---|---|
| 1 | `#660 MpiSimpleBoolean ["Input_is_9b"]` | `false` | **`true`** |
| 2 | `#27 UNETLoader` | 4B checkpoint | `flux-2-klein-9b-int8-convrot.safetensors` |
| 3 | `#14 CLIPLoader` | `qwen_3_4b…`, type `flux2` | `qwen_3_8b_int8_convrot.safetensors`, type `flux2` |
| 4 | `#38 LoraLoaderModelOnly ["NSFW LoRA"]` | `…NSFW_party_time_v2.0_klein4b.safetensors` | `…_klein9b.safetensors` |
| 5 | `#143 LoraLoaderModelOnly` (refcontrol depth) | `flux2_klein_4b_refcontrol_depth…` | `flux2_klein_9b_refcontrol_depth…` |

Paths in the graph use a backslash: `flux2-klein\<file>`.

**The saved bench file is in a MIXED state** — `#27` and `#14` already hold the 9B
transformer and 9B text encoder, while `#660` is `false` and `#38`/`#143` still point at 4B
LoRAs. Do not read it as a finished 9B template; it is a 4B template mid-edit.

**Turbo is gone from this template.** No `Input_is_Turbo`, no turbo LoRA — confirmed by
scanning every node title and widget. That closes brief item "node 52 still exists", at
least for the bench copy; verify the SHIPPED `comfy_workflows/klein_t2i.json` separately.

Brief item 4 (the 4B LoRA trap) is **partly addressed**: `#38` and `#143` are now the only
`LoraLoaderModelOnly` nodes in the template and both get swapped by the converter. Node
`#259` (`flux2-klein-4b-outpaint`, `wf_type` 5 branch) is **not present in this bench
template** — check whether it survives in the shipped graph.

## 4. Inpaint has changed meaning — the UI copy is now wrong

LanPaint (`scraed/LanPaint`, GPL-3.0) was evaluated this session and **works on Klein 4B
distilled**, the checkpoint we actually ship — the README's distillation caveat did not
bite. It gives real mask-conditioned sampling instead of the regenerate-the-whole-crop
approach in `InpaintCropImproved → sample → InpaintStitchImproved`.

Consequence Fabio flagged: **removals now have to be specified by the user** — object
removal, character removal and so on are no longer one implicit behaviour of the inpaint
op. The per-op help and any op-strip copy that describes inpainting need updating. See
`docs/op-model-selection.md` and MPI-367 (per-op help copy), which is already on the board.

The LanPaint integration itself is its own card — this note exists only so the 9B wiring
does not ship UI copy that is already out of date.
