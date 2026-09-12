# Gallery batch cue, and the op-surface corrections it surfaced

UMBRELLA. Created 2026-09-12 from one design conversation with Fabio that started as a
batch-processing feature request and turned up two unrelated corrections on the way.

**This is a multi-session thread worked with `/mpi-handoff`.** Every member is written
to be picked up cold from this file plus that member's own `plan.md` — no session
carries state the next one needs.

## Current State

Project mode: **scalable-foundation** — full guardrails, decisions front-loaded, no
prototype shortcuts.

**Where this came from.** Fabio's photographer friend asked for a watch folder: drop
images in, have Cubric Vision run the same operation on all of them. Fabio proposed a
better shape instead — import into a project, select the cards, and queue the current
operation across all of them. Working that design out required reading the op strip,
the queue and the prompt box, and that reading turned up a stale set of comments and
re-opened a decision about PiD. Hence three members, only the first of which is the
original ask.

**One thing was checked and needs NO card — do not create one.** The user-facing
collapse of `edit` / `krea2Edit` / `qwenEdit` / `kleinEdit` onto **Edit**, and `pid`
onto **Upscale**, already shipped in MPI-660 via each op's `short`
(`js/data/commandRegistry.js:1716`). It covers the op strip label *and* the saved
filename / gallery card name (`getFilePrefix`), so a user has never seen an internal
key. The keys themselves must stay distinct: different `mediaInputs` slot counts
(`edit` 1, `kleinEdit`/`qwenEdit` 2), different controls, `item.operation` persisted in
every `.meta` sidecar (merging orphans every existing card's op — the MPI-453 dead-op
case), and `operation_registry.json` version-tracks each key.

## Members and phase order

| # | card | what | maturity |
|---|---|---|---|
| 1 | **MPI-733** | Cue all — batch a gallery multi-select through the current prompt-box recipe | `planned` |
| 2 | **MPI-734** | PiD is not deprecated — it stays as a model that brings its four upscale plugins | `needs-decision` |
| 3 | **MPI-735** | Stale comments claim the edit ops show a ratio picker | `planned` |

**The three are independent** — disjoint files, no shared seam, no ordering constraint
between them. Take them in whatever order suits the session. Recommended order and why:

1. **MPI-735 first** — two comments in one file, finishable inside a few minutes, and
   it stops the next reader of `commandRegistry.js` believing something false. Doing it
   first costs nothing and removes a trap from the file MPI-733 reads most.
2. **MPI-733 next** — the actual feature, fully specified, no open decisions left. One
   session should carry it end to end; if it does not, its plan's phases are the
   handoff boundary.
3. **MPI-734 last, and it opens with a decision gate.** Its Phase 1 is research, and
   Phase 2 onward must not start until Fabio has chosen between resolutions (a) and
   (b). A session that reaches the gate without him available should hand off rather
   than pick.

MPI-734 is **also** a member of the pre-existing upscaler umbrella **MPI-553**
(members MPI-506 → MPI-507 → MPI-515). It partly reverses that umbrella's third phase,
and Phase 2 of MPI-734 is what reconciles MPI-553's plan with the new decision. Read
`tasks/MPI-553/plan.md` before touching any of those cards.

## Completed

- [ ] Nothing yet.

## Remaining Work

No `## Parallel Batch`. The three members are independent and could in principle run at
once, but two of them are single-file jobs and the third is a UI feature whose whole
verification is Fabio looking at it — dispatching workers would cost more in briefing
than it saves, and MPI-734 cannot start at all until a decision it does not own has
been made. Work them sequentially through `mpi-continue`.

## Phase 1: MPI-735 — the stale comments

- [ ] Work `tasks/MPI-735/plan.md` to completion.
      **Verify:** that card's own Phase 1 verify — the three comment blocks in
      `commandRegistry.js` agree with each other and with `imageSizedOps`, lint clean.

## Phase 2: MPI-733 — Cue all

- [ ] Work `tasks/MPI-733/plan.md` to completion, phases 1–4.
      **Verify:** that card's end-to-end criterion — five photos selected with
      `upscale` remembered produce five queued jobs, each traceable to its own source
      image through its `.meta` sidecar — plus Fabio's own look at it in the running
      app (`user-ux`).

## Phase 3: MPI-734 — PiD

- [ ] Work `tasks/MPI-734/plan.md`, stopping at its Phase 1 decision gate.
      **Verify:** `tasks/MPI-734/research/install-status.md` exists and names the file
      and function behind every claim; Fabio's (a)/(b) answer recorded in that card's
      Plan Drift with the date.
- [ ] Complete MPI-734 phases 2–4 on the chosen resolution.
      **Verify:** that card's own criteria; board validates clean after the MPI-507 /
      MPI-515 / MPI-553 amendments.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Two of the three members end in something Fabio has to look at. The umbrella is closed
only when all three members are in `done` and the board validates clean — there is no
separate integration step, because the members share no code.

## Preservation Notes

- Docs owed, per member: `docs/gallery.md` (MPI-733); `docs/plugins.md` and possibly
  `docs/generation-lifecycle.md` § "An UNINSTALLED operation is undispatchable"
  (MPI-734 — that paragraph currently states the partial-install state is unreachable,
  and resolution (a) would make it false); nothing (MPI-735).
- **Never edit `.claude/rules/` without asking Fabio first** (CLAUDE.md cardinal rule
  5). None of the three members is expected to need it.
- Check MPI-533 (deprecation tombstone ledger) before closing MPI-734 — PiD was going
  to be a tombstone and now is not.
