# MPI-698 Checklist

## The swap (shipped, then reverted)

- [x] Registry + graphs moved to `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` (ea09a18e).
- [x] **REVERTED 2026-09-05.** Both H3 models point at `h3-qwen3vl-32b-clip`
      (int8_convrot Heretic) again. Fabio's call, on ~10 generations of entity
      duplication from the nvfp4 build against a long clean int8 baseline.

## Revert, as landed

- [x] `js/data/modelConstants/models.js` — both H3 cards (fl2va, ref2va) back to
      `'h3-qwen3vl-32b-clip'`.
- [x] `js/data/modelConstants/assetDeps.js` — the two entries reframed as a
      **quality-vs-footprint pair**, not superseded/current. Both stay in `DEPS`.
- [x] The false `IDENTICAL results` A/B comment corrected. The censorship half held;
      "identical" did not — the original sample was too small to catch occasional
      structure corruption.
- [x] Eight graphs re-pointed by byte-level literal swap (raw LiteGraph, compiled
      runtime, and the `workflow_generation` API templates for both models plus
      `flow_h3_extend`). Byte-level on purpose: line endings differ per file
      (`minimax_h3_r2va.json` is CRLF, its raw twin is LF), so a JSON round-trip
      would have produced a four-figure diff.
- [x] `generate_h3.py` `SHARED_WEIGHTS` updated — its own comment warns that a dep
      swap missing this line reads as a registry bug.

## NVFP4 is retained, NOT deleted

- [x] **R2 delete CANCELLED** (Fabio, 2026-09-05, reversing the earlier
      authorisation). Intended as a low-VRAM tier: 10GB smaller, takes the resident
      pair ~45GB -> ~35GB.
- [x] Dep entry kept in `DEPS` with both URLs live — required by the orphan sweep
      (`_orphanedDepIds` walks `Object.keys(DEPS)`) and by `release:deps`.
- [ ] Wire the low tier. NOT DONE, no card yet.

## Verification

- [x] `node --test tests/flow-model-choice.test.cjs` — 23/23 pass. This is the test
      `ea09a18e` was written to fix and the one the atomicity constraint was about.
- [x] `npm run release:deps` — "All 304 URLs reachable", exit 0.
- [ ] **H3 Pod smoke on a 54GB box — EXPECTED TO FAIL AGAIN.** The revert restores
      the ~45GB resident pair that SIGKILLed an L4 Pod on `minimax-h3/t2v_ms`
      (`code -9`). Known open cost, not an oversight. It gates 1.5.0.
- [x] Docs swept. `docs/models/h3/README.md` — dep table, and the encoder section
      rewritten to carry BOTH halves (why nvfp4 was taken, why it lost) plus the
      restored Pod OOM and the retention decision. `docs/download-manager.md` and
      `docs/releases/UNRELEASED.md` never named this encoder — nothing stale there.
