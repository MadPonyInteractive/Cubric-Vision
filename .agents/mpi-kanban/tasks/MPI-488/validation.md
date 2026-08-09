# Validation — MPI-488

**Fixed upstream. Closed 2026-08-09 without a local change.**

Both mitigations this card asked for shipped in the Mpi-Kanban plugin:

1. **The mkdir lock.** `<mpi-lib>/task-board-ops/mutate.md:105-111` now creates the
   task folder with `os.mkdir(".agents/mpi-kanban/tasks/<id>")` and states plainly
   that "that mkdir **is** the lock - exactly one agent wins it". On
   `FileExistsError` the loser re-reads `board.json` and retries at the next free
   ID, so a herd of N creators converges instead of destroying each other. This is
   mitigation (1) from the card description, implemented as specified.

2. **The clobber fingerprint.** `<mpi-lib>/scripts/validate_board.py` ships with the
   plugin and is runnable as `python <that path> .` from the repo root. Measured on
   this board 2026-08-09: **0 violations, exit 0.**

The three 2026-08-08 incidents named in the description (MPI-484, MPI-485, MPI-486)
remain the reason this card existed; nothing about them is retracted. What changed is
that the race they exploited is no longer reachable through the documented path.

**Not carried over:** the card also proposed writing the trap into
`.claude/rules/kanban.md`. Deliberately skipped — documenting a race the plugin now
prevents is exactly the duplication the 1.0 migration exists to remove.

**Verified:** `python "$CLAUDE_PLUGIN_ROOT/skills/mpi-lib/scripts/validate_board.py" .`
-> `Board validation passed.`
