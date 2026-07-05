# MPI-195 Validation

**Verify mode:** user-ux — user must watch a stopped LTX gen finish in the app.

Acceptance:
1. LTX gen, Stop mid-stage-2, ComfyUI finishes → card appears immediately (no reload), preview replaced, no orphan placeholder.
2. Stop very early (no output produced) → still NO card (empty-output cancel unchanged).
3. Group-history surface behaves the same for both cases.
4. No duplicate card, no `_myGenIds`/registry leak.

## Results

- 2026-07-05: Code shipped. Self-verify: ESLint clean (exit 0), `node --check`
  clean on all 3 files, Electron app boots (200 on :3000, ComfyUI :8188) — no
  syntax/import regression from the edits. App left running for the user's
  manual LTX run.
  Files: js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js,
  js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js,
  js/services/generationService.js.
- 2026-07-05 (user, live LOCAL LTX): Stop mid-stage-2 → generation ACTUALLY
  stopped (interrupt honored, empty output, no card). Early stop → also stops,
  no card. Acceptance (b) PASSED live; no regression in stop behavior.
  NOTE: the bug case (interrupt ignored, gen completes with real output) did
  not reproduce in these runs, so the NEW bridge path (late complete → card)
  is logic-verified only, not yet live-exercised. Deterministic trigger
  offered: Stop during final VAE decode (post-100% sampling) → gen completes
  with output → card should appear. Original wild sighting was likely remote
  interrupt latency + MPI-203 (reconcile-discard wedge) stacking.
- Two-lane acceptance (c) deferred until MPI-203 is fixed (remote lane can
  wedge for its own reason, contaminating the test).
- 2026-07-05 (user, live POD decode-window test): Stop at stage-2 100% →
  placeholder torn down correctly, pod finished with 1 output — but terminal
  WS missed AGAIN (app.log 19:37:29 'Reconciled completed gen de631fd3... via
  poll (1 outputs)') → reconcile resolve DISCARDED (MPI-203) → onComplete never
  ran → bridge never received an event. TEST INCONCLUSIVE for the bridge —
  blocked by MPI-203, exactly the predicted failure-reading. Status bar counts
  forever (no terminal). 2/2 remote gens this session missed terminal WS (first
  had NO stop) → misses are the NORM on this pod, MPI-203 is the dominant
  remote failure. Bridge proof paths: (1) LOCAL decode-window stop (local WS
  never reaped), or (2) fix MPI-203 then remote decode-stop proves both.
