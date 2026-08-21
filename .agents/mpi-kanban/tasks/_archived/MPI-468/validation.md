# MPI-468 — validation

This card is a **dispatch handle**, not work. It exists so one agent could own both engine-bump
cards without two cold agents overwriting the same playbook. It is complete when its children
are, and the ownership split it defined held — neither card wrote into the other's files.

| child | owns | outcome |
|---|---|---|
| [MPI-457](../MPI-457/task.json) | the MECHANIC — `routes/engine.js` in-place `/engine/upgrade`, the repo-side bump skill | **done** |
| [MPI-467](../MPI-467/task.json) | the GUARD — `docs/playbooks/bump-engine/`, the smoke runner, the `mpi-release` refusal | **done** (2026-08-09) |
| [MPI-465](../MPI-465/task.json) | the failure that started it — a dead LTX shipped for six days | **done**, closed on the smoke evidence itself |

The split held: `/mpi-bump-engine` **calls** the playbook rather than restating it, and the
runner (`scripts/smoke-workflows.mjs`) lives entirely on the 467 side.

**The premise is now proven, not just built.** MPI-465 shipped a completely dead LTX because
nothing in this repo ever EXECUTED a workflow, and graph validation passed it. The gate that
replaced that: `dev_configs/smoke-evidence.json` records 35 PASS / 0 SKIP / 0 FAIL across 35 ops
on engine 0.30.0, `npm run release:check` refuses a bumped engine without it, and the same
matrix caught three real defects reading could not have found (MPI-498's missing
`upscale_method`, the `nvidia_pid` crop, and MPI-501).

Nothing left on this card — closing it as the handle it was.
