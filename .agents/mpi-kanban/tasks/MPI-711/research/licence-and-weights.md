# Phase 1 — licence, weights, VRAM for Capybara and Bernini-R

Sourced 2026-09-09. Every figure carries the URL it came from. Anything the source does not
state is marked `not stated` and was NOT estimated.

## Headline: the ranking in `brief.md` inverts

`brief.md` records Capybara's licence as **MIT** and puts it first. That MIT tag covers
Glanty's own project. It does not cover the weights, and the weights are the problem.

**Bernini-R is the clean licence. Capybara carries the same territory restriction as H3.**

## Capybara (Glanty)

| | |
|---|---|
| repo | <https://huggingface.co/Glanty/Capybara> |
| stated licence | `mit` — "This project is released under the MIT License." |
| base | "This project is built upon: HunyuanVideo-1.5 - Base Video Generation Model" |
| weights hosted in-repo | **yes** — `transformer/` (16.7 GB, subfolder `capybara_v01`), plus `text_encoder`, `vae`, `vision_encoder`, `scheduler` |
| total repo size | **45 GB** |
| GPU floor | "NVIDIA GPU with compute capability >= 8.9 (Ada Lovelace or Hopper, e.g. RTX 4090, L40, H100)" — that is the FP8 requirement |
| VRAM in GB | **not stated** by the Capybara card. HunyuanVideo-1.5 itself states 14 GB minimum *with model offloading enabled* (<https://huggingface.co/tencent/HunyuanVideo-1.5>) |
| recommended | video 480p / 50 steps; image 720p / 50 steps |
| native tasks | T2V, T2I, **TV2V (instruction-based video-to-video)**, TI2I, "and various editing tasks" |
| local edits | "covering local and global edits (e.g., time-of-day and style changes), background replacement, and expression control" |
| ComfyUI | custom nodes: Capybara Load Pipeline / Generate / Load Video / Load Rewrite Model / Rewrite Instruction. Required ComfyUI version **not stated** |
| stated limitations | none on the card |

### The licence problem

Capybara ships a **16.7 GB transformer of its own**, described as "built upon"
HunyuanVideo-1.5. HunyuanVideo-1.5 is not open-weight in the Apache/MIT sense — it is under
the **Tencent Hunyuan Community License**
(<https://huggingface.co/tencent/HunyuanVideo-1.5/raw/main/LICENSE>), quoted verbatim:

> "THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH
> KOREA AND IS EXPRESSLY LIMITED TO THE TERRITORY, AS DEFINED BELOW."

> Territory: "the worldwide territory, excluding the territory of the European Union,
> United Kingdom and South Korea."

Also in that licence:

- 100 million MAU cap before a separate Tencent licence is required.
- "You must not use the Tencent Hunyuan Works or any Output or results of the Tencent
  Hunyuan Works to improve any other AI model."
- Outputs: "Tencent claims no rights in Outputs You generate." — outputs themselves are not
  claimed, but the right to *run the model at all* is territory-limited.

**A downstream MIT tag cannot grant rights in the upstream weights that Glanty does not
hold.** So for a UK/EU user this is the H3 restriction again, one layer down and less
visible.

**Confidence and what is NOT proven:** Glanty does not publish a LICENSE file for the
weights separately, and does not state whether the transformer is a fine-tune, continued
training, or a from-scratch train on the HunyuanVideo-1.5 architecture. "Built upon" plus a
16.7 GB in-repo transformer is a strong presumption of a derivative, not a proof. If it were
somehow a clean-room train, the MIT tag would stand — but nothing on the card claims that,
and the burden is the wrong way round for a shipped product.

## Bernini-R (ByteDance)

| | |
|---|---|
| source repo | <https://huggingface.co/ByteDance/Bernini-R> |
| stated licence | **Apache License 2.0** — "Apache License 2.0. See LICENSE." |
| territory restriction | **none stated** |
| commercial-use restriction | **none stated** |
| MAU cap | **none stated** |
| Comfy-Org repack | <https://huggingface.co/Comfy-Org/Bernini-R> — also tagged `apache-2.0`, states "Original model repository: https://huggingface.co/ByteDance/Bernini-R" |
| base | Wan 2.2, **renderer-only**; "No diffusion-based text-to-video backbone" |
| native tasks | "t2v, v2v, rv2v, r2v, img, ads2v" — **rv2v = reference-image-guided video editing and video insertion** |
| masked / localised editing | **not mentioned** |
| VRAM in GB | **not stated** by either repo or the Comfy tutorial |
| GPU note | ByteDance's own repo recommends a **Hopper GPU (H100/H800/H200)**, CUDA 12.4, PyTorch 2.5.1+cu124 — that is their reference inference stack |
| ComfyUI | **native nodes, no custom node pack.** "ComfyUI now natively supports Bernini-R nodes. Make sure you have updated to the latest version" — exact version **not stated** |

### Files the Comfy workflow pulls

<https://docs.comfy.org/tutorials/video/bytedance/bernini-r> — sizes **not stated** on the page:

| file | folder |
|---|---|
| `wan2.2_bernini_r_fp16.safetensors` | `diffusion_models` |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `text_encoders` |
| `Wan2_1_VAE_bf16.safetensors` | `vae` |
| `lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors` | `loras` |

The Comfy-Org repack additionally carries `fp8_scaled`, `int8_convrot` and `mxfp8` variants
of both high- and low-noise transformers, plus a `wan2.1_bernini_1.3B_fp16`. The quantised
variants are the consumer-GPU path — ByteDance's "Hopper recommended" describes their own
reference stack, not the Comfy route. **This is inference, not a measured claim.**

### One thing to watch when benching

The Comfy workflow loads `lightx2v_T2V_14B_cfg_step_distill_v2_lora` — a **cfg-step-distill
LoRA**, i.e. the same "runs at cfg 1.0" shape that on H3 left `BasicGuider` with no mechanism
to amplify the prompt against the known region (`brief.md` § The wall). Not necessarily the
same failure: rv2v conditions on a reference rather than fighting a plate through a mask. But
if Bernini-R also refuses to move hue, check whether cfg is pinned at 1.0 before concluding
anything.

## Recommendation

1. **Bench Bernini-R first**, against the plan's Capybara-first order. It is the only one of
   the two that can ship in the UK/EU, it is renderer-only so it should be faster than H3,
   and the download is a handful of files rather than 45 GB.
2. Capybara stays worth benching **as evidence**, not as a shipping candidate — if it solves
   the hair case where H3 could not, that proves the "native localised-edit task" thesis and
   justifies hunting a third permissively-licensed model. Do not spend 45 GB on it before
   Bernini-R has had its run.
3. Bernini-R's gap is that **masked/localised editing is not documented**. Its rv2v is
   reference-guided, which is the ORIGINAL character-replacement goal, not the narrowed hair
   case. The hair recolour may need to be re-expressed as a reference edit rather than an
   instruction.

## Sources

- <https://huggingface.co/Glanty/Capybara> and `/raw/main/README.md`, `/tree/main`, `/tree/main/transformer`
- <https://huggingface.co/tencent/HunyuanVideo-1.5> and `/raw/main/LICENSE`
- <https://huggingface.co/ByteDance/Bernini-R>
- <https://huggingface.co/Comfy-Org/Bernini-R>
- <https://docs.comfy.org/tutorials/video/bytedance/bernini-r>
