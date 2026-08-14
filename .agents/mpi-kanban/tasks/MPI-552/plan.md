# MPI-552 — LTX 2.3 v2v: wire the proven bench trio as Flows

Umbrella created by the project-refresh consolidation sweep, 2026-08-13. Three `todo`
cards, one blocker, one playbook.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-536 | LTX 2.3 foley — full-clip V2V audio, `comfy_workflows/raw/ltx_v2v_foley_template.json`, 53 nodes |
| MPI-520 | LTX 2.3 v2v extend — single-stage extend, `comfy_workflows/raw/ltx_v2v_template.json`, 56 nodes |
| MPI-538 | LTX 2.3 lipsync — `comfy_workflows/raw/ltx_v2v_lipdub_template.json`, 35 nodes / 48 links |

Adjacent, deliberately NOT a member: **MPI-455** (end-frame-only conditioning). That is
op-side wiring on the shipped `ltx_i2v.json` graph, not a Flow — same model, different
surface.

## Current State

All three are `blocked` and all three are blocked on the same thing. Nothing app-side has
started; the bench half is finished and user-approved for each.

## Why one card and not three

They share every axis that matters:

- **The same blocker.** MPI-531 — `FlowStepField` is `select|button|toggle` only, so
  authoring any of these today means writing a new JS `uiComponent` that MPI-531 item 4
  then has to port. Three Flows authored the old way is three ports.
- **The same shape.** Each ships as a **Flow, not a model op** — no `ModelDef`, no
  `supportedOps`, no dep entries. They all run on the already-wired LTX 2.3 checkpoint
  (memory `project_ltx_workflows_land_as_flows`). The route is `/mpi-add-flow` and its
  playbook, never `/mpi-add-model`.
- **The same injection contract.** MPI-537 phase 4 settled it: `Input_Video`,
  `Input_Audio`, `Input_Positive`, `Input_Negative`, `Input_Seed`, `Output_Video`. MPI-538
  already carries it, so no rename pass is owed there.

Doing them one at a time means paying the `uiComponent` port three times and re-deriving
the same Flow-descriptor shape three times.

## Phase 1: Clear the blocker

MPI-531, at least item 4 — the field types these three Flows actually need. Until
`FlowStepField` can express them as data, every Flow here is authored in a shape 1.6's
third-party manifest cannot carry (MPI-532). This phase is not owned by this umbrella;
it is the gate, and the gate is someone else's card.

## Phase 2: Foley first

MPI-536. It is the one that also owns an open product decision — the foley-vs-voice mode
choice that MPI-520 was wrongly carrying — so settling it first stops the other two from
inheriting a guess. Read `tasks/MPI-4/brief.md` and `validation.md` before starting.

## Phase 3: Extend, then lipsync

MPI-520, then MPI-538. Extend needs `Input_Width`/`Input_Height` restored as `MpiInt`
(a linked widget-input, per the card). Lipsync is last and cheapest: its contract is
already correct, so it is mostly descriptor plus media I/O.

## Verification

Per member, the `/mpi-add-flow` playbook's own gates — `docs/playbooks/add-flow/`. The
Flow Library is dev-gated, so none of this gates a release. A real generation is the only
proof that counts: spin your own app (`npm run app:isolated`), never the user's `:3000`.

## Parallel Batch

None while phase 1 is open. After it lands, MPI-520 and MPI-538 could run as a pair —
different workflow JSONs, different descriptors — but they both touch
`js/data/flowsRegistry.js`, so either sequence them or give one owner both files.

## Plan Drift

**2026-08-14 — phase order changed: EXTEND went first, not foley.**

Phase 1 (the MPI-531 blocker) landed, and turned out to need more than the card said: field
types alone do not unblock anything, because `fields` render on middle steps only and the run
slide's controls came solely from `props.uiComponent`. So item 1 shipped together with
`FlowDef.controls` — declared run-slide controls, `Input_*` ids routed into `injectionParams`.

Then the order changed, on a fact this plan did not have: **foley and lipsync each need a
weight that is not a dep yet** (`ltx-2.3-22b-lora-foley-v2a-1.0`,
`ltx-2.3-22b-ic-lora-lipdub-0.9`), so both are gated on an R2 stage + a `dependencies.js`
entry before they can install for anyone. **Extend needs no new weight at all** — every loader
in its graph is already an LTX 2.3 dep — so it was the only one wire-only today, and it went
first as the proof that a Flow can ship with no JS component.

The foley-vs-voice decision this plan wanted settled first (MPI-536) did NOT leak into extend:
extend exposes no audio control, and its resolution decision is the opposite of foley's by
design (recorded in both cards + `existing-flows/ltx-extend.md`).

Remaining order: foley (owns the mode decision), then lipsync. Both should copy
`docs/playbooks/add-flow/existing-flows/ltx-extend.md` rather than re-deriving the shape.
