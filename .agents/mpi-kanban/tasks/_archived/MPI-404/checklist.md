# MPI-404 — checklist

Decision (brief.md): the models root stays ENGINE-OWNED. The fix is that the hero
must not claim a count it cannot have. No app-level models root.

- [x] `heroStats.js`: the models slot renders `—` (unknown) instead of the untouched
      initial zero. `_renderModels(null)` is the unknown state; `_lastModelCount` holds
      the last measured value.
- [x] Gate the paint on `hasNoEngine()` (`js/services/engineGate.js`) — the SAME
      predicate the three MPI-390 door guards already use. Reused, not re-derived.
- [x] Repaint on `engine:ready` and on the remote connect/disconnect EDGE — an engine
      arriving can make the count knowable without the installed SET changing, and the
      `models:checked` emit is diff-gated in `modelRegistry.js`. Edge-gated on purpose:
      the status heartbeat re-emits `{connected:true}` every ~5s.
- [x] NOT touched, per the decision: `getCustomRoot()` (`routes/shared.js`), who writes
      `extra_model_paths.yaml` (`routes/engine.js` step 6), the `engine:ready`
      subscription that gates `syncModelInstalled` (`js/shell.js`). Zero server changes.
- [x] Second count renderer swept: `MpiModelManager` line ~1278 ("N installed · M
      available") is the only other place that asserts a count, and the Model Library
      door is already gated by `blockedByNoEngine()` — unreachable with no engine.
- [x] Absorbed MPI-405: `_applyEnabled()` in `MpiRunpodSettings.js` now hides
      `#mpiSettingsRunpodStageOnConnectGroup` with the auto-connect and auto-retry
      plates. "Skip the local engine install" deliberately stays visible — it is a
      LOCAL-engine control and the only way back out of the escape hatch.
- [x] Both engine paths considered: remote-connected → `hasNoEngine()` is false, count
      comes from the Pod volume, behaviour unchanged. Local engine present → unchanged.
      The only behaviour change is the no-engine state itself.
- [x] Docs: `docs/shell.md` gained a `heroStats.js` section carrying the rule and why.
      Two user-facing bullets in `docs/releases/UNRELEASED.md`.
- [x] Evidence: `validation.md`.
