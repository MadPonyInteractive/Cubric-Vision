# Wan 2.2 Video — Resolution Tiers Reference

> Authoring/tuning research for the Wan 2.2 workflows. The app consumes only the
> *result* (`WAN_RATIOS` + `WAN_5B_RATIOS` in `js/utils/ratios.js`); the *why*
> lives here. Sibling of [ltx-2.3-tiers.md](ltx-2.3-tiers.md).

## The size rule — /16 (both variants), no half-clean constraint

Wan 2.2's VAE is **16× spatial**, so W and H must be **divisible by 16**. This is
the whole rule — Wan's two-sampler multi-stage is **NOT** LTX's ÷2/×2 pipeline:
both samplers run at the **same target resolution** (sampler-1 = motion + initial
detail, sampler-2 = refine). There is no halving, so no /64 "half-clean" constraint
like LTX. Just /16.

- **14B** (T2V/I2V-A14B, Wan2.1-VAE 4×16×16): **/16**. ComfyUI `nodes_wan.py` encodes
  the latent as `height // 16, width // 16`; INPUT_TYPES `step=16`.
- **5B** (TI2V-5B, Wan2.2-VAE 4×32×32): hard floor is still **/16** (same `// 16`
  latent formula), but the UI widget uses `step=32` to avoid odd latents after the
  transformer's 2× patchify. **We ship 5B at /32** to honor that. Official native res
  is **1280×704**, NOT 1280×720 — 720 is off the /32 grid (720/32 = 22.5).

**Frame count:** `4n+1` (both variants). 14B default 81 @ 16fps ≈ 5s; 5B default
121 @ 24fps ≈ 5s.

## No native 2K/4K

Neither 14B nor 5B generates native 2K/4K — the ceiling for both is **720p-class**.
Higher resolutions need an external upscale pass. (Native 4K is a **Wan 2.5** claim —
a separate, newer model, not what we ship.) So the Wan tables stop at 720p-native,
with 14B's `very_high` (1920×1088) sitting deliberately **above** native as a
detail/upscale-band tier (works, but extrapolated — expect artifacts).

## Official native resolutions

| Variant | 480p | 720p | source |
|---|---|---|---|
| 14B T2V/I2V | 832×480 (from Wan 2.1, inherited) | **1280×720** | Wan-Video/Wan2.2 GitHub README (`--size 1280*720`), HF model cards |
| 5B TI2V | — (no native 480p) | **1280×704** / 704×1280 | Wan2.2 README (`--size 1280*704`, `704*1280`) |

Portrait/square/mid-tier values (960×960, 624×624, 1088×832, 704×544) come from the
community `WanResolutionSelector` node (built against actual model behaviour) — they
work but are not explicitly in the Wan 2.2 docs.

## Shipped tiers

### 14B — `WAN_RATIOS` (/16, 5 tiers)

| tier | 16:9 | 9:16 | 1:1 | note |
|---|---|---|---|---|
| very_low | 512×288 | 288×512 | 384×384 | raised from old 320×176 (unusably small) |
| low | 640×368 | 368×640 | 512×512 | 480p-lite draft |
| medium | 832×480 | 480×832 | 624×624 | **official 480p HQ** |
| high | 1280×720 | 720×1280 | 960×960 | **official 720p HQ** |
| very_high | 1920×1088 | 1088×1920 | 1088×1088 | **above native 720p** — detail/upscale band |

### 5B — `WAN_5B_RATIOS` (/32, 3 tiers, 720p-only)

| tier | 16:9 | 9:16 | 1:1 | note |
|---|---|---|---|---|
| low | 960×544 | 544×960 | 704×704 | 720p-lite draft |
| medium | 1152×640 | 640×1152 | 832×832 | mid |
| high | 1280×704 | 704×1280 | 960×960 | **official 5B 720p** |

5B has no `very_low`/`very_high` — 720p is its entire band, so three tiers spread it
into draft/mid/final. `getModelRatios('wan5b', …)` routes it; a tier request outside
the three falls back to `medium`. **Not yet wired to a shipped model card** — add a
`wan5b` `model.type` (or map the 5B card) when the 5B workflow lands.

## 5B speed-up — the Turbo distill (4-step)

**No SmoothMix exists for 5B** (confirmed by user search) — so a matched fine-tune
isn't an option. The only real 5B speed lever is the **Wan2.2-TI2V-5B-Turbo** step
distill (Self-Forcing, 4-step). Base 5B at full steps is unusably slow: **618 s for a
5-second 1280×704 clip** on the official ComfyUI workflow (user-measured) — and 5B
quality is weak regardless (it's a 5B model).

**Distill artifacts (Kijai `WanVideo_comfy`), both model-only LoRAs:**
- `LoRAs/Wan22-Turbo/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors` — **332 MB** (rank-64)
- `LoRAs/Wan22-Turbo/Wan22_TI2V_5B_Turbo_lora_rank_adaptive_quantile_0.15_fp16.safetensors` — **198 MB** (adaptive, smaller)
- Full checkpoint (~10 GB): [quanhaol/Wan2.2-TI2V-5B-Turbo](https://huggingface.co/quanhaol/Wan2.2-TI2V-5B-Turbo); GGUF: [hum-ma/Wan2.2-TI2V-5B-Turbo-GGUF](https://huggingface.co/hum-ma/Wan2.2-TI2V-5B-Turbo-GGUF) (Q2–Q8, 1.86–5.4 GB)

**Loader = model-only, no clip.** It's a step distill on the diffusion transformer;
the umt5 text encoder is untouched. Load via `LoraLoaderModelOnly` / Kijai model
branch, `strength_model` only — same as our existing `wan-22` card (`loraStrengths:
['model']`, strength_clip inert).

**Settings (research + user-tuned live):**
- **LoRA strength `0.8`** — user landed here; `1.0` over-morphs.
- **4 steps, CFG 1** — distilled → CFG off (negatives dead without a NAG-style node,
  same as LTX distilled). **Do NOT raise steps for t2v:** user tried 15 steps → it
  **destroys the image (blown saturation)**; more steps fights the 4-step distill.
- **Sampler `SA_Solver` + scheduler `simple` @ 4 steps** — user's landing spot.
  (Card also lists Euler / Uni_PC + normal/beta as valid.)
- **0.8 latent multiplier** helps oversaturation (hum-ma card).

**Op split — the turbo is i2v-tuned:**
- **i2v @ 4-step turbo = good** (user-confirmed; trained mostly on i2v).
- **t2v @ turbo = still terrible** (user comparing distilled vs non-distilled t2v —
  both weak; it's the 5B model, not the distill). 4-step is the least-bad t2v setting.

**New bottleneck: VAE decode.** With sampling cut to 4 steps, **most of the gen time
is now the VAE decode**, not the diffusion. Speed work on 5B should target the decode
(tiled/temporal decode, fp8/GGUF VAE, or a faster VAE path), not more step cuts.
(Plain `VAE Decode` vs `VAE Decode (Tiled)` = identical output; tiled only trades
speed for VRAM, no quality cost — keep tiled.)

## Shipping decision (MPI-172): SINGLE-STAGE

**5B ships single-stage.** A two-stage hi-res-fix (generate → latent-upscale →
low-denoise refine) was attempted live and abandoned — the grid/mesh artifact
persisted through every fix (bislerp latent method, /16-snapped target, plain vs
tiled decode, noise on/off). Root cause is the **stock Wan VAE decoder's own speckle
grid** on upscaled latents, not the upscale method. The model is weak regardless
(a 5B), so the hi-res-fix isn't worth the extra VAE round-trip. Shipped as the fast,
low-tier draft option; **i2v is the usable mode, t2v is weak.** A "v2" may revisit
the hi-res-fix later with the `spacepxl/Wan2.1-VAE-upscale2x` VAE (trained to kill
exactly this speckle) — untried.

### Hi-res-fix reference (for a future v2 / other models)

The grid on a latent hi-res-fix has three stacked causes, all resolution-math:
1. `nearest-exact` latent upscale = hard block grid → use **`bislerp`** (smoothest
   latent method; no lanczos exists for latents).
2. Non-/16 target → latent cells misalign the Wan /16 patch grid → mesh. LTX/Wan
   VAE = /8 spatial, but the **denoiser needs /16** (the binding rule for a
   re-sample pass).
3. Non-integer scale ratio → fractional pixel boundaries → periodic checkerboard
   (Odena uneven-overlap).

**The fix is to snap the TARGET, not chase a magic ratio:** any scale works if
`target = round(src × scale / 16) × 16` per dimension. Use `ImageScale` (explicit
W×H), NOT `ImageScaleBy` (ratio). For same-VAE single-model stages you can stay
latent→latent (one decode); cross-VAE (14B→5B) forces a decode→pixel-lanczos→encode
round-trip. Higher stage-2 denoise merely *hides* the grid by repainting — fix the
upscale, keep denoise low (0.2).

**Snapper node:** `MpiMath` has NO `round` (it injects only `math.*`, builtins
blocked) and needs `*` not `×`. Use `floor(a * b / 16 + 0.5) * 16` (a=dim,
b=scale). Same pattern for LTX with `/32` instead of `/16`.

## Sources

- [Wan-Video/Wan2.2 GitHub](https://github.com/Wan-Video/Wan2.2)
- [Wan-AI/Wan2.2-T2V-A14B (HF)](https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B)
- [Wan-AI/Wan2.2-TI2V-5B (HF)](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B)
- [quanhaol/Wan2.2-TI2V-5B-Turbo (HF)](https://huggingface.co/quanhaol/Wan2.2-TI2V-5B-Turbo)
- [hum-ma/Wan2.2-TI2V-5B-Turbo-GGUF (HF)](https://huggingface.co/hum-ma/Wan2.2-TI2V-5B-Turbo-GGUF)
- [Kijai/WanVideo_comfy — LoRAs/Wan22-Turbo (HF)](https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LoRAs/Wan22-Turbo)
- [ComfyUI `nodes_wan.py`](https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/comfy_extras/nodes_wan.py)
- [Wan22ImageToVideoLatent node docs](https://docs.comfy.org/built-in-nodes/Wan22ImageToVideoLatent)
