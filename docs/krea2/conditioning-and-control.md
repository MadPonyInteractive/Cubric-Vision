# Krea2 — conditioning & control

> Part of [docs/krea2/](README.md).

## Krea2 cannot edit images. It re-composes them.

**Krea2 reads no pixels.** Its sequence is `[text_tokens, noisy_image_patches]`
(`comfy/ldm/krea2/model.py`) and `Krea2.extra_conds()` (`comfy/model_base.py:2282`) consumes
**only** `cross_attn`. It is **not** in the `reference_latents` consumer list (`Flux`,
`Lumina2`, `WAN*`, `HiDreamO1`, `Omnigen2`, `QwenImage` are).

Consequences, all verified:

1. **A reference image reaches Krea2 only as *vision embeddings*,** via Qwen3-VL's vision tower
   (`Krea2Tokenizer` accepts `images=`; the `<|image_pad|>` token is swapped for the raw tensor
   in `comfy/text_encoders/qwen3vl.py:170-172`). Continuous embeddings, not latents. So Krea2
   can be *conditioned by* an image, but has no memory of its pixels.
   ⇒ This is **style / subject reference**, never editing. Anything calling it "Krea2 image
   edit" is overclaiming.
2. **The `vae` input on `TextEncodeQwenImageEdit(Plus)` is INERT on Krea2.** It attaches
   `reference_latents`, which Krea2 silently drops. No error, no effect. Leave it unwired.
   (It *does* work on Qwen-Image.)
3. **A Qwen→Krea2 sampler handoff cannot be a local editor.** Latent formats are compatible
   (both `Wan21`/16ch, both `shift 1.15`, same `qwen_image_vae`), so the handoff *runs* — but
   Krea2's late steps re-decide every pixel above their sigma floor, exactly as the stage-2
   refiner does at `denoise 0.35`. Live-tested 2026-07-10: the dress edit succeeded, and the
   poster, pillow, and phone changed too. **Ship Qwen-Image as the editor** (with masking) and
   upscale after — an upscale is the same global-fidelity pass, applied once the edit is final.

   **But the same handoff for ControlNet is alive.** Editing needs *locality* to cross the
   boundary; ControlNet needs only *structure*, which is baked into the latent. Qwen-Image has a
   **real side-network ControlNet** (`comfy/ldm/qwen_image/controlnet.py`; InstantX + Fun
   loaders at `comfy/controlnet.py:664,681`) covering every control type, but is ~1 MP-limited.
   Krea2 has one depth control-LoRA, but does 2K. `Qwen+ControlNet (structure) → Krea2 (2K
   fidelity)` is the promising pipeline — and is what the community tutorial actually showed.

## ⚠ NAG does not work on Krea2 — no negative prompt at all

Krea2-Turbo is **distilled and runs at `cfg 1.0`**, so it has no working negative prompt.
**NAG cannot rescue it**, and trying is worse than doing nothing:

- Core `comfy_extras/nodes_nag.py` `NAGuidance` hooks via `set_model_attn1_output_patch`.
- Krea2's DiT (`comfy/ldm/krea2/model.py`) threads `transformer_options` down to
  `optimized_attention_masked` but **never reads `transformer_options['patches']`** — there is
  no dispatch anywhere in the file.
- So `NAGuidance` on Krea2 is a **silent no-op** that still calls
  `disable_model_cfg1_optimization()` ⇒ forces the uncond pass ⇒ **doubles NFE (9 → 18) for
  zero effect.** Worst kind of failure: slower, identical output, no error.

KJNodes' NAG is `WanVideoNAG` (monkey-patches Wan attention classes *by name*) — also useless
here.

Fixing this properly is a ~5-line **upstream** patch to `krea2/model.py` mirroring
`flux/layers.py:199`. **Do not fork locally.**

⇒ Krea2's ModelDef declares `capabilities.negativePrompt: false`, and the prompt box hides its
positive/negative toggle for the active model.

## i2i: free, and it works down to very low denoise

Plain img2img needs **zero** new nodes or deps — `VAEEncode(source)` → sample at `denoise < 1.0`
(Krea2 is `ModelType.FLUX`; `VAEEncode` is model-agnostic, just `{"samples": vae.encode(pixels)}`).

**Live-verified 2026-07-10 (user):** works well **with BOTH stages running**, sensitive all the
way down to `denoise 0.19` — improves composition and light. Ship it as a normal i2i op.

> **A predicted "denoise floor ~0.40" was WRONG and has been removed.** The reasoning was: stage 2
> re-enters at a fixed sigma (`.329`), so a stage-1 entry sigma below that should make the refiner
> re-noise the image *above* where stage 1 left it and destroy the composition. **The live test
> refutes this** — `0.19` (entry sigma ≈ `.13`) looks great with the refiner active.
>
> Why it does not happen is **UNVERIFIED**. The workflow's stage 2 is RES4LYF
> `ClownsharKSampler_Beta`, not core `KSampler`; it has its own noise handling
> (`noise_stdev` scaling the init noise at `beta/samplers.py:75`, plus `sampler_mode` /
> `d_noise` / `denoise_alt` paths) and does **not** necessarily add noise up to `sigmas[0]` the
> way `common_ksampler` does. **Do not re-derive a floor from core-`KSampler` semantics** — the
> workflow does not use core KSampler for stage 2.

**Encoder choice matters for prompt adherence** (a conditioning property, settled before step 1):

| node | template | ref size | verdict |
|---|---|---|---|
| `TextEncodeQwenImageEditPlus` (core) | Qwen-Image **edit** template ❌ | 384×384 ❌ | worst adherence; zero deps |
| `TextEncodeKrea2` (`ethanfel/ComfyUI-Krea2TextEncoder`) | `KREA2_TEMPLATE` **describe** ✅ | megapixel-scaled ✅ | likely default |
| `Krea2EditRebalance` (`nova452`) | own + guidance math | tiered | best in expert test; ⚠ hardcodes the guidance that *is* its safety-filter-defeat path |

Krea2 was trained on a *describe* system prompt; core hands it an *edit* instruction at ¼
resolution. `TextEncodeKrea2` exposes `system_prompt` and ships both framings —
`KREA2_INSTRUCT_SYSTEM` is author-labelled *"out-of-distribution — experimental."* The
describe-vs-edit template is a **knob, not a bug**.

## ControlNet: depth only — but it works (live-verified 2026-07-10)

One trained control-LoRA (`Patil/Krea-2-depth-controlnet`, 822 MiB, at `loras/krea-2/control/`)
+ the `facok` node pack. No side-network ControlNet, no union model, no pose/canny/lineart/normal
weights exist. Preprocessors (`comfyui_controlnet_aux`) are model-agnostic and all exist — they
are *not* the gap; the trained adapter is. A pose map fed to the depth LoRA is read as depth
values (garbage, not an error). The `facok` loader is control-type agnostic, so future adapters
drop in — **build a control-type selector, don't hardcode depth.**

Wiring: `depth preprocessor → Krea2ControlImageEncode → Krea2ControlApply → sampler.model`,
with `Krea2ControlLoRALoader` feeding the model into Apply (order enforced in code — Apply
raises if the MODEL didn't come from the Loader).

| trap | fix |
|---|---|
| `resize: match_latent_size` (the default) **requires** the "optional" `latent` input | wire the same `EmptyLatentImage` that feeds the sampler |
| generic defaults are wrong for depth | `channel_mode: grayscale`, `normalize: per_image_minmax` |
| `fp8_scaled` transformer + rank-64 control LoRA | needs `facok` @ `79ebfd3` or later |

**App injection string** (queried live from `/object_info/Krea2ControlLoRALoader`):
`krea-2\control\depth-control-lora.safetensors` — subfoldered + backslash, same shape as the 9
style LoRAs, rides the MPI-229 path heal. Node pack has **no `requirements.txt`** ⇒
`installRequirements: false`.

Full workings: `.agents/mpi-kanban/tasks/MPI-242/research/image-conditioning-and-controlnet.md`
