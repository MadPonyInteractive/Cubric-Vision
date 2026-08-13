# MPI-548 checklist

- [ ] Reproduce with "Run locally" explicitly ON — does the dispatch resolve local?
      (Watch for the "Preparing the cloud engine..." toast: if it fires, engine is remote.)
- [ ] Reproduce with the toggle explicitly OFF — confirm the second, separate defect.
- [ ] Confirm with Fabio which semantic is intended (brief.md § Open question).
- [ ] Make the asset list engine-aware: `/comfy/list-files` gains a remote branch
      (via `routes/remoteModels.js`), `assetService.loadAll()` passes the engine.
- [ ] Re-fetch on BOTH edges: `remote:connection` AND `state.engineOverride` change.
- [ ] Sweep every consumer of `state.availableLoras` / `state.upscaleModels`:
      MpiModelSettings dropdown + "missing" styling, the pre-dispatch guard
      (`commandExecutor.js:305,371`), and the `lora_missing_*` backstops.
- [ ] Preserve the fail-OPEN behaviour when the list is empty (`comfyController.js:428`)
      and the local backstop (`commandExecutor.js:2178-2193`).
- [ ] Verify the separator logic still emits engine-native paths for BOTH engines
      (`routes/comfy.js:985-990`) — a subfolder LoRA on Windows must not 400.
- [ ] Both engine twins fixed, per `.claude/rules/comfy_engine.md` § Engine Split.
