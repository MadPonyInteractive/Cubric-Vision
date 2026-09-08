# MPI-556 Checklist

Derived from `tasks/MPI-561/plan.md` § "Phase 1: Make the sidecar describe the run (MPI-556)".

- [x] Decide the reconcile design (getValue-style vs per-injected-key) — neither: each control already owns its injection map, so the run's value is recovered by asking the control itself (`reconcileControlsFromInjection`). No hand-maintained key list.
- [x] Make `_snapshotControlState` reconcile every control against the run's real `injectionParams`
- [x] Stop the project's `qualityTier` reaching the sidecar — derived from the size that shipped instead, into BOTH the per-model bucket and the legacy shared copy
- [x] Non-GPU verification: `tests/control-snapshot-injection.test.cjs`, 7 tests incl. both live-proven cases end to end through the wired snapshot. Suite 805/805, lint clean.
- [x] GPU verification: one live krea2 run carried both halves (style 7 @ 0.65, forced to 1k in a project seeded to 2k). Sidecar records the run; Reuse restores Soft Water Color / 0.65 / 1k. klein-4b substituted by krea2 - its weights are not installed here.
