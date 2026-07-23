# MPI-152 Validation

## Fix (3 layers)
1. `js/services/comfyController.js`
   - `execution_success` accepted as terminal alongside legacy `executing node===null`
     (dual-check, engine-version-agnostic) → resolves the gen Promise.
   - `_promptResolvers` Map + `_reconcileFromHistory(promptId)` hooked into WS
     `onopen`: on reconnect mid-gen, polls `/history/{prompt_id}` and settles from it
     when the live terminal event was lost during the reconnect blip (broadcast=False,
     not replayed). Idempotent re-checks via `_promptResolvers.has`.
   - Temp WSDBG/WSDBG2 debug REMOVED.
2. `js/services/commandExecutor.js`  ← the fix for the VISIBLE hang
   - `execution_success` now calls `_finishGeneration()` (idempotent) →
     `exec.onComplete` → gallery placeholder→asset swap + status/clock clear. Previously
     only `executing node===null` (dropped in v0.26) triggered it, so the card spun +
     clock counted forever even though outputs (from `executed`) had landed.
   - `progress_state` already handled here (pre-existing) — sampling-start/progress OK.
3. `routes/remoteProxy.js` + `cubric-vision-pod/wrapper/wrapper.py` (mpi-ci)
   - `GET /proxy/history/:promptId` → `GET /wrapper/history/{prompt_id}` → ComfyUI
     `/history`. Wrapper bumped 0.2.14→0.2.15; app POD_IMAGE_VERSION→v0.9.1.

## Verified
- **LOCAL v0.26 (RTX 4060 Ti) — PASS 2026-06-26.** LTX-2.3 gen (`Prompt executed in
  137.46s`) settled CLEAN in the app: gallery card resolved, clock stopped, status
  cleared, video committed. App log shows `MpiGalleryBlock rebuildAfterEnd` (the
  onComplete→generation:complete→gallery-swap chain firing). User confirmed
  "successful Generation". This is the core completion fix (commandExecutor terminal).
- Self-verify: all 3 app files `node --check` clean; wrapper.py `ast.parse` clean;
  `release:check` PASSED; `_reconcileFromHistory` decision logic smoke-tested (6/6:
  wait/reject/resolve + correct /view URL shape for image+video).

## Still to verify (REMOTE — needs a v0.9.1 Pod build)
- Remote LTX t2v + i2v on a fresh v0.9.1 Pod (wrapper 0.2.15 with /wrapper/history):
  gen settles clean; AND the reconnect-reconcile path fires (look for
  `Reconciled completed gen <id> from /history` in logs/app.log when the WS blips
  mid-gen). The commandExecutor terminal fix already helps remote whenever the WS
  doesn't blip; reconcile covers the blip case.
- Wrapper change needs the Pod image rebuild (v0.9.1) — user-gated.

## Verify mode
user-ux (UI completion behavior — card resolve, status clear).
Verified by the user on local; remote pending the next Pod build.
