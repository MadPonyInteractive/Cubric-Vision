# MPI-574 — Memory reorg 4: codebase facts out of agent memory, into docs/ and rules

## Why

The agent's private memory directory (`~/.claude/projects/c--AI-Mpi-Cubric-Vision/memory/`) had
drifted back into holding **codebase** knowledge — route payload shapes, script flags, component
APIs, measured model verdicts. That is the failure mode three previous reorgs (MPI-399,
2026-08-07, MPI-521) each had to undo, and it costs twice:

- **Nothing in the repo can see it.** Memory is private and unversioned, so a fact stored there is
  invisible to the user, to CI, and to every other agent session.
- **A code change cannot sweep it.** A doc entry dies with the code it describes when someone
  greps for the symbol; a memory entry silently rots. Two entries in the 2026-08-07 pass were
  actively WRONG where the doc was right.

Requested by Fabio, 2026-08-17: *"re-organise memory and make sure that anything that can land in
our documentation and rules comes out of memory and into the appropriate place."*

## The dividing test (now written into MEMORY.md)

> Would this fact still be true if someone rewrote the code it came from?

**No → `docs/` or `.claude/rules/`.** A route's payload shape, a script's flags, a component's
API, a measured model verdict.

**Yes → memory.** How to drive this Windows box, which port the bench is on, what Fabio decided
and why, how I should work. None of that is in the repo at all.

## Scope

All 106 files in the memory directory were read, not sampled — the index summaries hide facts
embedded in file bodies, which is how the previous passes left residue.

## Outcome

25 facts migrated, 18 memory files deleted, 5 slimmed to their environment-only half, 1 normalised
to the standard frontmatter shape. Three new docs. Memory went 106 → 88 files and `MEMORY.md`
200+ → 129 lines. Full detail in `validation.md`.

Deliberately NOT migrated: the `feedback_*` files. Each was checked and the codebase facts they
cite already live in docs (the stall watchdog's zero-byte trigger, `MpiOkCancel.show()`,
`OUTPUT_NODE` always executing, the `Mpi*` node wrapping, app.log's 256 KB rotation) — what
remains in them is working discipline, which is what memory is for.
