# MPI-467 - Smoke-run every workflow when ComfyUI is bumped

## Why

MPI-465 shipped a **completely dead LTX** to every user on 1.3.0 and 1.3.1 for six days. The
cause was a ComfyUI bump changing a return type under a custom node. Nothing caught it because
**nothing in this repo ever executes a workflow** — `tests/` has exactly one workflow-shaped
test (`workflow-input-staging-gate.test.cjs`) and it does not run a graph.

It was found by accident: the user went back to LTX for unrelated authoring work.

## The gap in the tooling, confirmed

- **`mpi-bump-local-comfy` is bench-only.** It upgrades the standalone authoring bench at
  `G:\ComfyUi` and syncs its `extra_model_paths.yaml`. It does not touch
  `dev_configs/node_lock.json`.
- **The ENGINE bump — `node_lock.json`'s `comfyui.core.tag` — has no skill and no playbook.**
  That is the bump that ships to users, and it is the one that broke LTX (`v0.28.0 → v0.29.2`,
  commit `e2c2b4d6`, 2026-07-31).

## What the check must actually do

**Validation is not enough, and this matters.** MPI-465 threw at *sampling start*, inside a
KJNodes `OUTER_SAMPLE` wrapper, **after** the loaders had run. ComfyUI's own graph validation
passed it. Any check that only POSTs a graph and reads `node_errors` would have reported green.

So the smoke must **execute**: one minimal generation per workflow — smallest tier, fewest
frames, 1 step. Seconds of GPU each, and it catches the whole class (node removed/renamed,
input schema drift, API drift under a custom node, import failures, wrapper crashes).

## The disk problem, and why it is not a blocker

The user's own objection: *"I can't possibly have all models installed at once."* True, and it
does not need to be.

**Tier 1 — local, every bump.** Smoke whatever is **installed on this machine**. Discover
installed models (`deriveInstalledOps` / the dep-status cache already answer this), run each of
their workflows minimally, and **report explicitly which models were skipped for missing
weights.** A skipped model must never read as a pass — silent truncation is how a green run
lies. LTX *is* installed here, so this tier alone would have caught MPI-465.

**Tier 2 — the Builder Pod, for full coverage.** The Pod's volume already owns the weights, and
the image bakes nodes from the same `node_lock.json`. That is the natural home for the complete
matrix when a bump lands, and it doubles as the check that the Pod image itself is not stale
(the remote half of MPI-465 is still broken until that image is rebuilt).

**Tier 0 — optional, nearly free.** POST every workflow for validation only and accept *only*
missing-weight errors. Catches node renames/removals and input-schema drift with no weights and
no GPU. Worth having, but **be honest in the docs that it would not have caught MPI-465.**

## Where it hangs

A real **engine-bump playbook** (`docs/playbooks/bump-engine/`, matching the shape of
`add-model/` and `add-flow/`), with the smoke run as a gate, plus:

- research the breaking surfaces FIRST (`feedback_research_first_on_version_breaks`),
- **date the break against our own `node_lock.json` history**, not `git tag --contains` — that
  is exactly what misled the MPI-465 diagnosis,
- re-check every pinned custom node against the new core, since the failure mode here was a
  node calling a core API that changed,
- `mpi-release` should refuse to ship a bumped engine with no smoke evidence.

Keep `mpi-bump-local-comfy` bench-only and cross-reference it; do not overload it.
