# MPI-174 Validation

**Date:** 2026-07-02 · **Verify mode:** auto · **Result:** PASSED

## What shipped
- `js/data/modelConstants/models.js` — ModelDef gains optional `ratios` + `qualityTiers` (typedef only; no model entries changed).
- `js/utils/ratios.js` — imports MODELS; declared-by-type maps checked before the built-in switch; RATIO_MODES augmented at load for declared types; new export `qualityTiersFor()`. Zero consumer signature changes.
- `js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js` — local QUALITY_TIERS_BY_MODEL/tiersFor deleted; delegates to qualityTiersFor.
- `js/migrations/projectMigrations.js` — v3 tiersFor reads declared ModelDef.qualityTiers first (via already-required MODELS); inline table = frozen legacy fallback.
- `docs/add-model-playbook.md` §6 — sweep shrunk: ratios/tiers now declared on ModelDef; only enhanceRecipe spot remains hardcoded.

## Evidence (self-verified)
- Equivalence test (scratchpad mpi174-verify.mjs): getModelRatios/qualityTiersFor/RATIO_MODES byte-identical to pre-refactor tables for all 5 built-in types, all tiers/orientations, fallbacks (unknown type → sdxl, bad tier → medium, no orientation → portrait, case-insensitivity) — ALL PASS.
- Declared-path test (mpi174-declared.mjs): synthetic model with qualityTiers ⇒ quality mode + declared tiers/ratios resolved; ratios-only model ⇒ orientation mode; built-ins untouched — PASS.
- Migration-vs-ratios drift check: tiersFor expressions equivalent for wan/wan5b/ltx/unknown — PASS.
- ESLint on all 4 touched files: clean.

## Not yet done
- Not committed (mpi-end-session owns commit).
