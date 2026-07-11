# Krea2 latent preview — why it's mediocre, and why we DON'T fix it

**Status (2026-07-10):** known, accepted, do NOT "fix" by installing the decoder.

## The symptom

Krea2's live latent preview (the mid-sampling thumbnail) looks noticeably worse than
SDXL/Flux/Chroma previews. It is interpretable but muddy.

## Root cause — a MISSING decoder, not a wrong one

Krea2 is Flux-lineage in the transformer only; its latent space is **Qwen-Image**, which
ComfyUI classifies as the **`Wan21` latent format** (`comfy/supported_models.py`,
`class Krea2(... latent_format = latent_formats.Wan21)`). `Wan21` requests the TAE decoder
named **`lighttaew2_1`** (`comfy/latent_formats.py`).

The preview chain:
1. The app forces `--preview-method taesd` globally (`routes/comfy.js`, `routes/engine.js`).
   This flag is CORRECT.
2. `get_previewer()` (`engine/.../ComfyUI/latent_preview.py`) looks for a file starting
   `lighttaew2_1` in `models/vae_approx/`.
3. **That file is not installed** (we ship only SD1.5/SDXL/SD3/Flux TAEs). So the TAESD
   branch is skipped and it falls back to **`Latent2RGB`** — a linear projection using
   `Wan21`'s `latent_rgb_factors` (calibrated on Wan **video**, not still images).
4. That linear fallback is the "mediocre" preview. Krea2 never grabs the Flux `taef1` —
   it is correctly identified as `Wan21`; the decoder name is right, the file is just absent.

## Why we do NOT install `lighttaew2_1`

The obvious fix — drop `lighttaew2_1.safetensors` (`lightx2v/Autoencoders` on HF, ~45MB)
into `vae_approx/` — is a **landmine**:

> **ComfyUI issue #13366 — "TAESD preview corrupts midsampling latent if lighttaew2_1 is
> present."** When the file is present AND TAESD preview is on (which we force globally),
> the previewer **corrupts the actual generation latent mid-sampling** — degraded OUTPUT,
> not just a bad preview ("fartclouds"). Triggers on the Qwen-Image / `Wan21` latent
> format — i.e. Krea2 exactly. **Unresolved** as of this writing (fix PR #13383 was open,
> unverified in our engine version).

So installing it trades a *harmless* mediocre preview for *corrupted generations*. The
current `Latent2RGB` fallback never touches the real latent — it is safe. We keep it.

## If you ever revisit

- Only reconsider once ComfyUI **#13366 is confirmed fixed** in our engine version (check
  PR #13383 merged + our bundled ComfyUI includes it). Then `lighttaew2_1` becomes safe to
  install and live-test. It is video-calibrated, so still-image preview quality is still
  unverified even then.
- No dedicated **Qwen-Image** (still-image) TAE exists upstream as of 2026-07.
- If installed as a tracked dep later: `vae_approx` asset → `engineAsset: true` in
  `dependencies.js`, installs with the engine on both engines.

Do NOT single-symptom "fix" this by adding the decoder. The bug is worse than the symptom.
