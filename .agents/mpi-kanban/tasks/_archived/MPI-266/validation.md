# MPI-266 — Validation

**Status:** VALIDATED (user, in-app) 2026-07-12.

## What was verified
User launched the app (local Ada engine) and confirmed:
- Model Library shows **2** Boogu Image Edit tiers (High / Balanced) — fp8 tier gone.
- Balanced card preview = the int8-generated image (not the old fp8 one).
- Edits render clean (not dark) — the fp8-dark-on-Blackwell symptom is designed out
  (int8_convrot is Blackwell-safe; no fp8 weight remains).

## Automated checks (agent, pre-commit)
- `python generate_boogu.py` → exactly 2 runtime files; high=bf16/Tier1, balanced=int8_convrot/Tier2.
- Both runtime JSONs parse + carry `Output_Image` capture title.
- `tests/inject-params-titles.test.cjs` → 4/4 pass.
- Consumer sweep: zero orphan `fp8_scaled` / `boogu-edit-low` / `transformer-low` refs
  (only remaining `fp8_scaled` = the qwen3vl text encoder, correct/shared).
- R2: `boogu_image_edit_fp8_scaled.safetensors` deleted → HTTP HEAD 404; int8 + bf16 → 200.

## Blackwell-verified (residual risk closed)
- User A/B'd all three weights on the Blackwell rig (RTX PRO 4500): int8_convrot Balanced
  is NOT dark there — the fp8-scale-factor darkening is confined to fp8_scaled, exactly as
  research/blackwell-fp8-dark-research.md predicted. The drop-fp8 decision is proven on the
  arch that failed. No fallback needed.
