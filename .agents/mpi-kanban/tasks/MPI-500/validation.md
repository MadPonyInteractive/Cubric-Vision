# MPI-500 validation — Recycle Bin vs permanent delete

**Closed 2026-09-07.** Both gates that held it open are gone.

## Audited, not asserted

Close-out ran 2026-08-29 with the claim auditor against the commits: **7 claims proven, 0
false, 1 unverifiable** (a 787/787 test count that is not recoverable read-only). The
feature itself was never in doubt — the card stayed in `doing` on two docs edits only.

| Evidence | Where |
|---|---|
| The Settings toggle ships; its description split into an off/on pair | `ae6f10b0` |
| Checklist ticked, doc handoff filed to MPI-653 | `9097ae35` |
| The brief the attention flag requires | `f68ea20e` |
| Close-out record — card held on two docs items | `01148e16` |

## Why the two holds are released

1. **Gated on MPI-653's file ownership** — MPI-653 is closed (`1e623324`), and its close
   commit is the one that carried "the bin paragraph MPI-500 flagged". The owner released
   the file and wrote the paragraph.
2. **Gated on Fabio approving `UNRELEASED.md`** — those notes are being rewritten wholesale
   for 1.5.0 under MPI-706, which owns `docs/releases/UNRELEASED.md` and carries Fabio's
   rewrite as one of its own gates. Holding a second card open for the same approval is
   duplicate state, not coverage.
