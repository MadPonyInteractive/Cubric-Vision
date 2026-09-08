# MPI-674 — `deps-status` is blind to node import failure

Member of **MPI-672**. Read `tasks/MPI-672/plan.md` first — it carries the reproduction and
the release path.

## The defect

`checkUniversalWorkflowDepsStatus()` (`routes/shared.js`) answers "are the universal-workflow
deps installed?" with two checks per dep: **does the folder exist**, and **does its
`NODE_COMMIT_MARKER` match the pin**. Both pass for a pack that is on disk at the right commit
and **fails to import**.

That is the whole failure mode of issue #2. Measured in the repro: removing three curated
packages left all 14 node folders present at the correct pins while 5 packs reported
`IMPORT FAILED` and 595 classes vanished from `/object_info`. `deps-status` calls that healthy.

Consequences:

- The boot repair at `js/shell.js:335` — `/engine/deps-status` → `needsDepsInstall` → the
  repairing modal — **never fires**. The broken state survives every restart, permanently.
- `/engine/repair-deps` and `_installOutstandingUwDeps()` would not fix it either: they
  reinstall missing/drifted **folders**, and nothing here is missing or drifted. The pip pass
  is the thing that is absent, and it is not in that repair set.
- There is no user-reachable repair at all after boot: `MpiEngineInstall` is the only mount
  and it only shows when the engine is missing or needs an upgrade.

## What "done" looks like

- Engine health is judged on **classes actually registered**, not folders on disk. ComfyUI's
  `GET /object_info` is the ground truth and the app already calls it
  (`routes/comfy.js` `/comfy/refresh-models`).
- The app knows which classes a graph needs — `comfy_workflows/*.json` `class_type` values —
  so the check can be an exact set difference, the same assertion the repro harness makes.
  Decide the scope deliberately: every shipped workflow at boot is thorough but slow; the
  selected model's graph before dispatch is cheap and catches the real case. Prefer the
  cheap one unless there is a reason.
- A detected hole leads somewhere: re-run the curated pip pass, then restart the engine, from
  a control the user can reach without reinstalling.
- Keep it honest about cost — this runs on a path that is already slow at boot.

## Verify

`D:\tmp\cu126-repro` is the only place the broken state exists on demand — the detector must
fire against `comfy-nodeps.log`'s engine and stay quiet against the healthy one. Re-create per
the umbrella's harness note. `check-classes.mjs <workflow> <base>` is the assertion in 12 lines.

**Never take the user's app — `npm run app:isolated`, own profile AND port.**

## Files (expected — confirm before claiming)

- `routes/shared.js` — `checkUniversalWorkflowDepsStatus`
- `routes/engine.js` — `/engine/deps-status`, `_installOutstandingUwDeps`
- `js/shell.js` — the boot gate that consumes `deps-status`
- a user-reachable repair surface (new or an existing settings entry)

## This card OWNS the repro harness — including deleting it

`D:\tmp\cu126-repro` (~10 GB) is kept on disk **because this card needs it** (user call,
2026-09-01). It is not stale scratch for a cleanup pass to sweep — leave it until this card
closes.

**Closing this card includes disposing of it.** At close-out: check whether anything else
still needs it (another open member, an unreleased 1.4.3 verification, a follow-up card), and
if not, delete `D:\tmp\cu126-repro` and say so in `validation.md`. If something does still
need it, name what and move the ownership onto that card — do not leave 10 GB owned by nobody.

## Ordering

Phase 2 of MPI-672 — after MPI-673 and MPI-675. Largest of the three. If it cannot land
cleanly in the patch, ship phase 1 as 1.4.3 and carry this to the next release; say so on the
card rather than leaving it implied.
