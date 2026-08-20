# MPI-577 Checklist

- [x] Prove the bug against today's code — a synthetic desync (index `resolved`,
      file `open`) in a temp state dir returns `analyze() -> ([], [])` and
      `build_message() -> None`. Silent, exactly as the brief says.
- [x] `read_state()` keeps the index status: `{id: index_status}`, not a set of
      ids. A legacy bare-path entry states no status -> `None`.
- [x] `analyze()` returns a third list, `desynced`, of
      `(id, index_status, file_status)` for ids BOTH sides list and disagree on.
- [x] A desync is reported once, not twice — it takes precedence over `stale`,
      because it says everything `stale` would and names which side claims what.
      A MISSING file stays `stale` (there is no status to compare against).
- [x] `build_message()` reports it on its own line naming both sides, plus the
      "neither side is authoritative" pointer at the evidence.
- [x] Self-check covers both directions (index resolved / file open, and index
      open / file resolved) and a real `read_state()` round trip through a temp
      state dir — the status was lost inside `read_state()`, so a pure-`analyze()`
      test alone would not have caught it.
- [x] Behaviour unchanged: advisory, stderr, `sys.exit(0)`, never blocks.
- [x] Replayed against the real pre-repair state at `908343a0^`: 11/11 flagged.
