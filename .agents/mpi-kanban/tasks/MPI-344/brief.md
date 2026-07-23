# MPI-344 — Vast.ai as a second remote-engine provider (PARKED / backlog)

**Status: investigated 2026-07-23, PARKED in backlog by user decision. Revisit in a few weeks.
Do NOT start work without a fresh go-ahead.**

## Where the findings live (READ THIS FIRST)
**Curated, durable research → [`docs/vast-ai-research/`](../../../../docs/vast-ai-research/README.md)**
- `README.md` — the decision: motivation, verdict, the two red flags, the billing myth-check, what to probe first.
- `api-parity.md` — Vast REST API + RunPod→Vast parity table.
- `integration-map.md` — what changes in OUR code + effort.

Raw session evidence (deep-dive): `research/01-viability.md` in this task folder.

## One-paragraph summary
Viable but **ephemeral-only** — Vast has no network volumes (verified against the primary
storage doc), so our persistent-model-library design has no equivalent; Vast maps only onto
our existing MPI-78 "Any region (no volume)" ephemeral path. **User's two red flags
(2026-07-23):** (1) ephemeral kills the multi-model user — 5-10 models re-download every
session; (2) per-byte bandwidth billing, unpublished rate, can eat the whole GPU-hour saving.
The Discord claim that motivated this ("Vast only charges during inference") is mostly a
misunderstanding — that's Vast's serverless product, not the instance model we'd use; a normal
instance bills per-second whenever running, same as RunPod. Feared blocker (CUDA driver floor)
turned out solved by Vast's `driver_version`/`cuda_max_good` filters. Effort ~3wk prototype /
5-6wk robust, after 3 prerequisite refactors.

## When un-parked: do the PROBE before any code
A few-hour, <$5 live probe on one instance — see `docs/vast-ai-research/README.md` § "What to
do FIRST". Bandwidth cost is the highest-value unknown; it can make the whole thing pointless.
Live Pod/instance ops are USER-run.
