# Bernini-R on the bench — what is installed and how the node works

Read 2026-09-09 off the bench itself, not off the docs.

## Bench state

- ComfyUI **v0.34.2** (`169fcf35`, 2026-08-27). Native support present:
  `G:/ComfyUi/ComfyUI/comfy_extras/nodes_bernini.py`. **No custom node pack needed** —
  ignore `neuregex/ComfyUI-BerniniR`, that is for older installs.
- GPU: **RTX 4060 Ti, 16380 MiB**.

## Weights

Downloaded to `C:/AI/diffusion_models/` (the `comfyui_external:` block of
`G:/ComfyUi/ComfyUI/extra_model_paths.yaml`, so the bench sees it). C: chosen over
G: on the user's instruction and because G: had 15 GB free against C:'s 109 GB.

| file | size on disk | status |
|---|---|---|
| `wan2.2_bernini_r_high_noise_fp8_scaled.safetensors` | 15,574,833,216 B | **verified** (6.1 min) |
| `wan2.2_bernini_r_low_noise_fp8_scaled.safetensors` | 15,574,833,216 B | **verified** (5.7 min) |
| `wan2.1_bernini_1.3B_fp16.safetensors` | 2.84 GB | pulled, then **deleted on the user's instruction** |

**The 1.3B is not being benched.** The user's call, on grounds that carry more weight than
the sizing arithmetic: they already run Wan 2.2 A14B comfortably on the 4060 Ti because the
MoE loads one 15.57 GB expert at a time, and LTX and H3 are heavier than either. The earlier
worry in `licence-and-weights.md` about 31 GB against 16 GB of VRAM was reasoning from disk
totals rather than from residency, and it was wrong.

Repo `Comfy-Org/Bernini-R`, `apache-2.0` confirmed via the HF API. Download ran at
~43 MB/s, so the 14B pair is a ~12 minute job, not a blocker.
Script: `scratchpad/dl_bernini.py`, `big` arg adds the pair.

Already present, nothing to fetch:

- `C:/AI/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors` (6.74 GB) — exactly what the
  tutorial names.
- `C:/AI/loras/Wan/lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors` —
  exactly what the tutorial names.
- `C:/AI/vae/wan_2.1_vae.safetensors` — Wan2.2-A14B uses the Wan 2.1 VAE (only Wan2.2-5B has
  its own). `Wan2_1_VAE_bf16.safetensors` was also fetched from `Kijai/WanVideo_comfy`
  (253,806,278 B) because the template's dropdown names that exact filename — but per the
  user these are "copies of copies", the same VAE, and they have already A/B'd the Kijai
  bf16 against the one on disk with no visible difference. Either populates the slot.

## The node — `BerniniConditioning`, and there is only one

Category `model/conditioning/bernini`. Inputs: positive, negative, vae, width (832),
height (480), length (81), batch_size, and three optional image streams —
`source_video`, `reference_video`, `reference_images` (autogrow, up to 8) — plus
`ref_max_size` (848).

**The task is inferred from which inputs are wired**, there is no task dropdown:

| wired | task |
|---|---|
| nothing | t2v |
| `source_video` | **v2v** — restyle / edit |
| `source_video` + `reference_images` | **rv2v** — reference-guided editing |
| `reference_images` only | r2v |
| `source_video` + `reference_video` | ads2v — insert content |

### There is NO mask input

Not "undocumented" — the node has no mask at all. The edit is driven entirely by the text
prompt against VAE-encoded context latents. This partly answers plan Phase 4 before we get
there: masking cannot be layered on top through this node.

**The risk inverts relative to H3.** H3's failure was the plate winning — the known region
overpowering the prompt. Here nothing pins the unedited region, so the failure mode to watch
for is the opposite: the whole frame moving, face included.

### How it works underneath

`BerniniConditioning` VAE-encodes each stream and attaches them as `context_latents` on both
positive and negative conditioning. The Wan model then consumes them
(`comfy/ldm/wan/model.py:585-707`): each stream gets its own **`source_id` (1, 2, 3...)
composed as an extra rotation into the spatial RoPE**, distinguishing the context streams
from the target (id 0).

This lives in the **generic Wan model class**. There is no Bernini class and no
`supported_models.py` entry — so the mechanism is architecture-level and the Wan2.1-based
1.3B is expected to work, despite the node docstring naming Wan2.2-A14B as the pairing.
**Expected, not yet proven — the first bench run tests this as much as it tests quality.**

## Bench parameters for the hair case

- `length` has **step 4**, and the latent is `((length - 1) // 4) + 1`. So use **21 or 25**
  frames, not 22. The ~1s window is unchanged as the design point.
- Defaults 832x480 are close to the H3 bench canvas (544) and to Capybara's recommended
  480p. Start there.
- `source_video` is `common_upscale(..., "center")`-cropped to width/height — check framing
  before reading anything into a bad result.

## The shipped template and its `task_type` — read off the blueprint

The user's workflow is ComfyUI's own template, `video_bernini_r_video_editing.json`, whose
"Video Edit (Bernini-R)" node is a **subgraph blueprint**:
`G:/ComfyUi/ComfyUI/blueprints/Video Edit (Bernini-R).json`. Inside it: `UNETLoader` x2,
`LoraLoaderModelOnly` (lightx2v), `CLIPLoader`, `VAELoader`, `BerniniConditioning`,
`BasicScheduler` -> `SplitSigmas` -> `SamplerCustom` (the high/low-noise MoE split, which is
why the two 15.57 GB experts load one at a time rather than both resident).

**`task_type` is a system-prompt selector, not wiring.** A `CustomCombo` index feeds a
`RegexExtract` (`^(?:[^\n]*\n){index}([^\n]*)`) over a list of system prompts, and
`StringConcatenate` prepends the chosen line to the user prompt:

| `task_type` | system prompt prepended |
|---|---|
| Default | "You are a helpful assistant." |
| Text to Image / Text to Video / Image Editing / Subject to Image / Image to Video | "...specialized in <that task>." |
| Video Editing | "...specialized in video editing." |
| Video Editing (Content Propagation) | "...specialized in video editing on content propagation." — **the template default** |
| Video Editing with Reference | "...specialized in video editing with reference." |
| Ads / Content Insertion | "...specialized in ads insertion." |
| Video Editing (Action / Position) | "You are a helpful assistant for editing. You may need to adjust the subject's action or position." |
| **Video Editing (Style / Motion)** | "You are a helpful assistant for editing. You might need to adjust the video's **style, lighting, colors, textures**, and the subject's pose or action." |

**For the hair recolour, use `Video Editing (Style / Motion)`** — *colors* is named in its
system prompt. `Content Propagation` is the default because the shipped template demos a
background replacement. Plain `Video Editing` is the obvious A/B.

The template's default prompt is a **localised edit** and worth reading as the house style
for how to phrase one — it states what changes and then pins everything that must not:

> "Replace the gray studio backdrop with a daytime urban street: brick buildings, shop
> windows, sidewalk, and soft overcast light. Keep the model's outfit, accessories, body
> pose, motion, and full-body framing unchanged. Only the environment behind the subject
> should change."

Given there is no mask, that "keep X unchanged / only Y should change" construction is the
only thing constraining the edit region. The hair prompt should be built the same way.

## The third-party patch is inert

`G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-BFSNodes/bernini_patches.py` (vendored from
`ComfyUI-RH-Bernini`, GPL-3.0) patches `WanModel` for installs whose core lacks Bernini. Its
`_core_has_bernini()` gate checks for `context_latents` in `WanModel.forward_orig`, which
v0.34.2 has, so it logs "core already includes Bernini support; skipping patches" and does
nothing. **Not a confound in any result** — but if the bench is ever downgraded, it stops
being inert.

## Sizing note

14B fp8 is 15.57 GB **per expert** and Wan 2.2 is MoE, so both high- and low-noise are
needed: ~31 GB on disk and heavy offload against 16 GB of VRAM. The 1.3B is reported close
to the 14B on *local editing* specifically, lagging on complex human generation — which is
why it is the right first run and possibly not a compromise at all.
