# MPI-548 checklist

## Phase 0 — re-diagnose

- [x] Trace `lora_missing_remote` to its real emitter (Pod-side ComfyUI 400 /
      200-ack `node_errors`, `comfyController.js:1642` + `:161-165`) — NOT the
      pre-dispatch guard.
- [x] Establish which engine the failing dispatch used (hot-store toast is gated
      `engine === 'remote' && forceLocal !== true`).
- [x] Identify the file: BAKED dep `klein-lora-nsfw`, `klein_t2i.json` node 38,
      never in `state.availableLoras`.
- [x] Confirm `resolveDeps(klein-4b, ['t2i'], …, 'remote')` includes that dep
      (offline bare-Node run) → the op gate had it in scope and passed.
- [x] Rule out the separator heal, hot-store staging, and `_uploadRemoteModels`.
- [x] Rewrite `brief.md` / `plan.md` / `validation.md` to the proven mechanism.

## Phase 1 — the two facts

- [x] Fabio: **laptop icon** → the override was ON. Decisive; a local-only bug.
- [~] Pod volume check — not run, and no longer gating (see Defect A′). Fabio noted a CPU
      pod may not be connectable for it.
- [x] Answer recorded in `validation.md`.

## Phase 2 — fix Defect A (`forceLocal` threaded by hand)

- [x] Sweep EVERY dispatch site (`enqueueGeneration` / `startGeneration` / `runCommand`):
      10 sites, 8 never pass `forceLocal` → table in `brief.md`.
- [x] Structural fix in the funnel, not at the sites:
      `opts.forceLocal ?? (state.engineOverride === 'local')` in `enqueueGeneration`,
      resolved BEFORE `_buildQueueDisplay` so the Cue engine chip is fixed too.
- [x] Same derivation in `startGeneration` for a direct call bypassing the queue.
- [x] `MpiToolOptionsResize` (the only direct `runCommand`) reads the override itself.
- [x] Explicit `opts.forceLocal` still wins — the loop re-fire's lane pin (`_onLaneDrain`)
      must not be re-derived, or a mid-loop toggle ping-pongs the lanes (MPI-213).
- [x] `_laneOf` now sees the resolved flag, so the intent lane and the store lane agree.
- [x] `npm test` 629/629; eslint clean on both edited files.
- [x] Live probes in an isolated instance (own profile + own port, never `:3000`).
- [ ] Fabio confirms in the app with a Pod connected (`validation.md` cases 1-3).

## Phase 2′ — Defect A′ (needs a Pod, no evidence yet)

- [ ] Reproduce a cloud Klein t2i whose baked dep the Pod lacks; it must be blocked by the
      op gate (`commandExecutor.js:1375`), not by ComfyUI `value_not_in_list`.
- [ ] Only if it reproduces: make remote install-state truthful while connected — prefer a
      dispatch-time re-check of the selected op over polling a ~10s wrapper scan.

## Phase 3 — fix Defect B (asset list is engine-blind)

- [ ] `/comfy/list-files` gains an `engine` param + a remote branch via
      `routes/remoteModels.js`; local branch and its `path.sep` labelling unchanged.
- [ ] `assetService.loadAll()` passes `remoteEngineClient.effectiveEngine()`.
- [ ] Re-derive on BOTH edges: the existing `comfy:ready` call (`shell.js:414`) AND a new
      `Events.onState('engineOverride')` re-fetch beside `syncModelInstalled` (`shell.js:1598`).
- [ ] Sweep every consumer: `MpiModelSettings` options + "missing" styling,
      `MpiToolOptionsUpscale`, `_resolveModelName`, `_resolveUpscaleParam`, `_findMissingModel`.
- [ ] Preserve `_findMissingModel`'s MPI-82 semantics (a remote gen still blocks on a
      LOCALLY absent user LoRA — it is uploaded from local disk) and its fail-OPEN on an
      empty list, with the `lora_missing_local` backstop intact.
- [ ] Separator regression: a subfoldered LoRA still resolves on Windows-local AND on the Pod.
- [ ] Both engine twins fixed, per `.claude/rules/comfy_engine.md` § Engine Split.
