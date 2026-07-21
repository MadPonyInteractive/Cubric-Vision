# Distilled-LoRA Strength Law (LTX-2.3)

> Locked finding, 2026-06-23. Distilled from the MPI-4 i2v test log. **Read before
> running any LoRA strength sweep** — it skips a blind per-LoRA hunt.

## The law

**Distilled LTX models want LoRAs at LOW strength: band 0.3–0.7, sweet spot ~0.5.**

- Matches the user's WAN experience exactly (distilled WAN: LoRAs prefer 0.3–0.7,
  0.5 sweet spot).
- Confirmed on LTX across TWO independent LoRAs converging on the same curve:
  - **VBVR:** best @0.5, degrades >0.7 (identity / lip-sync / fine-detail loss).
  - **Soft Enhance:** clean @0.5, **HALLUCINATES** detail @1.0 (invented a necklace).
- It's a **distilled-model property**, not a per-LoRA quirk: few denoise steps →
  no error-averaging → a LoRA's nudge commits hard; `cfg=1` → no CFG headroom to
  dilute it.

**Default any LTX LoRA to 0.5, sweep 0.3–0.7.** Over-strength tell on enhancer
LoRAs = hallucinated detail (jewelry/accessories not in the source). Feeds
template defaults, model-config, and the Cubric-Prompt recipe.

## All 4 LTX-2.3 capability LoRAs are MODEL-ONLY

Verified via safetensors tensor headers (not guessed): VBVR-V1, VBVR-Sulphur-I2V-V4,
Singularity, Soft Enhance are **100% `diffusion_model.*` keys, zero clip/te**.

- Load via **`MpiLoraModel`** (model-only). **`strength_MODEL` is the only live
  knob; `strength_CLIP` is inert.**
- The abliterated-heretic LoRA is the **opposite** — 100% `text_encoders.*`
  (CLIP-only, `strength_MODEL` inert), which is why it's superseded by the
  heretic-fp8 full encoder (~50× dilution as a LoRA).

## VBVR i2v strength norm = 0.5 (max ~0.7)

Concluded across 4 tests / 3 images / 2 resolutions (stage-1 352×640 AND 544×960).
Higher strength costs, with NO motion payoff:

- **Identity drift / face squash** scales with strength (face widens, jaw distorts
  at 1.0). Partly compounded by low stage-1 res + far face, but persists at higher
  res → it's the LoRA, not just resolution.
- **Speech / lip-sync naturalness degrades** at high strength (face-geometry
  distortion breaks lip-sync).
- **Fine-detail erosion** at high strength.
- **0.5 = best overall.** 0.5–0.7 usable band; above = net-negative.

Mitigations: higher stage-1 res preserves identity much better (freckles stayed
consistent across the sweep); FL start/end frame pins both ends as an
identity-lock escape hatch.

## Soft Enhance = an autofocus / depth-of-field LoRA

Characterized: pulls the subject back into focus as it approaches camera.
@0 = dominant + good, @0.5 = weaker, @1.0 = kills it (and hallucinates). Another
high-strength-destroys data point.

## ✅ CAPABILITY-LoRA VERDICTS — CLOSED 2026-06-23 (exhaustive Pod testing)

**Ship config for i2v + t2v: BASE distilled LTX-2.3 + the prompt-contract, NO capability
LoRAs.** Every reasoning/anatomy LoRA tested marginal-to-negative. See
[tested-loras-versions.md](tested-loras-versions.md) for the exact versions tested (so a
future re-test of a NEW version starts from the right baseline).

- **VBVR-V4 (i2v) DROPPED.** On a clean image + ordered `then/while/as` prompt + good seed,
  BASE already follows the whole sequence — no gap to fill. Tested the creator's full envelope
  (0.5/0.7, 8 & 12 steps, up to 1.0): best case = marginally better head-tilt, bought with a
  WORSE garment morph + a per-gen step-time tax. v4 was also trained/demoed on the **Sulphur-2
  uncensored base**, not our distilled bf16 → base mismatch likely worsens it.
- **VBVR-V1 (t2v) DROPPED.** Inconsistent across scenes (scene 1 better — killed a literal
  light-prop; scene 2 tie-to-worse — junk buttons, killed rain). Coin-flip ≠ shippable always-on.
- **Singularity OmniCine DROPPED.** Tested in its NATIVE `[Scene&Style]/[Action Timeline] 0-Xs/
  [Camera Timeline]/[Environment]` syntax, 0.8/0.5/0.3, simple + dense(5-seg/10s), stage-1+2,
  portrait+landscape. Real but MARGINAL win (paces dense multi-segment timelines better than base,
  which crams 5 segments into ~3s) — outweighed by: **degrades audio at every strength** (gated/
  distorted foley, no ambient, robotic voice; NO documented audio/sigma fix exists → decision rule
  = drop, no blind tuning), **ethnicity bias** (drags faces Asian unprompted, clean only ≤0.3),
  +2.5GB, ~17% slower, and it needs a whole DIFFERENT prompt syntax. Recommends fp8 base; we run
  bf16. Revisit on a NEW version (record what we tested → tested-loras-versions.md).
- **Soft_Enhance — UNDER TEST (only LoRA still a real candidate).** Detail/autofocus/DoF LoRA;
  earned signal earlier (cigarette/fine detail got WORSE without it). If it earns a slot it's
  MERGE-able (always-on detail enhancer, no prompt change, no toggle — the cleanest outcome).
  Norm 0.5 (1.0 hallucinates — invented a necklace). Judge it on stage-2 (detail stage).
- **Transition (FL) — UNTESTED this session.** Only LoRA besides Soft still alive; it's a TOGGLE
  (on/off), stays separate, not always-on. FL is its home.

**Kijai's "distilled LoRA" is a SPEED/step-compression LoRA** (dev→8-step CFG1), NOT reasoning.
Nobody baked sequencing — the base distilled model is just already good at ordered prompts, which
is exactly why the third-party reasoning LoRAs are redundant on it.
