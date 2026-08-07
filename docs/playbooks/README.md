# docs/playbooks/ — routing index

End-to-end procedures. Each playbook is a README hub + numbered section files — **the hub
carries the mandatory step ordering; start there, never at a numbered file.**

| Task | Playbook | Enforcing skill |
|---|---|---|
| Wire a NEW model end-to-end | [add-model/README.md](add-model/README.md) | `/mpi-add-model` |
| Wire a NEW Flow (dev-gated Flow-Library outcome flow) | [add-flow/README.md](add-flow/README.md) | `/mpi-add-flow` |
| Bump the ComfyUI engine users run, or smoke-test models (two engines off one pin, Pod-version assert, executing smoke gate) | [bump-engine/README.md](bump-engine/README.md) | `/mpi-bump-engine` |
| Shared invariants both playbooks reuse (hard rules, op registration, inject-title guards, output capture) | [common/README.md](common/README.md) | — |
| Verify a freshly-built portable before shipping (per-folder data trap, RunPod key carry-over, smoke checklist) | [install-test/README.md](install-test/README.md) | — |
