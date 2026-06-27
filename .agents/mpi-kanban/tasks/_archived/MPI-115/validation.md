# MPI-115 validation

## Done (automated)
- [x] All 16 touched files `node --check` clean.
- [x] ESLint clean on touched JS.
- [x] Migration runtime test (`migrateV2toV3`): dirty v2 sidecar → ratioLabel+videoMeta removed, modelSettings→controlState.model, canonical fps/duration + injectionParams preserved, project bumped to schema 3. ALL ASSERTIONS PASSED.
- [x] Grep: zero remaining `videoMeta` reads/writes (only the migration that deletes it); zero `generationSettings.modelSettings` writes.

## USER live-verify (needs app restart + engine)
Restart app (loads new code), then:
1. **Generate 1 IMAGE** → open its `.meta/<uuid>.json`. Expect: NO `ratioLabel`, NO `videoMeta`; `generationSettings.controlState.shared` (ratioSelector/qualityTier/batch) + `.op` (if denoise/grid touched) + `.model` (loras/upscaleModel). NO `generationSettings.modelSettings`.
2. **Generate 1 VIDEO** → same + `controlState.shared` has `duration`/`motionIntensity`/`previewStage`.
3. **Reuse Prompt** on each new item → PromptBox shows EXACT recalled settings (ratio, quality, duration, motion, denoise) with no nav-refresh. (MPI-112 refreshControls fix already in place.)
4. **Open the `race tests` project** (pre-existing dirty sidecars) → migration runs on open (schema 2→3), sidecars rewritten clean; reuse on an OLD item still recalls correctly (via legacy reverse-derive fallback).
5. Spot-check history/gallery cards still show fps/duration/dims (top-level canonical, unaffected).

## Master patch — CANCELLED
Fabio 2026-06-18: keep RunPod-only, no master patch.

## VERIFIED (Fabio 2026-06-18)
Real project `Sidecars test` confirms the fix end-to-end:
- project.json `schemaVersion: 3` (migration ran on open).
- Fresh i2v_ms sidecar: NO ratioLabel, NO videoMeta, NO gs.modelSettings; has `gs.controlState` with full `shared` (ratioSelector{qualityTier,selectedRatio}, duration) + `model` buckets.
- Quality sources AGREE: injectionParams 320x176 == pixelDimensions 320x176 == qualityTier 'very_low'. The brief's headline disagreement bug is resolved by capturing the tier at gen time instead of reverse-deriving.
