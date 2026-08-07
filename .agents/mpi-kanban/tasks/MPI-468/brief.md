# MPI-468 - Engine bumps: dispatch notes for a separate session

This card is a **handle**, not work. It exists so one agent can be handed one id and own
both engine-bump cards without colliding with the LTX/H3 work running in this repo.

## Why the umbrella exists

[MPI-457](../MPI-457/task.json) and [MPI-467](../MPI-467/task.json) were written days apart
and overlap on the deliverable that matters:

- 457 acceptance already claims *"a skill exists for the repo-side bump"*, *"the skill's floor
  check is EMPIRICAL"*, *"the skill checks the target version actually has a portable release
  asset"*.
- 467 wants `docs/playbooks/bump-engine/` with the smoke run as a gate.

Two cold agents, one playbook, guaranteed overwrite.

## Ownership split - do not cross it

| Card | Owns | Files |
|---|---|---|
| **MPI-457** | The MECHANIC | `routes/engine.js` (`/engine/upgrade` in-place path, the wipe as a *decision*), the repo-side bump **skill** |
| **MPI-467** | The GUARD | `docs/playbooks/bump-engine/`, the smoke runner, the `mpi-release` refusal |

The skill **calls** the playbook. It does not restate it. If the split feels wrong once the
work starts, change it explicitly on both cards before writing - do not let both agents
"just also touch" the playbook.

## Build order

1. **Playbook skeleton first** (467). It is the file both cards write into; get its headings
   fixed before the mechanic lands, so 457's skill has something to call.
2. **Mechanic** (457): in-place `git fetch --tags` + checkout the pinned sha + pip only the
   changed core packages + restamp `.mpi_engine_version`. The sequence was already proved by
   hand on `0.29.2 -> 0.30.0` under MPI-449/452 - read that card's handoff rather than
   re-deriving it.
3. **Smoke runner** (467). Tier 0 (validation-only, no weights, no GPU) is free and can be
   built in full without touching the GPU. Tier 1 (executing, installed models only) is the
   one that would have caught MPI-465.
4. **Release gate** (467): `mpi-release` refuses a bumped engine with no smoke evidence.

## Machine constraints - read before planning any run

- **One GPU, and it is busy.** This repo's owner is running LTX authoring on the bench and
  Vision on the app engine. An executing smoke pass cannot run in parallel with either; it
  has to be scheduled with the user.
- **Ports are taken:** app = `3000`, its engine = `48188`, the user's bench = `8188`. A
  manual engine left on 48188 makes the app fail to start. Do not claim 48188.
- **LTX cannot be smoked locally right now.** The fp8/mxfp8 weights were deleted on
  2026-08-07 and the 41GB bf16 was never on this drive; the int8 replacement is not wired
  until [MPI-466](../MPI-466/task.json) ships. This is the exact case 467's own rule covers:
  a skipped model must be reported as skipped, never as green.
- **Do not edit `dev_configs/node_lock.json`.** KJNodes was just bumped there
  (`c077efa9`, MPI-465) and a parallel session is moving the core pin `0.30.0 -> 0.30.2`.
  Anything this work needs from the lock is READ-only.

## Briefing a cold agent

Sub-agents start with zero repo context. Before dispatch, run `/mpi-brief-rule comfy_engine`
and paste it with CLAUDE.md's Critical Rules Snapshot and THE ROOT-CAUSE RULE. Then point at:

- `.agents/mpi-kanban/tasks/MPI-467/brief.md` - the post-mortem and the three smoke tiers
- `.agents/mpi-kanban/tasks/MPI-465/brief.md` - the regression this whole umbrella answers,
  including *why dating the break by `git tag --contains` misled the first diagnosis*
- `docs/versioning.md` section COMFY_VERSION - the only written guidance today, two lines
- `.claude/rules/comfy_engine.md`

## What "done" looks like

Both children close, or the survivor states in writing what was dropped. The gate is wired
into `mpi-release`, not merely documented - a playbook nobody's release flow consults is how
MPI-465 shipped in the first place.
