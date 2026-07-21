# docs/playbooks/ — routing index

End-to-end procedures. Each playbook is a README hub + numbered section files — **the hub
carries the mandatory step ordering; start there, never at a numbered file.**

| Task | Playbook | Enforcing skill |
|---|---|---|
| Wire a NEW model end-to-end | [add-model/README.md](add-model/README.md) | `/mpi-add-model` |
| Wire a NEW App (dev-gated App-Library outcome app) | [add-app/README.md](add-app/README.md) | `/mpi-add-app` |
| Shared invariants both playbooks reuse (hard rules, op registration, inject-title guards, output capture) | [common/README.md](common/README.md) | — |
| Verify a freshly-built portable before shipping (per-folder data trap, RunPod key carry-over, smoke checklist) | [install-test/README.md](install-test/README.md) | — |
