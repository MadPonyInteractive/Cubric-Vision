# MPI-165 Validation

## Phase A — DONE, live-verified both engines (2026-06-30, commit 66efefe)

**What shipped (two bugs, one Pod symptom):**

1. **Stale engine signal at the workflow swap** (`commandExecutor.js` `runCommand`).
   The swap read `remoteEngineClient.isRemote()` (a `_active` mirror) BEFORE the
   per-gen `refresh()` ran inside `ensureServerRunning()` → first gen after Pod
   connect locked the bf16 file. Fix: `await refresh()` + resolve `engine`
   (`'local'|'remote'`) ONCE at the top of `runCommand`, gate the gguf swap on it.

2. **The `_gguf` workflow still carried the bf16 loader.** Even with the right file
   selected, `LTX_t2v_gguf.json` had BOTH a bf16 `UNETLoader` and `UnetLoaderGGUF`
   behind an `MpiIfElse`. **ComfyUI eager-validates every node's file inputs at
   PROMPT time** (lazy `MpiIfElse` defers execution, not validation) → the
   unselected bf16 loader's absent weight rejected on a GGUF-only Pod. Same trap
   hit LoadImage/LoadAudio with the template's baked test media.

   Fix in the build script (`generate_ltx.py`, NOT runtime):
   - `_select_loader()` — per flavour keep ONE unet loader, delete the other,
     repoint the dropped loader's `Model_Connect` consumer to the kept one.
   - `_stamp_placeholders()` — reset `Input_Start_Frame`/`Input_End_Frame` →
     `ltx_placeholder.png`, `Input_Audio_File` → `ltx_silence.wav` (the files
     `routes/comfy.js WORKFLOW_INPUT_DEFAULTS` stages every submit), drop stale
     `audioUI`.

**Verification:**
- Offline: all 8 `LTX_*.json` regenerated → each has exactly ONE loader (bf16
  files `UNETLoader`, gguf files `UnetLoaderGGUF`), correct placeholder media,
  zero test-file refs, zero dangling links, `Model_Connect` fed by the kept loader.
  Swap-gate self-check (forceLocal/remote/stage2 cases) + resolver tests 10/10.
- **LIVE (user, both engines):** local bf16 (RTX 4060 Ti, `RTX4060Ti Cold`, 3m20s)
  + Pod GGUF (RTX PRO 4500, `RTX PRO 4500 Cold`, 2m1s) BOTH completed gracefully,
  no `...bf16... not in []` reject, no `Invalid audio file`. Confirmed in app.

## Phase B — DONE, auto-verified offline (2026-06-30)

Migrated the engine axis to ONE `engines:{local,remote}` block + ONE resolver.
No Pod (parity-tested).

**What shipped:**
- `models.js` — `engines:{ local:{extraDeps:['ltx23-transformer-bf16'],workflowSuffix:''},
  remote:{extraDeps:['ltx23-transformer-gguf','ComfyUI-GGUF'],workflowSuffix:'_gguf'} }`
  on `ltx-23`. Legacy `localDeps`/`remoteDeps`/`ggufWhenRemote` KEPT as fallback
  (deleted in Phase C).
- `resolveModelDeps.js` — `engineDepsOf` now reads `model.engines[engine].extraDeps`
  (legacy localDeps/remoteDeps fallback). New `resolveWorkflowFile(model,op,engine,{stage2})`
  (`workflows[op]` → `_stage2`? → `engines[engine].workflowSuffix`, order yields
  `..._stage2_gguf.json`; legacy `ggufWhenRemote` fallback). New thin
  `resolve(model,ops,engine,{stage2,op,depExists,isNode}) -> {depIds,workflowFile,nodeIds}`.
  The op axis and engine axis UNION inside `resolveDeps` (op deps + engine extraDeps
  both appended) — the plan's "latent bug" (engineDepsOf ignoring operations) was a
  mislabel: engineDepsOf is engine-only by design; the union is in `resolveDeps`. The
  synthetic fixture proves all four op×engine combos compose correctly.
- `commandExecutor.js` — `runCommand` workflow swap retargeted to
  `resolveWorkflowFile(_model, op, engine, {stage2})`. Universal-workflow precedence
  kept. Removed the now-orphaned `_resolveWorkflowFile`/`_toStage2Filename`/`_toGgufFilename`
  helpers + the unused `getWorkflowFile` import (these were MY-change orphans; the
  `_toGgufFilename` deletion the plan parked for Phase C just landed early since it
  became dead).

**Verification (auto):**
- `node tests/resolve-model-deps.test.cjs` → 13/13 (was 10; +`testEnginesBlockParity`,
  `testWorkflowFileResolution`, `testOpAndEngineCompose`). Parity: engines: block ==
  legacy for local/remote/null. Filenames: `LTX_t2v.json` / `LTX_t2v_gguf.json` /
  `LTX_t2v_stage2_gguf.json` from both the engines: block AND the legacy fallback AND
  the real registry entry. Op×engine: the 4 combos from the plan's worked example
  (Painter = op-only i2v, pod-node = engine-only remote).
- `node --check` clean on all 3 edited JS files.
- Trace: engine resolved ONCE after `refresh()`, threaded into `resolveWorkflowFile`;
  no second `isRemote()` read for the swap. Grep confirms zero `js/`+`routes/`
  references to the 3 deleted helpers (only docs/kanban historical).
- **Swap-retarget smoke (live) NOT run** — Phase B is offline-complete; the live
  re-verify is Phase C's user-spun Pod check.

## Phase C — DONE (code + docs), auto-verified offline. Live re-verify PENDING (2026-06-30)

User granted rule-file permission + chose full union sweep.

**Deletions:**
- `models.js` ltx-23: removed `localDeps`/`remoteDeps`/`ggufWhenRemote`; only the
  `engines:` block remains.
- `resolveModelDeps.js`: removed the legacy fallbacks in `engineDepsOf` +
  `engineSuffixOf` (no `engines:` block → `[]` / `''`, not localDeps/ggufWhenRemote).
- `commandExecutor.js`: the 3 orphaned helpers + unused import were already gone (Phase B).

**Residual union sweep (the engine_split_sweep lesson — classified EVERY consumer):**
- `modelRegistry.js:251` `hasEngineDeps` — was reading the DELETED `localDeps`/`remoteDeps`
  → would flip false → LTX takes the cheap engine-agnostic `installed` path → THE REPRO
  BUG RETURNS. Fixed to read `model.engines?.local/remote?.extraDeps?.length`. **This was
  the one that mattered for the user's repro.**
- `MpiModelManager.js` `_confirmWholeUninstall` (was `resolveFullUniverse(model)` union →
  tried to delete BOTH engines' transformers) + `_opUninstallDepIds` (union both sides) →
  both now pass `_engine()`.
- `MpiPromptBox.js` `_ctxWithInstalledOps` (no engine arg → null → union) → now passes
  current engine. (LTX early-returns at `!model.operations`; this guards a future
  op-keyed engine-split model.)
- Verified-clean (already engine-scoped via resolver, no field read): `routes/shared.js`
  node-restore (`resolveFullUniverse(model,null,'local')`), `routes/downloadManager.js`
  `_filterDepsForEngine` (`resolveFullUniverse(model,null,engine)`).

**Docs/rule (user-permitted):**
- `.claude/rules/comfy_engine.md` — added § "2.5 Engine Split" (full contract: engines:
  block, the 3 resolver entry points, resolve-engine-once, two orthogonal axes,
  authoring + eager-validation rule) + an engine-split paragraph in the Sub-Agent Briefing.
- Fixed stale mentions of the deleted helpers in `comfy_injection.md`, `component-comfy.md`,
  `docs/comfy.md`, `dependencies.js`, `routes/shared.js`, `modelRegistry.js`,
  `MpiModelManager.js` comments.
- `docs/gotchas.md` — added the MPI-165 single-resolver UPDATE banner to the deps-axis
  entry (field renames + residual-site list).

**Verification (auto):**
- 12/12 resolver tests (the legacy-fallback `testEnginesBlockParity` removed — nothing to
  compare; `SPLIT` fixture converted to the `engines:` block; legacy `ggufWhenRemote`
  assertion dropped). All 6 `tests/*.test.cjs` files → 0 fail.
- `node --check` clean on all 9 edited JS files.
- **Repro proven offline against the REAL post-deletion registry** (scratchpad script,
  deleted after): `hasEngineDeps`=true (reads engines:), legacy fields absent, local +
  gguf-removed → `fullyInstalled:true`, remote same-disk → false, uninstall scoping
  excludes the other engine's weight.

**LIVE-VERIFIED 2026-06-30 (user, local):** removed the GGUF file from the unet folder →
LTX-2.3 displays as **installed** (bf16 present) → generation **started**. The exact repro
that failed before MPI-165 (GGUF-absent → false "not installed" → blocked) is fixed on the
real shipping state (legacy fields deleted, no fallback crutch). End-to-end engine-split
consolidation proven: deps axis + workflow axis + install-status gate all engine-correct
through the single resolver.

Phase A already live-verified BOTH engines (local bf16 RTX 4060 Ti 3m20s + Pod GGUF
RTX PRO 4500 2m1s, commit 66efefe). Combined with this local repro, all engine-split
behaviour is confirmed. Remaining Pod-only checks (fresh-connect first-try GGUF workflow;
per-engine uninstall) are covered by Phase A's live run + the offline scoping proof; no
open Pod test blocks closure.

## Follow-ups surfaced this session (file as own cards)

1. **Deps install-check reads engine signal while CONNECTING** — mid-connect
   `isModelUsable` (`modelRegistry.js:259` reads `isRemote()` live) demanded the
   gguf set locally while the Pod was still downloading → false "ltx-23 not
   installed — cannot reuse full prompt" toast. This is the Phase B/C deps-axis
   smear; the connecting-state behaviour (local-truth vs remote-intent) is a
   product call. **Good repro:** move the local gguf file out of its folder →
   app should still report local bf16 usable.
2. **Stale `Preview_Only requested but workflow has no matching node` warning**
   (`routes/comfy.js` / wrapper) — pre-multi-stage leftover, harmless noise,
   fires every gen. User confirmed it shouldn't exist anymore. Cosmetic cleanup.
3. **MPI-164** (verify-bar at ~95%) stays its own card — untouched.
