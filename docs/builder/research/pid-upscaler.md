# PiD (Pixel Diffusion Decoder) — upscaler research

**Status: models downloaded, live testing NOT yet done (2026-07-03).** Facts below are
source-verified (ComfyUI PR #14103 `nodes_pid.py`, nv-tlabs/PiD, arXiv 2605.23902). Timing
+ quality-per-degrade_sigma go in § Live notes as we test. ComfyUI target: **0.27** (PiD
landed ~0.23, native — no custom node for the Flux1 path).

## What PiD is

NVIDIA's **PixelDiT**-based decoder that replaces the VAE decode step. Instead of a
deterministic 1-pass VAE decode, it runs a **4-step DMD2-distilled diffusion loop directly
in RGB pixel space**, unifying decode + 4× upscale. Generative → it *synthesizes* new
high-frequency detail (not faithful interpolation like ESRGAN). NVIDIA benchmarks it up to
**5.9× faster than SeedVR2** (which we're dropping — too slow).

Mental model: **VAE = deterministic 1-pass decode. PiD = generative 4-step pixel-space
decode+upscale.** The `ae.safetensors` VAE decode is NEVER used in the PiD path — PiD reads
the RAW latent (pre-decode) as *conditioning*, and denoises a blank pixel canvas
(`EmptyChromaRadianceLatentImage`, 3-ch, at output resolution) steered by that latent + a
text prompt. It reuses Chroma Radiance's pixel-space plumbing (both are VAE-less pixel
models) but is a separate NVIDIA architecture, not built on Chroma.

## Compatibility = VAE latent space, NOT model name

NVIDIA: *"A PiD decoder is tied to a latent space, not to a single generative model."* Each
checkpoint is hard-locked to one VAE's latent statistics. Any model sharing that VAE reuses
the checkpoint.

| latent_format | VAE ch | Models | PiD checkpoint |
|---|---|---|---|
| `flux` | 16 | Flux.1 dev/schnell, **Z-Image / Z-Image-Turbo**, Chroma, all Flux.1 finetunes | pid_flux1_* |
| `flux` (auto) | 128 | Flux.2 dev/klein | pid_flux2_* (auto-detected by 128ch, no separate UI option) |
| `sd3` | 16 | SD3 medium, SD3.5 | pid_sd3_* |
| `sdxl` | 4 | SDXL + finetunes | pid_sdxl_* (2kto4k only) |
| `qwenimage` | 16 | Qwen-Image family | pid_qwenimage_* (2kto4k only) |

**Gaps: SD1.5 (no ckpt), Wan video (NO — 3D causal VAE, different stats), HiDream-O1
(pixel-native, no VAE).** → PiD is **image-only** for us. Video would need per-frame 4-step
pixel diffusion at 4K = far too slow, and no Wan-VAE checkpoint exists anyway.

## Our path: Z-Image-Turbo → pid_flux1

Z-Image-Turbo uses the Flux 16-ch VAE → `latent_format=flux`, `pid_flux1` checkpoints.
Downloaded to `G:\CubricModels` (2026-07-03, byte-verified):

| File | Size | Folder |
|---|---|---|
| `pid_flux1_512_to_2048_4step_bf16.safetensors` | 2.54 GB | `diffusion_models/` |
| `pid_flux1_1024_to_4096_4step_bf16.safetensors` | 2.54 GB | `diffusion_models/` |
| `gemma_2_2b_it_elm_bf16.safetensors` | 4.87 GB | `text_encoders/` |

Already on disk (shared, not re-downloaded): `ae.safetensors` (Flux VAE), Z-Image checkpoint.
NOTE: PiD needs `gemma_2_2b_it_elm` specifically (fp8_scaled variant = 2.44 GB exists) — NOT
the `gemma_3_12B` already in the folder. flux2/sd3/sdxl/qwen checkpoints skipped (not our path).

## Resolution: tier = longer-edge band, NOT an exact lock

The "512"/"1024" in the name is a **training-tier label**, not a spatial constraint. The
official ComfyUI node checks **channel count only** (16 vs 128) — spatial mismatch is
silently resampled (`F.interpolate`), no error. Rules:

- **Pick tier by longer edge:** ~512–768 → 512 tier; ~1024–1344 → 1024 tier.
- **Keep all dims ÷16** (patch_size=16; non-multiples get cropped/rounded → edge artifacts).
- **Output = 4× input, both axes** (4× is the trained regime; deviate → hallucination).
- Non-square supported (trained 1:1, 4:3, 3:4, 16:9, 9:16); off-list ratios run but may seam.
- Off-tier feed = silent quality loss, not a crash.

**App's FLUX_RATIOS all fit the 1024 tier** (longer edge 1088–1344, all ÷16 clean → ×4
outputs also ÷16). 1024 = daily driver. **512 tier = fast high-res-fix / mid-res detail pass**
on smaller gens (512→2048), cheaper than 1024→4096. Arbitrary imported images: snap to ÷16
before encode. See `js/utils/ratios.js` `FLUX_RATIOS`.

## Knobs: only ONE is a tuning knob

DMD2+LCM distillation bakes the schedule into the weights (same principle as our SDXL
distilled models). **Everything except degrade_sigma is a hard lock:**

| Knob | Value | Rule |
|---|---|---|
| `BasicScheduler.denoise` | **1.0 — LOCK** | Lowering truncates the fixed 4-step schedule `{999,749,499,249}` → student gets an untrained noise level → corrupt output. It is NOT an img2img strength slider here (canvas is blank — nothing to preserve). |
| `BasicScheduler.steps` | **4 — LOCK** | Distilled to exactly 4; more = trajectory distortion, not quality. |
| `SamplerCustom.cfg` | **1.0 — LOCK** | DMD2 guidance baked in; raising over-amplifies (like CFG on any distilled ckpt). |
| sampler / scheduler | **lcm / simple — LOCK** | Consistency-distill requirement. |
| **`PiDConditioning.degrade_sigma`** | **0.0–0.5 — THE strength slider** | `(1-σ)·latent + σ·noise`. **Higher = more change/detail-invention, lower = more faithful.** This is the PiD equivalent of img2img denoise. |

**No speedup LoRA needed or exists** — PiD IS the distilled/fast version. Bolting a
Lightning/LCM LoRA = double-distilling = worse.

**degrade_sigma guide:** 0.0 = faithful (high-res-fix mode) · 0.2 = subtle enhance (NVIDIA
default) · 0.4 = noticeable new detail (Merserk node default) · 0.8+ = aggressive, departs
from source (mostly noise past 0.5). App: expose degrade_sigma as strength slider, default
~0.2–0.4.

## Two workflow shapes (user builds from official ComfyUI one)

1. **Gen → upscale** (official template): KSampler latent → PiD Conditioning. No encode.
2. **Image → upscale** (universal): `Load Image → VAE Encode (ae.safetensors) → latent →
   PiD Conditioning`. degrade_sigma=0.0 for clean input.

**PiD Conditioning is ALWAYS in the path** — no bypass. It's the input route (feeds
`lq_latent` + `latent_format` + `degrade_sigma`). So any existing-image upscale MUST encode
first to get a latent. The prompt/CLIP (`pixeldit` type = Gemma-2-2B with a mandatory hidden
"chi-prompt" prepend) is generative guidance for WHAT detail to invent — feed the original
gen prompt; empty works but degrades detail.

**Wiring:** Load Diffusion Model → pick pid_flux1 tier · Load CLIP → gemma_2_2b_it_elm,
type=`pixeldit` · EmptyChromaRadianceLatentImage W×H = output (2048² or 4096²) · PiD
Conditioning latent_format=`flux`, degrade_sigma=strength.

## Caveat

PiD trained on CLEAN synthetic diffusion outputs. Real photos w/ JPEG artifacts / sensor
noise → suboptimal (NVIDIA: *"an upscaling VAE for diffusion workflows rather than a
general-purpose image enlarger"*). Best on our own gen outputs.

## Live notes (test data — fill as we go)

Test workflow: **`G:\ComfyUi\ComfyUI\user\default\workflows\NVIDIA_PID_template.json`**
(local ComfyUI live-test folder — the primary bench). Built from the official ComfyUI PiD
template. Iterate here FIRST; the in-app engine ComfyUI is the second stage, only after a
workflow passes on this local folder. First real target = **SDXL** path (pid_sdxl_1024_to_4096,
latent_format=sdxl, sdxl_vae encode).

**2026-07-03 — first live run (SDXL, image→upscale w/ encode):**
- ✅ WORKS. **Results fantastic** (user verdict).
- ⏱️ **~1 minute** end-to-end WITH the VAE-encode step (existing image → sdxl_vae encode →
  pid_sdxl 1024→4096). GPU: local (4060 Ti — confirm). This is the image→upscale path.
- pixel_space CONFIRMED decode-only live: cannot be used on VAE Encode (produces raw 3-ch
  tensor → "Input latent has 3 channels, expects 16/4" ValueError). Encode MUST use a real
  matched VAE (sdxl_vae for SDXL). pixel_space belongs only on the trailing VAEDecode.
- **Intensity/strength slider = `degrade_sigma` (NOT BasicScheduler.denoise).** denoise stays
  1.0 always (truncating the 4-step DMD2 schedule breaks output). Re-confirmed against source.

**2026-07-03 — direct latent vs encode-roundtrip (SDXL, SAME source):**
- ⏱️ Direct (SDXL KSampler latent → PiD, no encode) = **56s** vs encode-roundtrip = **59s**.
  Only ~3s saved → the VAE encode is cheap; the 4-step 4096² pixel diffusion dominates.
- ⚠️ **SURPRISE: direct latent gave MEDIOCRE result vs the encode-roundtrip (which was
  fantastic).** Counterintuitive — the extra encode step IMPROVES quality, not just speed.
- **Working hypothesis:** PiD was trained on CLEAN VAE-encoded latents. A decode→re-encode
  roundtrip normalizes the latent onto the VAE's clean distribution — exactly PiD's training
  domain. The RAW SDXL sampler output latent carries residual sampler-space quirks that sit
  slightly OFF that distribution → worse PiD output. So for SDXL, **prefer the encode path
  even though direct is available and marginally faster.** (Contradicts the a-priori "direct
  is the fast in-app path" assumption — the 3s saving isn't worth the quality drop.)
- ❗ CONFOUND CHECK NEEDED before locking: confirm both runs used identical degrade_sigma +
  same seed/source. If those differed, the quality gap may be the confound, not encode-vs-direct.
  Re-run controlled (same seed, same degrade_sigma, only toggle encode) to confirm.

**2026-07-03 — SDXL-PiD vs Flux-PiD on the SAME source (SDXL-gen 1024² room image):**
- Both paths upscale 1024²→4096². Source was SDXL-generated; Flux path re-encodes those
  pixels into Flux 16-ch space (cross-VAE roundtrip) — valid, PiD only needs latent↔ckpt match.
- **SDXL PiD (sdxl_vae, 4-ch):** SHARPER, more invented detail (readable frame art, crisp
  textures) — but COLOR DRIFTS (wall more magenta/saturated, punchier than original).
- **Flux PiD (ae.safetensors, 16-ch):** COLOR much closer to original (muted dusty-rose
  preserved), more natural, slightly softer / less "processed."
- **Mechanism (confirms the VAE-capacity theory):** 4-ch SDXL latent carries less source
  info → PiD invents more → sharper but drifts. 16-ch Flux latent carries 4× the channels →
  more original color/tone survives the roundtrip → PiD invents less → faithful + natural.
  The cross-VAE test proves it's VAE CAPACITY (4 vs 16 ch), not native-model match, driving
  fidelity — Flux won on color even though the image was born in SDXL.
- **App lever:** SDXL path = punchy/max-sharpness; Flux path = faithful/natural. Flux (16-ch)
  is the better *universal* upscaler (color fidelity > raw sharpness for most users; can
  sharpen after). Consider defaulting the app's upscale to the Flux-VAE roundtrip regardless
  of gen model. (The earlier degrade_sigma=0.0 desaturation the user liked was the SDXL path.)

**2026-07-03 — Load CLIP `type` = `pixeldit` ALWAYS (source + live-proven):**
- `type` selects the TEXT ENCODER, fully independent of checkpoint/VAE/latent_format. Only
  `pixeldit` loads Gemma-2-2B + the mandatory hidden chi-prompt PiD was trained with. The
  dropdown lists every ComfyUI CLIP type generically — all others are WRONG for PiD.
- **LIVE-PROVEN:** setting `type=stable_diffusion` (SDXL path) → **very bad output** (wrong
  encoder, no chi-prompt → garbage guidance). Reverted to `pixeldit` = correct.
- Shared across ALL 4 PiD paths: `type=pixeldit` + `gemma_2_2b_it_elm` NEVER change. Only
  checkpoint + VAE + latent_format change per path. (Source: PR #14103 supported_models.py —
  single `PiD` class, one clip_target, no per-backbone subclass.)
- The earlier SDXL "direct-latent mediocre" was NOT this — that was raw-vs-encoded latent
  quality, a separate axis. CLIP type has zero interaction with the latent path.

**2026-07-03 — Qwen VAE TRAP (wrong file → shape mismatch):**
- First qwen VAE tried = `Remudl/qwen-image-vae` safetensors (community convert) → ComfyUI
  VAELoader `RuntimeError: size mismatch ... conv_in [96,3,3,3] from ckpt vs [128,3,3,3]`.
  That convert is a DIFFERENT architecture — not what pid_qwenimage was trained against.
- 2nd try = NVIDIA `.pth` (`QwenImage_VAE_2d.pth`, 498 MB) → ALSO fails: raw PyTorch pickle,
  ComfyUI's VAELoader can't parse it (needs `vae.`-prefixed safetensors state_dict).
- **CORRECT (3rd) = `qwen_image_vae.safetensors`** (Comfy-Org/Qwen-Image_ComfyUI
  `split_files/vae/`, 254 MB, 128-conv). ComfyUI-official, the qwen tutorial names it. In
  `vae/`.
- **Lesson: PiD VAEs must be ComfyUI-REPACKAGED safetensors** (correct key prefix + conv
  width) — NOT community converts (wrong arch) and NOT raw nvidia `.pth` (unparseable). sd3
  vae worked from nvidia/PiD only because it was a clean diffusers safetensors (renamed);
  qwen's nvidia file was a pickle → needed the Comfy-Org repackage instead.
- ⚠️ **USER NOTE:** the wrong 96-conv qwen VAE is the SAME one the user runs on **Qwen-Image-
  EDIT** workflows (works there). So Qwen-Image-Edit VAE ≠ base-Qwen-Image VAE (128-conv) that
  pid_qwenimage needs. If the app wires Qwen, the PiD-qwen path needs `qwen_image_vae`
  (base 128-conv) specifically, NOT the Edit VAE — confirm which Qwen model the app runs.

**2026-07-03 — ZOOM comparison revises the "Flux universal" call (SDXL/SD3/Flux/Qwen,
same source, degrade_sigma=0.0, zoomed on a tiny embedded face inside a framed picture):**
- At 4× on FINE EMBEDDED DETAIL (a small face inside a frame — near the source latent's
  resolution floor), the paths diverge HARD:
  - **SDXL — WINS on fine detail.** The tiny portrait reconstructs as coherent, real-looking
    art (recognizable face, clean). Invents aggressively → fills degraded source with
    plausible detail.
  - **SD3 — sharp at full-frame (≈SDXL) BUT painterly/charcoal-smeared on the tiny embedded
    face** (more abstracted than SDXL up close). Two-faced: good big-picture sharpness, weaker
    embedded-detail coherence.
  - **Flux — SMEARS fine faces** (melted/muddy portrait) despite winning overall color earlier.
  - **Qwen — HAPPY MEDIUM (with correct qwen_image_vae).** Fine embedded face reconstructs
    COHERENT + clean (not the painterly mess — that was mislabeled SD3). MOST NATURAL color
    tone of the four. Sits between SDXL (punchy/invented) and Flux (faithful/soft). Strong
    all-rounder pick.
- **Revised conclusion:** NOT "Flux = universal best." It's CONTENT-DEPENDENT:
  - Portraits / fine faces / embedded detail → **SDXL (or SD3)** — invents coherent detail.
  - Landscapes / color-critical / smooth content → **Flux** — faithful color, natural.
  - Qwen → painterly niche.
- **Why:** tiny embedded face is below the source latent's real detail floor. SDXL PiD
  invents → coherent. Flux/Qwen stay faithful to the mushy source → upscale the mush → smear.
  Here inventing (SDXL) BEATS faithfulness (Flux) because source detail was too degraded to keep.
- **This is the case FOR the user-selectable dropdown** — genuinely different tools, no single
  default. (Caveat: zoom on the HARDEST region; on normal-scale content the gap likely shrinks.
  Try Flux at degrade_sigma 0.2–0.4 — may invent enough to fix smear while keeping color.)

## Product direction (2026-07-03, user)

PiD is a **detail-ADDING / generative** upscaler — it changes the image (invents detail,
shifts color). Fundamentally different from the app's CURRENT "universal upscale" which
upscales WITHOUT changing anything (feels like a resize — and the app already HAS a resize
tool in the history workspace). So PiD is NOT a drop-in for the existing upscale; it's a new
capability that adds real value the current path doesn't.

**DECIDED (2026-07-03): PiD ships as MODEL(s) in the registry, driven from the PROMPT BOX —
NOT as an upscaler tool.** Reasoning that settled it: PiD REQUIRES a prompt (semantic detail
guidance). The upscaler tool panel has no prompt box → PiD can't live there. It IS a prompt-
driven model. This dissolves the install-size worry: PiD models install ON-DEMAND via the
models page (like every other model), NOT bundled with the ~5 GB engine. Engine stays lean;
user downloads only the path(s) they want.

Consequences:
- **Ship max-precision bf16 Gemma** (4.87 GB). Since it's an opt-in model download, not a
  bundled cost, no need for fp8. User REJECTED fp8 Gemma — the CLIP encodes the prompt that
  steers latent detail synthesis; precision matters. Keep bf16.
- **The current image-upscale TOOL is a placeholder** (non-generative, ≈ a resize; app already
  has a resize tool). PiD does NOT replace it — PiD is a parallel prompt-box model path. Video
  upscale stays placeholder too → a future VIDEO-specific upscaler is a separate later effort
  (PiD is image-only: no Wan-VAE checkpoint + per-frame 4K pixel diffusion too slow).
- **UI = existing prompt box + model dropdown + the existing denoise slider.** The model
  dropdown already unlocks installed models (same as gen). Reuse-prompt UX = pick a history
  image → reuse its original prompt → select a PiD model → upscale with the right guidance.
- ⚠️ **denoise slider → maps to `degrade_sigma`, NOT to BasicScheduler.denoise.** The app's
  0–1 denoise control drives PiD Conditioning `degrade_sigma`; the workflow's BasicScheduler
  `denoise` is HARDCODED 1.0 (lowering it breaks the 4-step DMD2 schedule). Same 0–1 slider
  the user sees, different underlying field. The generator must route app-denoise→degrade_sigma
  and pin workflow-denoise=1.0.

**DECIDED — Registration shape = ONE model, internal path selector (Option B).** "NVIDIA PiD
is NVIDIA PiD" — one model entry offers all four paths (SDXL / Flux / SD3 / Qwen) via a
selector node INSIDE the workflow. That selector maps to the prompt-box model-control dropdown
(the app's model-variant dropdown drives which path the workflow uses). Keeps the models page
clean (one entry, not four). Installs all ~16 GB together — accepted (not worth splitting into
4 ops or 4 entries just to save install granularity). All paths 1024→4096; Load CLIP
(`pixeldit` + gemma bf16) NEVER changes — only checkpoint + VAE + latent_format switch per
path (the in-workflow selector handles that). Cross-VAE roundtrip fine → path = pure look
choice. Content guide: portraits/fine-detail→SDXL, color-critical/smooth→Flux, natural all-
rounder→Qwen, sharp alt→SD3. (Rejected Option A = 4 separate entries → pollutes models page.)

User is building the WORKFLOW TEMPLATE with the internal 4-path selector. Agent advances the
NON-workflow wiring per docs/add-model-playbook.md in the meantime.

**Install footprint (1024 tiers, measured 2026-07-03):** 4× checkpoints 2.72 GB ea = 10.9 GB
+ 4× VAEs (ae/sdxl 335M, sd3 168M, qwen 254M) = 1.09 GB + shared Gemma bf16 4.87 GB =
**~16.0 GiB / 17.2 GB all-in**. Per-path w/ shared Gemma: ~8.2 GB first, +~3 GB each after.

**Still open:**
- [ ] degrade_sigma sweep 0.0 / 0.2 / 0.4 / 0.8 — visual change vs faithfulness — TBD
- [ ] 512 vs 1024 tier (flux1 only; SDXL has no 512) quality diff — TBD
- [ ] Non-square (9:16 → seam check) — TBD
- [ ] Flux/Chroma path (pid_flux1 + ae.safetensors) once wired — TBD
- [ ] Pin exact NVIDIA_PID_template.json path + copy into repo when stable
