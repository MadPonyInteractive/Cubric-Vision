# Krea2 — style LoRAs

> Part of [docs/models/krea2/](README.md). The app-side injection seam is in [injection.md](injection.md).

**10 style LoRAs** (picker indices 1–10; index 0 = None). The original nine are 469 MB each,
from `Comfy-Org/Krea-2/loras/`; MidJourney was added later.

**They are MODEL-ONLY — there is no CLIP side.** Verified by reading the safetensors headers
of the original nine: 528 tensors each, **every key prefixed `transformer.`**, zero
text-encoder keys.
Rank **32**, dtype **F32** (not rank-64 BF16 — that is the unrelated `krea2_turbo_lora_rank_64_bf16`
distill LoRA in the same folder).

- Use **`LoraLoaderModelOnly`**. A full `LoraLoader` would expose a `strength_clip` widget that
  patches nothing.
- ModelDef declares **`loraStrengths: ['model']`** (same as Wan/LTX).
- **Trap:** 66 of the keys match `text_fusion.*` and look like text-encoder weights. They are
  not — `text_fusion` is a cross-attention block **inside the transformer** where image tokens
  attend to the already-encoded text embedding. Qwen3-VL itself is untouched.
- Injection still uses the MPI-219 object form `{lora_name, strength_model, strength_clip}`
  (`comfyController.js:1141` requires all three keys present to trip the special case). The
  writes are individually gated, so `strength_clip` silently lands nowhere on a
  `LoraLoaderModelOnly`. Send all three; only two apply.

| file (`loras/krea-2/style/`) | trigger phrase | strength |
|---|---|---|
| `krea2_darkbrush.safetensors` | `monochrome ink wash style` | 1.0 |
| `krea2_dotmatrix.safetensors` | `monochrome stippling style` | 1.0 |
| `krea2_kidsdrawing.safetensors` | `naive expressive sketch style` | 1.0 |
| `krea2_neondrip.safetensors` | `textured abstract style` | 1.0 |
| `krea2_rainywindow.safetensors` | `rainy window style` | 1.0 |
| `krea2_retroanime.safetensors` | `purple retro anime style` | 1.0 |
| `krea2_softwatercolor.safetensors` | `art deco watercolor style` | 1.0 |
| `krea2_sunsetblur.safetensors` | `ethereal motion blur style` | 1.0 |
| `krea2_vintagetarot.safetensors` | `vintage tarot style` | 1.0 |

`krea2_turbo_lora_rank_64_bf16.safetensors` also lives in that folder. It is **NOT a style
LoRA** — it is the distillation LoRA applied to Raw to make it behave like Turbo. Keep it out
of the style rack (it has no picker card and no label/image entry).

## The `Stylization` slider

`Stylization` = `strength_model` on the style LoRA. **Default `1.0`.**

Live-tested at `0.1 / 0.3 / 0.5 / 0.8 / 1.0` — each produces a **different image**, not merely
"more style". At `0.1` you get a colour photo with an ink texture; at `1.0` a near-monochrome
ink drawing. It changes *kind*, not *degree*.

It still works at `0` because **the trigger phrase stays in the prompt regardless** — the prompt
alone carries a styled result.

**Naming is deliberate.** The user chose `Stylization`. Not *"style strength"* (implies degree,
when it changes kind) and not *"style variation"* (implies randomness, when it is monotonic and
reproducible).

> **Open, untested by design:** should the trigger phrase scale out with the slider? Today the
> trigger is appended at **full force** even at `Stylization 0.1`, so the prompt asks for
> "monochrome ink wash style" while the LoRA barely applies it. The user reports it works well.
> That tension may *be* the good part — but it has never been evaluated as a deliberate design.

## UI labels + card images (`Input_Style` index → picker)

The app injects the **index**, never the filename. Labels = the stem after `krea2_`, title-cased.
The picker (`MpiStylePicker`) shows one image card per style; images come from
`styleLoraImages` on the ModelDef, resolved against `comfy_workflows/display/`.
All four Krea2 variants share this rack, so they share both arrays.

| idx | label | image (`krea2-style-*.webp`) |
|---|---|---|
| **0** | **None** (no-style baseline) | `none` |
| 1 | Dark Brush | `darkbrush` |
| 2 | Dot Matrix | `dotmatrix` |
| 3 | Kids Drawing | `kidsdrawing` |
| 4 | Neon Drip | `neondrip` |
| 5 | Rainy Window | `rainywindow` |
| 6 | Retro Anime | `retroanime` |
| 7 | Soft Water Color | `softwatercolor` |
| 8 | Sunset Blur | `sunsetblur` |
| 9 | Vintage Tarot | `vintagetarot` |
| 10 | MidJourney | `midjourney` |

The card images are **all the same prompt** — *"A woman and a man, explorers, running from a
massive dinosaur In a rain forest"* — one gen per style, so the grid reads as a like-for-like
comparison. Index 0 is that prompt with the rack **off**: the model's native look.
Re-shoot the whole set together if you ever change the prompt; a mixed set defeats the point.

`0` zeroes all ten LoRA strengths **and** selects no trigger phrase ⇒ the Stylization slider
is disabled at index `0`. See [injection.md](injection.md) for the two-scalar mechanism.

## Prompt contract

**The trigger phrase is APPENDED to the end of the prompt, joined with `", "`.**
In the shipped graph this is `MpiPromptList` (`prefix: ", "`, `suffix: "."`), driven by the same
`Input_Style` int — not an app-side string injection.

```
<user prompt>, monochrome ink wash style
```

- Trigger phrases are plain English, all ending in the literal word `style`. Case-insensitive
  in practice — ship lowercase.
- **Keep the prompt short when a style LoRA is active.** Community guidance: describe the
  subject simply, put the trigger last. Long prompts fight the LoRA.
- If any prompt-expansion step ever runs, it must run **before** the trigger is appended —
  an LLM that sees the trigger will paraphrase or bury it.

Krea's own repo and `docs/prompting.md` say **nothing** about style LoRAs or trigger placement.
There is no first-party statement. The suffix convention rests on Comfy-Org's reference
workflow + convergent community practice. Strong, but worth one live A/B before treating it
as law.

## ⚠ STALE SOURCES — do not trust

The **ComfyUI docs tutorial** (`docs.comfy.org/tutorials/image/krea/krea-2`) and the
`MarkdownNote` inside the official template both list a superseded **4-LoRA set**:
`krea2_coolblue`, `krea2_plasmoid`, `krea2_warmpastel` (**all three deleted from the repo**),
plus `krea2_darkbrush` (survives, strength changed 0.8→1.0). Any workflow derived from that
template points at dead files.
