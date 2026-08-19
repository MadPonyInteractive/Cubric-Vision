# MPI-577 — the drift the drift-hook cannot see

Carded out of the Mpi-Kanban 1.2.0 project refresh, 2026-08-19.

## What happened

The refresh found **11 handoff records where `state/index.json` and the record
file disagreed about the same handoff**:

- **10** files still said `"status": "open"` after the index entry had already
  recorded them superseded (their index `note` literally reads
  *"Superseded by …"*).
- **1** — `44bcd4be` / MPI-325 — the mirror image: the index said `open` while
  the file carried its own closure note (*"Resolved 2026-08-17: the pack was
  pushed + pinned … MPI-325 closed"*) and the card was already in `done`.

Both halves matter because the two sides are read by different things. Whoever
reads the record file resumes from a handoff that was superseded days ago;
whoever reads the index gets a different answer for the same id. Neither reader
has any signal that the other exists.

This is not a first offence. The 2026-08-13 refresh pruned this exact list
(`active_handoffs`, 9 records where 1 was live). Six days later it held 19
records, 16 of them not open.

## Root cause

[.claude/hooks/handoff-index-drift.py](../../../../.claude/hooks/handoff-index-drift.py)
does two comparisons and needs three.

`read_state()` throws the index status away before anything can compare it:

```python
indexed = {_stem(e) for e in json.load(fh).get("active_handoffs", [])}
```

That is a **set of ids**. The entries' `status` field never survives the read,
so `analyze()` is not merely missing the check — it is structurally incapable
of it. What it does check:

| check | catches |
|---|---|
| `unindexed` | file is active, id absent from `active_handoffs` — a hand-written handoff |
| `stale` | id is indexed, file's status is not active — a closed/deleted record still indexed |

Run those against the 11:

- The **10** were indexed, and their files said `open`, which IS in
  `ACTIVE_STATUSES`. Both checks pass. **Silent.**
- The **1** (`44bcd4be`) had a `resolved` file while indexed, so `stale` *did*
  fire. The hook was very likely warning about it on every Stop and the warning
  went unheeded — worth a thought about whether a Stop-time stderr line is
  loud enough for a backlog, separate from the missing check.

## The fix

Keep the status when reading the index, and add the third comparison:

- `read_state()` returns `{id: status}` for the index side, not a set of ids.
- `analyze()` gains a `desynced` list: ids present on both sides whose index
  status and file status differ.
- `build_message()` reports it with its own line, naming *which side* looks
  stale, since the repair direction is not always the same one — see below.
- `_selftest()` gains both directions: index `resolved` / file `open`, and
  index `open` / file `resolved`.

Keep the existing behaviour intact: advisory, `sys.exit(0)`, never blocks.

**Neither side is automatically authoritative.** In this batch the index was
right 10 times (its notes described the supersession) and the file was right
once (it carried the closure note and its card was `done`). So the hook should
*report* the disagreement and point at the evidence — it must not silently pick
a winner and repair.

## Already done — do not redo

The 11 records were repaired by hand in **commit `908343a0`**, each toward
whichever side held the evidence, and `active_handoffs` was pruned 19 → 3
(MPI-568, MPI-507, MPI-504 — all genuinely open). Post-repair verification: the
board validator passes and the mismatch count is zero. This card is only about
the hook that should have caught it.

## Verify

The hook ships a self-check. It must pass before and after:

```bash
python .claude/hooks/handoff-index-drift.py --selftest
```

A synthetic desync in a temp state dir is the real test — the bug is that the
current code returns clean on input it should flag, so a new assertion has to
**fail against today's `analyze()`** before the fix lands. A test that passes
both before and after is testing nothing.
