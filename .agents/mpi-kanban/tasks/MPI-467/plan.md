# MPI-467 Plan — bump-engine playbook + Pod smoke runner + release gate

**Verify mode:** auto (phases 1–4). Phase 5 is a scheduled live run and needs the user.

## Current State

`docs/playbooks/` has `add-model/`, `add-flow/`, `common/`, `install-test/` — no `bump-engine/`.
Nothing in the repo executes a workflow graph. `/engine/upgrade` is still wipe-only
(`routes/engine.js:807`) — that is MPI-457's, untouched here.

## Decisions (settled with the user 2026-08-07, do not re-litigate)

| Decision | Value | Why |
|---|---|---|
| Where the smoke runs | RunPod, **not** local | One GPU here and it is busy; local can never hold every weight, and a skipped model reading as green is the failure MPI-465 already shipped |
| Datacenter | **EU-RO-1**, fixed | Volumes are DC-locked; this DC has the cards. No survey needed |
| GPU preference | **L4 → RTX 3090 → RTX 4090**, first available | User's measured availability. L4 runs every workflow; 4090 is the reliable fallback. RTX 2000 Ada skipped (16GB, rarely available) |
| System RAM | assert ≥48GB, do not filter | ~54GB on effectively every card in EU-RO-1 |
| Volume | **320GB, separate** from the 150GB dev volume | Container disk mirrors volume size (`docs/runpod-remote-engine.md:242`), so growing the dev volume taxes every ordinary dev Pod with a 325GB disk |
| Volume lifecycle | create if absent → fill → smoke → **prompt** delete | ~$20/mo kept vs ~285GB re-download per bump. Print both, let the user choose |
| Runner home | `scripts/smoke-workflows.mjs` | A `tests/` file runs on CI with no GPU and no weights — Tier 0 forever, and a green badge would read as coverage |
| How it reaches RunPod | drives the running app on `:3000` | Every route already exists (`/runpod/gpu-availability`, volume CRUD, `/remote/*`). Writes no new API code and exercises the path users hit |
| Execution unit | the **op** (~35), not the workflow file (12) | `klein-4b` runs 7 branches through one graph via `opInject`/`Input_wf_type`; a bump can break one branch while the others pass |
| Minimization | generic, by node **title** | Walk for `Input_Width` / `Input_Height` / `Input_Steps` / `Input_Frames` and clamp. Same convention the injector uses, so it survives graph edits. No per-graph table |
| Model selection | lowest tier per family, deduped by **class_type set** | A core bump breaks a *node*; identical node sets are one test |

## Volume sizing (computed from the registry, `arch: modern`)

| | GB | graphs |
|---|---|---|
| Every model, every op | 430.0 | 19 |
| Smoke set, today | 312.2 | 12 |
| − Wan t2v deprecation (in flight, separate session) | 285.1 | 11 |
| − LTX int8 @21GB (MPI-466, in flight) | **~281** | 11 |

Wan 2.2 ships **separate t2v and i2v transformers** — dropping t2v is a real 27.1GB.
Every other video model shares one weight set across both ops (0GB, one fewer graph).
LTX int8 also erases the arch split, so the volume stops being card-family-bound.

**The runner recomputes this from the registry at run time. Never hardcode the number** —
both figures above are mid-flight and will be wrong within days.

## Remaining Work

### Phase 1 — Playbook skeleton
`docs/playbooks/bump-engine/` (README hub + steps), matching `add-model/`'s shape but thin.
The step ORDER is the deliverable: bump `node_lock` → rebuild Pod image → **assert the Pod
reports the new version** → smoke → ship. Without that assert you smoke the OLD engine and
stamp the bump safe. Records what Pod-green does *not* cover: the Windows portable half.
**Verify:** file exists, routed from `docs/README.md`, order + assert present.

### Phase 2 — Smoke runner
`scripts/smoke-workflows.mjs`: resolve the smoke set → ensure volume → CPU-Pod install →
verify installs → rent the first available preferred GPU → execute every op minimally →
report → prompt on the volume.
**Verify:** `--plan` prints the full matrix with zero spend; unit-level check on the
minimizer and the set resolver.

### Phase 3 — Release gate
`mpi-release` refuses a bumped engine with no smoke evidence.
**Verify:** the refusal fires on a simulated bump with no evidence file, and passes with one.

### Phase 4 — Free verification
DC/GPU survey against the live API (read-only), smoke-set resolution, minimized plan print.
**Verify:** real GPU availability returned for EU-RO-1; plan totals match the table above.

### Phase 5 — Proving run (scheduled with the user, costs money)
Volume create + ~281GB fill + one full smoke pass.
**Verify:** every op returns an image/video; skips named explicitly; exit code correct.

## Completed

(nothing yet)
