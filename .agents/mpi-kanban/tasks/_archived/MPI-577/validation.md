# MPI-577 Validation

## 1. The new check fails against the pre-fix code (so it tests something)

The pre-fix source exec'd in memory from `git show HEAD:...` (no working-tree
mutation, no `git checkout --`), fed a synthetic desync — index entry
`status: resolved`, record file `status: open`:

```
OLD read_state indexed = {'aaaaaaaa-1111'}          <- status thrown away
OLD FAILS AS EXPECTED: index status thrown away
OLD message = None                                  <- the bug: silent
```

Same input after the fix:

```
read_state -> ({'aaaaaaaa-1111': 'resolved'}, {'aaaaaaaa-1111': 'open'})
message    -> "  - aaaaaaaa: index says resolved, file says open"
```

## 2. Self-check passes

```
$ python .claude/hooks/handoff-index-drift.py --selftest
selftest OK
```

New assertions: both desync directions, the report-once rule (a desync is not
also listed as `stale`), a missing file staying `stale`, a legacy bare-path
entry raising no false alarm, and `_selftest_read_state()` — a real
`read_state()` round trip through a temp state dir, which is where the status
was being dropped.

## 3. Replay against the real 2026-08-19 batch

The fixed hook run against the actual pre-repair state at `908343a0^` (20 record
files, 19 indexed) — the exact drift this card was carded out of:

```
handoff files at 908343a0^ = 20
unindexed=0 stale=5 desynced=11
   ('23129362-...', 'resolved', 'open')
   ... 9 more in that direction ...
   ('44bcd4be-...', 'open', 'resolved')     <- MPI-325, the mirror case
```

11/11, split 10 + 1 exactly as the brief describes.

The pre-fix code on the same state: `unindexed=0 stale=6` — it saw only
`44bcd4be`, and only as a generic stale entry with no direction. The other 10
were invisible to it.

## 4. Live state and the Stop path

```
$ echo '{"session_id":"x"}' | python .claude/hooks/handoff-index-drift.py
exit=0        (silent — the post-908343a0 state is clean, so no false alarm)
```

Still registered in `.claude/settings.json` line 25. Advisory only; `sys.exit(0)`
is unchanged, so it can never block a Stop.

## Not done (deliberate)

The hook reports the disagreement and points at the evidence; it does not pick a
winner or repair. In this batch the index was right 10 times and the file once,
so an auto-repair would have been wrong once out of eleven.

The brief's second thought — whether a Stop-time stderr line is loud enough for
a backlog that rotted six days — is untouched. The existing `/mpi-cleanup` nag
fires above 3 findings and now counts desyncs toward that total, which is the
cheap half; anything louder is a separate call.
