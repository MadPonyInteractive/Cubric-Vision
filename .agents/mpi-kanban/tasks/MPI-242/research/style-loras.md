# Krea2 style LoRAs — trigger words + prompt placement

Research date: 2026-07-09. Question asked: how are the style LoRAs used, what does the
prompt need, and **where does the trigger phrase sit** (start or end)?

## Verdict (what to build)

- **9 style LoRAs**, all `469 MB` each, rank-64 BF16, hosted on `Comfy-Org/Krea-2/loras/`.
- Each has ONE **trigger phrase**, not a token. Phrases are plain English and all end in
  the literal word `style`.
- **The trigger goes at the END of the prompt.** Joined with `", "`.
- **Keep the prompt SHORT when a style LoRA is on.** Multiple sources say concise subject
  descriptions express the style more strongly; long prompts fight the LoRA.
- Recommended strength: **0.8–1.0**. The Comfy-Org repo card lists `1.0` for all nine.
  Older 4-LoRA set used 0.8 for three of them. Start at `0.8`, expose as a slider.

## The nine (authoritative: Comfy-Org/Krea-2 repo card + folder listing)

| filename (`loras/`) | trigger phrase | strength |
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

Cross-checked against an independent roundup (stablediffusiontutorials) — same 9, same
phrases, modulo capitalization. **Phrases are case-insensitive in practice; ship lowercase.**

`krea2_turbo_lora_rank_64_bf16.safetensors` also lives in that folder — it is **NOT a style
LoRA**. It is the turbo *distillation* LoRA you apply to RAW to make it behave like Turbo.
Do not put it in the style dropdown.

## ⚠️ STALE SOURCES — do not trust these

Both the **ComfyUI docs tutorial page** (`docs.comfy.org/tutorials/image/krea/krea-2`) and
the `MarkdownNote` inside our own workflow file list an **older, superseded 4-LoRA set**:

| stale name | stale trigger | status |
|---|---|---|
| `krea2_coolblue` | teal watercolor illustration style | **GONE from the repo** |
| `krea2_plasmoid` | ethereal shimmering light style | **GONE from the repo** |
| `krea2_warmpastel` | muted minimalist sketch style | **GONE from the repo** |
| `krea2_darkbrush` | monochrome ink wash style | survives, now strength 1.0 |

Our workflow's `CustomCombo` (node 42) and its `UNETLoader`-adjacent `LoraLoaderModelOnly`
(node 70, `krea2_warmpastel.safetensors`) both reference dead files. **The combo list and
the loader default must be rebuilt from the 9 above** before this workflow can run against
a fresh model install.

## Placement — the evidence

1. **Our own workflow already appends.** `StringConcatenate` node 67 is titled
   `Concatenate Text (LoRA Trigger Word)`; `string_a` ← the (possibly enhanced) prompt via
   `PreviewAny` node 62, `string_b` ← the trigger phrase from the CustomCombo subgraph,
   delimiter widget `", "`. So: `<prompt>, <trigger>`. Trigger is the SUFFIX.
2. **Community guidance** (stablediffusiontutorials roundup, quoted): add the style's
   trigger *to the end of your prompt*; shorter prompts give better results — describe the
   subject simply and always put the trigger at the end.
3. A third-party prompting guide suggests a mid-prompt slot
   (`subject, trigger, setting, composition, style/mood`). **Discount it** — it is not from
   Krea or Comfy-Org, and it contradicts both (1) and (2). Ignore unless live A/B says otherwise.

Krea's own repo (`krea-ai/krea-2`) and its `docs/prompting.md` say **nothing** about style
LoRAs or trigger placement. There is no first-party statement to appeal to. The suffix
convention rests on Comfy-Org's reference workflow + community practice — strong, but
worth one live A/B before we hardcode it.

## Enhancer ordering (unresolved, but the graph decides)

The reference workflow enhances FIRST, appends the trigger LAST:

```
User Prompt ─┬─> (enhance off) ────────────┐
             └─> StringConcat(system+user) │
                    └─> TextGenerate ──────┤
                                           ▼
                              Switch(Refine Prompt?) ─> PreviewAny(62)
                                                            │
                          trigger phrase ──┐                │ string_a
                                           ▼ string_b       ▼
                          StringConcatenate(67)  "<prompt>, <trigger>"
                                           │
                              Switch(Enable LoRA?) ─> CLIPTextEncode
```

This ordering is **correct and should be preserved**: the LLM enhancer must never see the
trigger phrase, or it will paraphrase/bury it. Append after enhancement, never before.

Tension to flag: the enhancer produces LONG prompts; the LoRA guidance wants SHORT ones.
When a style LoRA is active we may want the enhancer defaulted off, or a shorter system
prompt. **Needs a live test — do not decide from docs.**

## Sampler settings (first-party, `krea-ai/krea-2` README)

- **Turbo**: `steps 8`, `cfg 0.0` (CFG disabled — distilled), `mu 1.15` (flow shift).
- **Raw**: `steps 52`, `cfg 3.5`, full sampler with CFG.

Our workflow's KSampler: `steps 8, cfg 1, euler, simple, denoise 1`. `cfg 1` is the ComfyUI
equivalent of "CFG disabled" (no negative pass), consistent. Note `ConditioningZeroOut`
(node 57) supplies the empty negative. `mu 1.15` has no KSampler slot — it is a
`ModelSamplingAuraFlow`/shift node in Comfy; **check whether our graph sets shift at all.**

## Files (Comfy-Org/Krea-2)

- `diffusion_models/`: `krea2_turbo_{bf16,fp8_scaled,int8_convrot,mxfp8,nvfp4}.safetensors`,
  `krea2_raw_{bf16,fp8_scaled,int8_convrot}.safetensors`
- `text_encoders/`: `qwen3vl_4b_{bf16,fp8_scaled}.safetensors`
- `vae/`: `qwen_image_vae.safetensors`

**Dep reuse note:** the VAE is `qwen_image_vae.safetensors` — that is the **Qwen** VAE,
NOT the Flux `ae.safetensors`. So `vae-flux-ae` is the WRONG dep to reuse; check whether
`vae-qwen-image` (added for the PiD upscaler, playbook §8) is the same file → reuse that.
The card's original assumption ("Flux family ⇒ vae-flux-ae") is **wrong** and must be
corrected. Text encoder is Qwen3-VL-4B — also not a Flux encoder. Krea2 is Flux-*lineage*
in architecture only; its conditioning/VAE stack is Qwen.

## Sources

- https://huggingface.co/Comfy-Org/Krea-2 (repo card: 9 LoRAs + triggers + strengths)
- https://huggingface.co/Comfy-Org/Krea-2/tree/main/loras (folder listing, sizes)
- https://github.com/krea-ai/krea-2 (first-party sampler settings)
- https://www.stablediffusiontutorials.com/2026/06/krea2-lora-models.html (trigger-at-end)
- https://docs.comfy.org/tutorials/image/krea/krea-2 (**stale 4-LoRA table**)
- https://blog.comfy.org/p/krea-2-open-source-models-are-now (RAW-train / Turbo-run)
- https://www.krea.ai/krea-2-open-source
