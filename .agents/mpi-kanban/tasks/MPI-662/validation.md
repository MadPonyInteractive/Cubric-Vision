# MPI-662 validation — lightx2v v1.0 turbo LoRA on H3 + kitchen attention on the turbo path

**Closed 2026-09-07.** Checklist is 7/7 with no open item.

| Evidence | Where |
|---|---|
| H3 turbo takes the v1.0 LoRA and comfy kitchen attention | `4eda8c6b` |
| ref2va takes its OWN turbo LoRA at its own strength (`MpiMath` #453 → `1.0 if a else 0.2`); fl2va untouched | `fae92d80` |
| The "8x strength" claim was wrong and was replaced by a measurement | `2b1b30ba` |
| New dep id `minimax-h3-ref2va-turbo-lora` — the two cards stop sharing one LoRA | `fae92d80`, `models.js` |
| R2 upload verified | 306,731,560 bytes, HTTP 200, Content-Length matches |
| Footprint recomputed from `DEPS` | 48.03GB fl2va / 47.91GB ref2va / 28.09GB shared / 67.85GB with both installed |
| Tests | 14 pass, 0 fail — including `shared-dep-uninstall-direction`, which the un-sharing touches |
| Sync | runtime diff is exactly the two intended changes |

## Findings kept

- **Clip length reversed the verdict.** Every ~1s A/B said the ref2v weight was worse; at
  real duration it won on cinematic look and audio adherence. H3's trained window is
  124–362 frames (~5.2–15.1s) — judge nothing on H3 below the window.
- **Magnitude predicted the opposite three times.** ‖B@A‖_F puts this weight at 0.12x the
  fl2v v1.0 at equal strength; it was called starved, and it won. Do not reason about LoRA
  strength from `baked_scale` or from norms.
- The fl2v v1.0 adoption earlier the same day was judged on shorter clips and was not
  re-judged. If a release is cut, that is the run to repeat first — carried into MPI-706's
  5090 test list rather than held open here.
