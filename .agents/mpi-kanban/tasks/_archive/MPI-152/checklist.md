# MPI-152 Checklist

## Research (fan-out) — DONE
- [x] Map ALL v0.26 WS/SSE event changes vs the app's consumers — events NOT renamed; v0.26 sends both old+new. Real cause = terminal sentinel dropped + broadcast=False not replayed on reconnect.
- [x] Node renames (#14547) + categories (#14460) vs baked workflows — ZERO breakage (display-name only). Worry closed.
- [x] v0.26 HTTP /history shape for reconciliation — documented (research/findings-synthesis.md).
- [x] Memory-mgr / CLI flags (#14577/#14594) — aimdo likely not initializing on Pod; feeds MPI-146 (note only).

## Fix — DONE
- [x] App: progress_state handling (commandExecutor — was already present)
- [x] App: execution_success terminal in BOTH handlers (comfyController resolve + commandExecutor onComplete/_finishGeneration)
- [x] App: _reconcileFromHistory + _promptResolvers (reconnect-lost terminal recovery)
- [x] App: /proxy/history/:promptId passthrough
- [x] Wrapper (mpi-ci): GET /wrapper/history/{prompt_id} + bump 0.2.14→0.2.15
- [x] App POD_IMAGE_VERSION→v0.9.1 / WRAPPER_VERSION→0.2.15
- [x] Keep old + new event handling (engine-version-agnostic)
- [x] Remove temp WSDBG/WSDBG2 debug from comfyController.js

## Verify
- [x] Local LTX gen: status advances, card resolves, video lands, clock stops — PASS (user-confirmed 2026-06-26)
- [ ] Remote LTX t2v + i2v on a fresh v0.9.1 Pod (wrapper 0.2.15) — pending Pod rebuild
- [ ] Remote reconnect-reconcile fires (`Reconciled completed gen` in app.log on WS blip) — pending Pod
- [ ] v0.9.1 Pod image build (wrapper 0.2.15 + the /history endpoint) — user-gated

## Future / separate cards (not MPI-152)
- [ ] MPI-145/146: aimdo (dynamic-vram) not initializing on Pod → real load-speed cause; --lowvram is a no-op when aimdo is on. Reframe per-card VRAM around enabling aimdo + dropping --lowvram, NOT tuning lowvram.
- [ ] Triton-windows / PatchTritonVAE: local Windows triton missing = cosmetic (we don't use PatchTritonVAE; our LTX uses standard VideoVAE). Fixing = embedded-python crash risk + the 2x-Windows-slowdown gotcha, for zero gain on current workflows. Defer unless we want the triton VAE path.
