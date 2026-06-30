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

## Phases B & C — NOT started (card stays in `doing`)

- **B:** migrate deps+workflow to one `engines:{local,remote}` profile + one
  `resolve(model, op, engine)`; parity + synthetic op-keyed+engine-split test.
- **C:** delete `localDeps`/`remoteDeps`/`ggufWhenRemote`/`_toGgufFilename` +
  residual union fixes (`_confirmWholeUninstall` MpiModelManager:241); rewrite the
  STALE `.claude/rules/comfy_engine.md` (needs user permission).

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
