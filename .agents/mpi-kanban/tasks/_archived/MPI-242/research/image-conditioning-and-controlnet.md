# Krea2 — image conditioning, ControlNet, i2i, NSFW finetune

> Research session 2026-07-10. Companion to `docs/krea2/`.
> Every claim below traces to source read locally or fetched. `UNVERIFIED` markers are literal.

---

## 1. Reference-image conditioning is NATIVE. No third-party node needed.

**The headline: `Krea2Tokenizer` accepts `images=` out of the box, and core ComfyUI
already ships nodes that pass it.** The third-party `Conditioning-Rebalance` pack
reimplements this and bolts guidance math on top.

### The chain (read in `G:\ComfyUi\ComfyUI`)

| step | file:line | what happens |
|---|---|---|
| tokenizer accepts images | `comfy/text_encoders/krea2.py:28` | `Krea2Tokenizer.tokenize_with_weights(..., images=[])` → forwards to `Qwen3VLTokenizer` |
| image tensor replaces the token | `comfy/text_encoders/qwen3vl.py:170-172` | token id `151655` (`<|image_pad|>`) is swapped for `{"type":"image","data":<tensor>}` |
| vision tower runs | `comfy/text_encoders/qwen3vl.py:58,65` | `self.visual = Qwen3VLVisionModel(...)`; `merged, deepstack = self.visual(image, grid)` |
| DeepStack injection | `comfy/text_encoders/qwen3vl.py:113-116` | per-vision-layer features injected at image token positions |
| into conditioning | `comfy/text_encoders/krea2.py:44,65` | 12-layer tap `(B,12,seq,2560)` → flattened `(B,seq,30720)` |
| model fuses it | `comfy/ldm/krea2/model.py:210,252` | `self.txtfusion = TextFusionTransformer(...)`; `context = self.txtfusion(context, ...)` |

The image never needs its own model input slot — **it arrives disguised as text tokens**
and `cross_attn` carries it.

### It is NOT captioning, and it is NOT editing

Both intuitions are wrong, in opposite directions:

- **Not captioning.** No string is ever produced. Pixels → vision tower → continuous
  embeddings, interleaved with the prompt's token embeddings. A caption is a lossy
  bottleneck; this path has none. **Consequence: Cubric Prompt cannot replicate this.**
  The app can only hand Krea2 a string; it can never hand it a vision embedding.
- **Not editing.** Nothing pins output geometry to the reference. No latent
  concatenation, no structural control. It is **style / subject reference**.

Calling it "image edit" (as the third-party repo does) oversells it. Calling it
"IP-Adapter-like" is marketing.

### ⚠ The `reference_latents` trap — a live dead end

`TextEncodeQwenImageEdit` / `...EditPlus` (`comfy_extras/nodes_qwen.py:31-46, 75-105`)
have an **optional `vae` input**. When supplied they VAE-encode the reference and attach
`reference_latents` to the conditioning.

**Krea2 ignores it.** `comfy/model_base.py:2282` — `Krea2.extra_conds()` reads
`cross_attn` and nothing else. The ten `reference_latents` consumers in `model_base.py`
(L1020, 1034, 1504, 1519, 1642, 1739, …) are all OTHER model classes.

> Wiring a VAE into `TextEncodeQwenImageEditPlus` for Krea2 attaches latents that are
> **silently dropped**. No error. No effect. Leave the `vae` input disconnected.

The vision-token half works (it rides `cross_attn`). The VAE half is inert.

### ⚠ CORRECTION (2026-07-10, after user + source review)

An earlier draft of this doc recommended "use the CORE nodes, skip the third-party pack."
**That was wrong.** The plumbing is equivalent; the *conditioning* is not. Three nodes exist,
and the core one is the worst of them on Krea2.

The user reports an expert live comparison (Rebalance ≫ TextEncodeQwenImageEditPlus, with a
third Krea2-specific encoder also beating core). The metric was **prompt ADHERENCE, not image
quality** — which is decisive, because adherence is a pure conditioning property, settled
before the first denoising step. Source review explains it fully:

| node | template | ref image size | VAE / `reference_latents` |
|---|---|---|---|
| `TextEncodeQwenImageEditPlus` (core) | ❌ overrides with Qwen-Image **edit** template | ❌ hard-capped **384×384** | ❌ accepts VAE → latents **silently dropped** |
| `TextEncodeKrea2` (ethanfel) | ✅ forces `KREA2_TEMPLATE` (**describe**) | ✅ megapixel-scaled, default **1.0 MP** | ✅ input removed entirely |
| `Krea2EditRebalance` (nova452) | own template + guidance math | tiered | n/a |

Krea2 was trained under a *describe* system prompt. The core node hands it an *edit*
instruction at a quarter of the resolution. That is a sufficient, mechanical explanation for
poor adherence — no aesthetics involved.

**Lesson:** verifying that a node *carries* images is not verifying it carries them *as the
model expects*. Mechanically equivalent, semantically wrong. See
[[feedback_test_user_instinct_first]].

### The three nodes

| node | class | repo | verdict |
|---|---|---|---|
| core | `TextEncodeQwenImageEdit` / `...EditPlus` | `comfy_extras/nodes_qwen.py` | **worst adherence.** Zero deps. Baseline only. |
| Krea2-specific | `TextEncodeKrea2` | `ethanfel/ComfyUI-Krea2TextEncoder` | **likely default.** Fixes template + resolution + VAE. |
| rebalance | `Krea2EditRebalance` | `nova452/ComfyUI-Conditioning-Rebalance` | best in the expert test; carries the unfilter path (§2) |

`TextEncodeKrea2` source (`nodes.py`) **independently confirms** the `reference_latents`
finding derived here from `model_base.py:2282` — its module docstring: *"The Krea2 DiT is pure
text-to-image: its sequence is `[text_tokens, noisy_image_patches]` with no slot for a
reference latent, so a VAE input would be a no-op here and is deliberately omitted."*
Two independent derivations, same conclusion.

### 🔑 The describe-vs-edit template is a KNOB, not a bug

`TextEncodeKrea2` exposes an optional `system_prompt` input and ships **both** framings:

- `KREA2_SYSTEM_DEFAULT` — parsed out of comfy's own `KREA2_TEMPLATE`. In-distribution.
- `KREA2_INSTRUCT_SYSTEM` — an edit/instruct framing "to make the VLM fuse the user's text
  WITH the reference image instead of just describing it." The author labels it
  **"Out-of-distribution for Krea2's trained descriptor — experimental."**

So the core node's failure is not that an edit template is *never* right — it is that core
forces it with no way to opt out, at 384px, while Krea2's trained default is *describe*.

Other knobs: `vision_megapixels` (0.1–8.0), `mask_padding` (mask crops the ref to its bbox —
reference masking, **not** inpainting; Krea2 has no inpaint pathway), `vision_position`
(image-before-text vs after, "experimental"), `print_prompt` (dumps the assembled prompt).

**This is the A/B to run:** `KREA2_SYSTEM_DEFAULT` vs `KREA2_INSTRUCT_SYSTEM`, at 1.0 MP,
against `Krea2EditRebalance`. That single axis may be the entire reason Rebalance wins.

---

## 2. `nova452/ComfyUI-Conditioning-Rebalance` — verdict: skip

Canonical repo per its own `pyproject.toml [project.urls]`:
`github.com/nova452/ComfyUI-ConditioningKrea2Rebalance`.

**What it actually is:** a reimplementation of the core `nodes_qwen.py` encode path
(`compile_edit()` builds the same `Picture N:` prompt and calls the same
`clip.tokenize(images=...)`), plus tensor-space guidance math on the resulting
conditioning.

| node | does | notes |
|---|---|---|
| `Krea2EncodeRebalance` | encode text + ≤4 images | ≈ core `TextEncodeQwenImageEditPlus` (which caps at 3) |
| `Krea2EditRebalance` | encode + 3× `guidance()` + `RebalanceCFG` | **hardcodes `guidance(cond_raw, compiled, -0.5)`** |
| `ConditioningKrea2Rebalance` | per-layer band scaling (12 × 2560) | pure tensor math |
| `RebalanceGuider`, `StepRebalance`, `RebalanceCFG` | conditioning manipulation | — |

**The "unfilter" is not a toggle.** The repo advertises "bypassing the built in quality
dilution from the trained safety filter … works as a means to unfilter the model." There
is no flag or dedicated node for it — the mechanism *is* the `_apply_dissim()` /
`guidance()` dissimilarity projection against an empty/negative reference, and
`Krea2EditRebalance.main()` hardcodes it into the pipeline. It cannot be switched off in
the node that exposes the 4-image path.

**Separability:** `Krea2EncodeRebalance` skips the guidance pipeline, so *it* is clean.
But it offers nothing over core `TextEncodeQwenImageEditPlus` except a 4th image slot.

**Supply chain (read: `conditioning_rebalance.py`, `krea2.py`, `ideogram4.py`,
`pyproject.toml`):** no network calls, no binary blobs, no pickle, no `requests`/
`subprocess`/`urllib`. Zero pip deps. ~450 lines of pure tensor math. Risk is low.

## ❌ VERDICT: DROPPED (user-tested 2026-07-10)

User installed and tested it: **"just false advertising — it's not really an image editor."**

**The source predicted this exactly.** Rebalance has no `reference_latents`, performs no VAE
encode, and never produces a latent. Reference images enter as *vision embeddings* only. So it
**recomposes from a reference; it cannot preserve pixels.** Calling that "image edit" was the
overclaim, and the "unfilter the model" advertising in the same README was the tell.

**Bonus:** the open question of whether Rebalance's quality was *entangled* with its
`guidance(cond_raw, compiled, -0.5)` unfilter path is now **moot**. We never have to answer it.

Historical detail (for anyone re-evaluating): `Krea2EncodeRebalance` skips the guidance pipeline
and is clean, but adds nothing over `TextEncodeKrea2`. Supply chain was never the problem
(~450 lines, zero deps, no network). The *capability claim* was.

---

## 3. ControlNet — a native path exists (depth only)

`github.com/facok/comfyui-krea2-controlnet` — source read (`nodes.py`, `__init__.py`).

- **No `requirements.txt`** (404). Imports only `torch`, `folder_paths`, and ComfyUI
  internals (`comfy.model_management`, `comfy.patcher_extension`, `comfy.weight_adapter.lora.LoRAAdapter`).
  **Zero new pip deps.**
- **Does not patch ComfyUI globally.** Uses `ModelPatcher`: `add_patches()` for the LoRA,
  `PatcherInjection` for the expanded `first` projection, `add_wrapper_with_key(DIFFUSION_MODEL)`.
  Original `diffusion_model.first` restored in a `finally`. Composes with the built-in
  Krea2 inference path.
- **Ships no preprocessors.** Needs `comfyui_controlnet_aux` (Depth Anything etc.) —
  **check whether that is already in the Cubric node set** before costing this.

| node | inputs | outputs |
|---|---|---|
| `Krea2ControlLoRALoader` | `model`, `lora_name`, `strength` | MODEL |
| `Krea2ControlImageEncode` | `control_image`, `vae`, resize/channel/normalize/invert opts, opt. `latent` | LATENT, IMAGE |
| `Krea2ControlApply` | `model` (from loader), `control_latent` | MODEL |

Wiring: `LoRALoader` → `ControlApply` → sampler `model`. `ImageEncode` feeds
`ControlApply.control_latent`.

**Mechanism:** depth map → Krea2/Qwen VAE → latent, concatenated channel-wise to the noisy
latent every step via a `first` projection widened 64→128. Same approach as
`BFL/Flux.1-Depth-dev-lora`. Single forward pass, no second denoise.

### There is NO real ControlNet for Krea2 — only a depth control-LoRA

**No side-network ControlNet (ZeroConv-style, à la SD1.5/SDXL) exists for Krea2. No union/multi
model. No canny/pose/lineart/normal/tile weights.** Only `Patil/Krea-2-depth-controlnet`.
(`katop1234/krea_controlnet` is a stub: `.gitattributes` only, no model card, no weights.)

**Preprocessor ≠ control adapter.** Keep these apart:

| layer | exists? | notes |
|---|---|---|
| **preprocessors** (OpenPose, Canny, DepthAnything, lineart, normal) | ✅ all of them | `comfyui_controlnet_aux`, model-agnostic. Produce the hint image. |
| **control adapter** (injects the hint into *Krea2's* transformer) | ❌ **depth only** | one trained LoRA |

So you can generate a perfect pose skeleton today and Krea2 has nothing to consume it.
Feeding a pose map into the depth LoRA does **not** work — that LoRA's widened input
projection was trained on depth-map statistics (grayscale, minmax-normalized); a skeleton or
edge map would be read as depth values. Garbage, not an error.

**Good news: the scaffolding is generic.** `facok`'s loader is control-type agnostic —
`channel_mode` (rgb/grayscale) and `normalize` (none/per_image_minmax) are *format* flags with
no depth semantics; the README states the control type is determined by the LoRA checkpoint.
`Tanmaypatil123/Krea-2-controlnet`'s training recipe explicitly covers "depth, canny, tile,
gray, or any custom pixel-aligned control signal." Recommended per-type settings:

| control type | `channel_mode` | `normalize` |
|---|---|---|
| depth | `grayscale` | `per_image_minmax` |
| canny / pose / lineart / normal | `rgb` | `none` |

⇒ **If we wire depth, put a control-type selector behind it** rather than hardcoding depth.
New adapters drop in without re-architecting. The plumbing is ready; only the weights are missing.

**Weights:** `huggingface.co/Patil/Krea-2-depth-controlnet` — one file,
`depth-control-lora.safetensors`. License `krea-2-community-license` (commercial OK under
$1M revenue).
**Depth is the ONLY public control weight.** Canny/pose/lineart/normal are
architecturally supported by the node but **no weights exist** (searched HF; `Comfy-Org/Krea-2`
has none).

**DOWNLOADED 2026-07-10** → `G:\CubricModels\loras\krea-2\control\depth-control-lora.safetensors`
(mirrors the existing `loras/krea-2/style/` convention ⇒ ComfyUI lists it as
`krea-2\control\depth-control-lora.safetensors`, subfoldered + backslash, same as the style
LoRAs — see `docs/krea2/injection.md` § Local install layout).

Header read directly (`861995928` bytes, matches HF `content-length` exactly):

| fact | value |
|---|---|
| tensors | 450 |
| dtype | all `F32` |
| top-level prefixes | `blocks`, `first` |
| `first.weight` | **`[6144, 128]`** ← the widened input projection |
| `first.bias` | `[6144]` |
| LoRA key form | `blocks.N.attn.wk.A` / `.B` — **not** `lora_A`/`lora_down` |

`first.weight`'s 128 input columns (vs base Krea2's 64) independently **confirm the
channel-concat mechanism** — the control latent is concatenated to the noisy latent and the
widened projection consumes both. This is tensor-level proof, not a model-card claim.

### ✅ LIVE-VERIFIED 2026-07-10 — depth control works end to end

Node pack cloned to `G:\ComfyUi\ComfyUI\custom_nodes\comfyui-krea2-controlnet` @ `79ebfd3`
("Support quantized Krea2 LoRA shape matching" — needed, since our transformer is
`krea2_turbo_fp8_scaled`). `comfyui_controlnet_aux` was already installed.

User ran it: source photo → depth preprocessor → `Krea2ControlImageEncode` →
`Krea2ControlApply` → sampler. **Output holds the source pose while Krea2 fully repaints the
subject.** Depth conditioning confirmed working.

Two things this proved that were previously only reasoned about:

1. **Quantized (`fp8_scaled`) transformer + rank-64 control LoRA with a widened
   `first.weight [6144, 128]` projection loads cleanly.** That is what the `79ebfd3` commit is
   for — clone at or after it.
2. **The subfoldered backslash path resolves on the Windows-local engine.** Queried live from
   `/object_info/Krea2ControlLoRALoader`, ComfyUI lists the weight as:

   ```
   krea-2\control\depth-control-lora.safetensors
   ```

   ⇒ **this exact string is what the app must inject** into `lora_name`. Same shape as the 9
   style LoRAs, so it rides the existing MPI-229 path heal. (Still unverified on **non-Windows
   local** engines — that is MPI-198, and it stays open. RunPod does not test it,
   see [[feedback_runpod_not_local_engine_proof]].)

### Dependency surface — audited before install

No `requirements.txt` / `pyproject.toml` / `setup.py` / `install.py` (all 404). Whole repo is 5
files. Every import is stdlib, `torch`, or a ComfyUI internal (`folder_paths`,
`comfy.ldm.common_dit`, `comfy.model_management`, `comfy.patcher_extension`, `comfy.utils`,
`comfy.weight_adapter.lora.LoRAAdapter` — all verified present). No `subprocess`/`eval`/`exec`/
`pickle`/network/file-writes in 709 lines. **Cannot touch the torch install.**

⇒ For `dependencies.js`: `type: 'custom_nodes'`, **`installRequirements: false`** (there is
nothing to install), pin `nodes.KREA2_CONTROLNET` @ `79ebfd3` in `dev_configs/node_lock.json`.

### ~~The "Qwen base → hand to Krea2" video: mischaracterization~~ — ⚠ THIS VERDICT WAS WRONG

**Retracted 2026-07-10.** The original claim ("no such handoff exists; do not chase it") answered
the wrong question. It correctly established that the *depth control-LoRA* does not work by
handing latents between models. It then wrongly generalized that to "no Qwen→Krea2 pipeline
exists."

**It does, and it makes sense — for ControlNet.** Qwen-Image has a real side-network ControlNet
(`comfy/ldm/qwen_image/controlnet.py`, InstantX + Fun loaders); Krea2 has only a depth
control-LoRA. So: use Qwen (which supports every preprocessor) to establish structure, hand the
latent to Krea2 for 2K fidelity. See §5b for why structure survives a handoff and locality does
not. **Do chase it.**

Lesson: "mechanism X is not how feature Y works" ≠ "pipeline X is not worth building."

---

## 4. i2i / editing — what's real

**Nothing official.** `Comfy-Org/Krea-2` (146 GB) contains only t2i transformers (8
quant variants), 10 LoRAs, 2 text encoders, 1 VAE. **No edit or i2i variant.**
`github.com/krea-ai/krea-2` README documents t2i only. `comfy_extras/` has no
`nodes_krea2.py`.

Three tiers available:

1. **Plain latent img2img** — `VAEEncode` → sample at `denoise < 1.0`. Works because
   Krea2 is `ModelType.FLUX` with a normal latent space. **Zero new deps.** The only
   fully native path. `VAEEncode` is model-agnostic (`{"samples": vae.encode(pixels)}`).
   ✅ **LIVE-VERIFIED 2026-07-10:** works with both stages, sensitive down to `denoise 0.19`,
   improves composition and light. A predicted "denoise floor" was **wrong** — see below.

### ❌ RETRACTED: the predicted "i2i denoise floor ~0.40" does not exist

**I predicted a floor. The live test refuted it. Recording the whole thing so nobody re-derives it.**

**The (wrong) reasoning.** Stage 2 re-enters at a fixed sigma (`.329` live; `.362` by my
reconstruction) because its `denoise 0.35` is independent of stage 1. So a stage-1 entry sigma
below that should mean the refiner re-noises the image *above* where stage 1 left it, re-deciding
the structure a low-denoise i2i was preserving. Computed (`beta_scheduler` + flow-matching sigmas,
`shift 1.15`, stage 1 = 6 steps): denoise `0.50`→entry `.536`, `0.40`→`.396`, `0.35`→`.331`,
`0.20`→`.140`. Predicted: anything ≤ `0.35` gets wrecked.

**The refutation (user, live, 2026-07-10):** i2i works down to **`denoise 0.19`** — entry sigma
≈ `.13`, far below stage 2's entry — **with BOTH stages running.** Improves composition and light.
No wrecked structure.

**Why the prediction failed — partially traced, ultimately UNVERIFIED:**

The error was assuming stage 2 behaves like core `common_ksampler`, which adds noise scaled to
`sigmas[0]` (`nodes.py:1563`, `comfy.sample.prepare_noise`). **The workflow's stage 2 is RES4LYF
`ClownsharKSampler_Beta`, not core `KSampler`.** RES4LYF has its own noise machinery:

- `beta/samplers.py:75` — `noise_sampler_init(sigma=sigma_max * noise_stdev, ...)`: a
  **`noise_stdev`** knob scales the init noise, unaccounted for in my model.
- `beta/samplers.py:342-345` — `sigmas *= denoise` when a schedule is supplied, else
  `get_sigmas(model, scheduler, steps, abs(denoise))`, then `sigmas *= denoise_alt`.
- `beta/rk_sampler_beta.py:335` — `prepare_sigmas(sigmas, sigmas_override, d_noise,
  d_noise_start_step, sampler_mode)`; `d_noise` rescales the whole schedule.
- `sampler_mode` (`standard`/`resample`/`unsample`) changes noise/latent handling entirely.

I did not fully trace which of these makes low-denoise i2i survive the refiner. **Do not
re-derive an i2i floor from core-`KSampler` semantics — stage 2 is not core KSampler.**
If this ever needs a real answer, instrument the live run (log `sigmas` and the init-noise tensor
norm entering stage 2), don't reason from `nodes.py`.

**Practical upshot:** none. i2i ships as-is, both stages, denoise usable to ~`0.19`.

### ❌ Rebalance cannot help i2i either (same root cause)

Tempting thought: *"maybe Rebalance shines at i2i."* **No.** Plain i2i feeds the source in as a
**latent**, on the sampler's `latent_image` input. Rebalance only ever touched the **conditioning**
tensor (vision embeddings + guidance math) — it never produced or read a latent. It would describe
the reference into conditioning while the real image content flows through a channel it never
touches. Same failure as the edit test, new label. **Do not reinstall it for i2i.**
2. **Vision-token reference conditioning** — §1 above. Core nodes, zero new deps.
   Style/subject, not structure.
3. **Third-party edit LoRAs** — `ostris/krea2_turbo_style_reference` (+ `ComfyUI-Krea2-Ostris-Edit`),
   `conradlocke/krea2-identity-edit` (+ `ComfyUI-Krea2Edit`). Each needs a custom node pack.
   **UNVERIFIED** — not source-read this session.

---

## 5. NSFW finetune — "Coyote" NOT FOUND (as of 2026-07-10)

Searched: HF `?search=krea2`, HF `?search=krea+nsfw`, and 5 web searches across
HF/Civitai for "coyote" + krea2 variants. **No model by that name, any spelling.**

Ecosystem is active, so a release would likely surface fast. Near-matches (**not** Coyote,
asserted as nothing more than near-matches):

| name | kind | source |
|---|---|---|
| `uzumix/krea2_nsfw` | LoRA, targets Turbo | HF, verified |
| `[BSS] - Krea2 NSFW Patch` | UNVERIFIED (LoRA or ckpt?) | Civitai |
| `RedCraft \| KREA 2 Red Mix Edition NSFW` | ckpt merge, UNVERIFIED | Civitai |
| `Moody Krea 2 Mix (uncensored) V3.0` | ckpt, UNVERIFIED | Civitai |
| `Kreamania` | ckpt merge 12.24 GB, UNVERIFIED | Civitai |

Civitai was geo-blocked (UK OSA) for the research agent — Civitai rows above are
search-snippet only. **Re-check in a few days.** Full finetune ⇒ new ModelDef + multi-GB
upload. LoRA ⇒ just a dep entry.

---

---

## 5b. 🎯 Qwen-Image → Krea2 sampler handoff (the image-editor plan)

**User's idea (2026-07-10):** Qwen-Image edits well but its image quality is mediocre. Krea2's
quality is excellent and fast. So: run the **early** sampler steps on Qwen-Image (where edit
semantics + layout are decided) and the **late** steps on Krea2 (where texture + fidelity are
decided). Hand off the **latent** mid-sampling.

**This is structurally sound.** Verified in `comfy/supported_models.py`:

| | Krea2 (L1823) | QwenImage (L1851) |
|---|---|---|
| `latent_format` | `latent_formats.Wan21` | `latent_formats.Wan21` ✅ **identical** |
| `sampling_settings.shift` | `1.15` | `1.15` ✅ **identical** |
| `multiplier` | `1.0` | `1.0` ✅ |
| VAE | `qwen_image_vae` | `qwen_image_vae` ✅ **same VAE** |
| text encoder | `qwen3vl_4b` | `qwen25_7b` ❌ **differ** |

`Wan21` = 16 latent channels. Same latent space, same VAE, same shift ⇒ **a latent from
Qwen-Image's early steps is directly consumable by Krea2's late steps.** No VAE round-trip, no
re-encode, no rescale. Exactly the hand-off already used between Krea2 stage1→stage2.

Not a coincidence: Krea2 borrowed Qwen's conditioning + VAE stack wholesale (the "Flux-lineage
in architecture only" fact, used constructively).

**The one thing that does NOT transfer: conditioning.** Krea2 needs `qwen3vl_4b` embeddings
(12-layer tap, 30720-dim); Qwen-Image needs `qwen25_7b`. Each stage requires **its own
`Load CLIP` + its own text-encode node.** Hence two encoders on disk (§6) — do not conflate them.

Sketch:

```
Load CLIP (qwen_2.5_vl_7b, type=qwen_image) ─┐
   source image ──> TextEncodeQwenImageEditPlus (+VAE ✅ works here) ──> Qwen sampler
                                                    denoise 1.0, end_at_step N
                                                             │ LATENT (Wan21, 16ch)
                                                             ▼
Load CLIP (qwen3vl_4b) ──> TextEncodeKrea2 ──────> Krea2 sampler
                                                    start_at_step N, same latent ──> VAEDecode
```

**Note the asymmetry:** `reference_latents` from the VAE input are **inert on Krea2** but
**live on Qwen-Image** (`QwenImage` consumes them). So wire the VAE on the Qwen side; leave it
off the Krea2 side. The trap is Krea2-specific.

### ❌ TESTED LIVE 2026-07-10 — the handoff works, but CANNOT be a local editor

**Result (user-run, 896×1152, prompt = "change her dress to a red dress with a skirt"):**
Qwen-alone edited *only* the dress. Qwen→Krea2 produced **visibly better quality** but **also
changed the wall poster, the pillow, and the phone.** The edit stopped being local.

**This is structural, not a tuning failure. Do not re-open by moving the cut point.**

The locality lives in `reference_latents` — Qwen edits a specific region because it *reads the
source image* (`QwenImage` is in the `reference_latents` consumer list; verified by grepping
class bodies in `model_base.py`). **Krea2 is not in that list.** Krea2's sequence is
`[text_tokens, noisy_image_patches]` (`comfy/ldm/krea2/model.py` docstring) — no reference-latent
slot, no spatial conditioning channel. **There is nowhere to tell Krea2 "keep this region."**

So the handoff propagates **fidelity globally** but cannot propagate **locality**, because
locality was carried by a conditioning signal Krea2 structurally cannot receive. Krea2's late
steps re-decide every pixel still above their sigma floor.

**This exactly reproduces a documented effect.** `docs/krea2/samplers.md` on the stage-2 refiner at
`denoise 0.35`: *"starts at sigma .329, above stage 1's .275 ⇒ re-decides things stage 1 had
settled (observed: neon sign, wall poster, a ring appeared). A partial regeneration, not pure
polish."* Poster/pillow/phone is the **same phenomenon in a new context**. Any sigma high
enough for Krea2 to add real detail is high enough for it to re-decide structure. The trade is
not tunable away.

**Masking — NOT an escape hatch, it is the ship plan.** `SetLatentNoiseMask`
(`comfy_extras/nodes_mask.py`) confines denoise to a masked region. An earlier draft dismissed
this as "a different product." **Correction (user, 2026-07-10): Qwen masking is part of the
planned edit op** — a separate working workflow already exists where the user masks an area and
only that area changes. That *also* kills the zoom artifact, since an unmasked latent is never
resampled/rescaled.

So masking is not a workaround for Krea2's missing locality; it is how the **Qwen** editor ships.
It sidesteps the whole handoff question for editing.

### ✅ …but the handoff is ALIVE for ControlNet (different problem, opposite outcome)

**Reframe (user, 2026-07-10):** the YouTube tutorial that inspired the Qwen+Krea2 combo was
doing **ControlNet, not editing** — because *Qwen supports preprocessing*. That is a coherent
design, and an earlier note in this doc calling it an "obsolete mischaracterization" was
**wrong**: it answered "is this how the depth control-LoRA works?" when the real question was
"is this a sensible pipeline?"

**Why ControlNet survives the handoff and editing does not:**

> **Editing needs *locality* to cross the handoff. ControlNet needs only *structure*.**

Locality ("change only the dress") lived in `reference_latents` and died at the boundary —
Krea2 cannot read it. But a depth map / pose skeleton constrains the **whole frame's geometry**.
Once Qwen lays down composition under control, the geometry is already baked into the latent.
Krea2's late steps re-deciding texture *everywhere* is then **the feature, not the bug** —
exactly the global-fidelity pass you want. No conflict.

**Qwen-Image has a REAL ControlNet. Krea2 does not.** Verified in core ComfyUI:

| | Qwen-Image | Krea2 |
|---|---|---|
| ControlNet | ✅ **side-network**, `comfy/ldm/qwen_image/controlnet.py` | ❌ one depth control-LoRA |
| loaders | `load_controlnet_qwen_instantx` (`controlnet.py:664`), `load_controlnet_qwen_fun` (`:681`) | `facok` custom node |
| classes | `QwenImageControlNetModel`, `QwenImageFunControlNetModel`, `QwenFunControlNet` | — |
| control types | canny, pose, depth, tile, union… | **depth only** |
| `reference_latents` | ✅ (+ `reference_latents_method`) | ❌ |
| native resolution | ~1 MP practical | **2K** |
| quality | mediocre | excellent |

**Perfectly complementary.** Qwen has every control type but is resolution-limited and
mediocre; Krea2 is 2K and excellent but has one control type. Qwen's ~1 MP ceiling — the root
of the "zoom" artifact — is escaped precisely by letting Krea2 run the late steps at 2K.

**⇒ OPEN, worth testing:** `Qwen + ControlNet (early, structure) → Krea2 (late, 2K fidelity)`.
Same latent compatibility as §5b (both `Wan21`/16ch, `shift 1.15`, same VAE). Unlike the editor,
there is no locality to lose.

---

**⇒ VERDICT: abandon the Qwen→Krea2 sampler handoff as an EDITOR** (this section's original
subject). Replaced by:

> **Qwen-Image edit → (user) upscale with a better model.**
> An upscale is the same global-fidelity pass the handoff was reaching for, but it runs *after*
> the edit is final, so it cannot un-edit anything. Cubric already has upscalers. Correct order,
> zero new architecture.

### Qwen's two flaws — one is a fixable bug, one is a real limit

1. **"Zoom in/out" — likely FIXABLE, not inherent.** `TextEncodeQwenImageEditPlus`
   (`comfy_extras/nodes_qwen.py`) normalizes the reference to ~1 MP before VAE-encoding it:
   ```python
   total = int(1024 * 1024)
   scale_by = math.sqrt(total / (samples.shape[3] * samples.shape[2]))
   ```
   If the **output** latent's dimensions/aspect differ from the reference's post-scale size,
   Qwen reconstructs at a different scale ⇒ reads as zoom. (User's 896×1152 = 1.03 MP, right at
   the boundary.) **Test: match the output latent to the reference's post-scale dims.**
2. **Mediocre quality — REAL and structural.** No knob fixes it. Recovered downstream by an
   upscale pass.

### The clean split this forces

| model | what it actually does | why |
|---|---|---|
| **Qwen-Image** | **image EDITOR** — spatially targeted | reads `reference_latents` ⇒ knows the source pixels |
| **Krea2** | **reference-conditioned GENERATION** — recomposes | reads vision *embeddings* only ⇒ no pixel memory |

Krea2 + `TextEncodeKrea2` / `Krea2EditRebalance` is **style/subject reference, not editing.**
Naming it "edit" (as the Rebalance repo does) was always the overclaim — this test is the proof.

---

## 6. Local disk state (`G:\CubricModels`) — verified 2026-07-10

```
loras/krea-2/style/     krea2_*.safetensors            (9 style LoRAs)
loras/krea-2/control/   depth-control-lora.safetensors (822 MiB, THIS SESSION)
text_encoders/          qwen3vl_4b_fp8_scaled.safetensors  (5.24 GB, already present 2026-07-08)
text_encoders/          qwen_2.5_vl_7b_fp8_scaled.safetensors (9.38 GB, THIS SESSION)
```

**Do not confuse the two Qwen encoders.** They are different models:

| file | model | used by |
|---|---|---|
| `qwen3vl_4b_fp8_scaled.safetensors` | Qwen3-VL-**4B** | **Krea2** (`Krea2Tokenizer`, 12-layer tap) |
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` | Qwen2.**5**-VL-**7B** | **Qwen-Image** (`Load CLIP type: qwen_image`) |

The 7B/2.5 encoder was fetched for a user-run Qwen+Krea2 combo experiment. It is **not** a
Krea2 dependency and must not enter `dependencies.js` for MPI-242.

**Path convention:** `loras/` is the ONLY tree ComfyUI recurses with relative paths, so only
LoRAs surface as `krea-2\control\...` (backslash, subfoldered) and only they depend on the
MPI-229 / MPI-198 cross-platform path heal. `text_encoders/` is flat and listed by basename —
no path-heal exposure. The depth ControlNet is deliberately subfoldered to match the style
LoRAs (user-confirmed 2026-07-10).

---

## Recommendation (revised 2026-07-10)

**CLOSED:** Qwen→Krea2 handoff as a *local editor* — tested live, structurally impossible (§5b).
**REOPENED for a different purpose:** the same handoff for *ControlNet* (§5b), where only
structure needs to cross, not locality.

~~1. `Krea2EditRebalance`~~ — **DROPPED 2026-07-10.** User tested it: *"just false advertising,
it's not really an image editor."* Consistent with source — no `reference_latents`, no VAE
encode, vision embeddings only ⇒ it recomposes, it cannot preserve pixels. The "unfilter"
advertising was the tell. **Bonus: the quality-vs-unfilter entanglement question is now moot.**

~~4. Krea2 depth ControlNet~~ — **✅ LIVE-VERIFIED 2026-07-10, works (§3).**

Bench order, cheapest-decisive first:

1. **Qwen + ControlNet → Krea2 handoff (§5b).** The pipeline the tutorial actually showed.
   Qwen has every control type + a real side-network ControlNet; Krea2 has 2K + quality.
   Structure survives the handoff (locality does not — that is why the *editor* failed).
   **This is the promising one.**
2. **Ship Qwen-Image as its own `edit` operation, WITH masking.** Masked edit avoids the zoom
   artifact and needs no handoff. Pair with an existing upscaler for quality.
3. **Wire Krea2 depth control into the app.** Proven live. Build a control-type selector rather
   than hardcoding depth (the loader is control-type agnostic; only the weights are depth-only).
   Lower priority than (1), since Qwen already covers every control type.
4. **`TextEncodeKrea2` vs core `TextEncodeQwenImageEditPlus`** for Krea2 *reference* (not edit)
   conditioning, if a style/subject-reference op is ever wanted. A/B `KREA2_SYSTEM_DEFAULT`
   (describe, in-distribution) vs `KREA2_INSTRUCT_SYSTEM` (edit, experimental).

**Product shape that fell out of the failed test:** Qwen-Image = editor (targeted, reads source
pixels) **and** control host (real ControlNet, every preprocessor). Krea2 = reference-conditioned
generation (recomposes, no pixel memory) **and** quality/2K finisher. These are two different
operations, not two implementations of one. A Krea2 "image edit" op would really be a
*reference/style* op — name it accordingly, or users will expect locality it cannot deliver.

Standing conclusions:

- **Core `TextEncodeQwenImageEditPlus` is the wrong default for Krea2** — wrong template,
  384px refs, inert VAE. Zero deps, but worst adherence. Baseline only.
- **Rebalance's quality may be inseparable from its unfilter path** (both are the same
  `guidance(..., -0.5)`). Raise with the user before adopting; prefer `TextEncodeKrea2` if it
  suffices.
- **Krea2 has no real ControlNet** — one depth control-LoRA, no pose/canny/lineart/normal
  weights anywhere. Preprocessors exist and are irrelevant without a trained adapter.
- **Plain latent img2img is free** (zero deps) and remains the fallback i2i path.
- **NSFW "Coyote" finetune: not shipped.** Nothing to wire. Re-check.
