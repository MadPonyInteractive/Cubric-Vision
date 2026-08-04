# MPI-385 Validation

This card holds the LIST. Evidence goes on the MEMBER cards' `validation.md`
(`brief.md` step 2). What lands here is only the session-level record: what was
connected, what was walked, what was skipped and why.

## Session log

### 2026-07-30 — THE sweep session. Queue cleared.

Pod `qrpnumt8p1rm31`, L4 @ EU-RO-1, volume `9t3awufudk`, dev image `v0.17.0-dev-cu130`,
wrapper dev 0.2.40. Fresh app process before the first connect (MPI-393's latch). Four
connects total (initial + one warm-resume + two restarts for the MPI-393 positive leg).
Local 8188 bench was CLOSED the whole session — no dispatch-leak risk. Volume
139.36GB/150GB, byte-flat across the session apart from the user's own klein-4b
uninstall/reinstall.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | MPI-380 SAM3 points | **PASS** | `MPI-380/validation.md` § POD LEG — engineAsset delivery + no points PNG, graph-proven |
| 2 | MPI-384 SAM3 text | **PASS** (wiring) | `MPI-384/validation.md` § REMOTE RUN — `dog:1` as text; big-subject miss characterized |
| 3 | MPI-346 drift ladder | **PASS** | `MPI-346/validation.md` § REMOTE LEG — `fit_mode` on volume + live seed→heal round-trip |
| 4 | MPI-135 DC-steer | **conditions absent** | No scarce card, no maintenance host, no ephemeral retry this session — creates/resumes all succeeded first try. Stays logic-verified-only; line stays in the brief |
| 5 | MPI-328 fail-open | **no false flip** | Boot-404 window handled by the client-side defer (`remote models/check deferred — Pod wrapper still booting`); no model flipped installed, counts stayed truthful. The specific `short answer` server line never fired — no partial wrapper answer occurred, so the fail-closed path itself went unexercised. Card stays closed on its local evidence |
| 6 | MPI-396 uninstall settles store | **PASS** | `MPI-396/validation.md` § REMOTE LEG — no job, no bar; reinstall clean at 203MB/s |
| 7 | MPI-397 re-measure | **install fixed, uninstall ~3s** | `MPI-397/validation.md` — card stays parked, product call is the user's |
| 8 | MPI-393 drift heal | **PASS, positive leg live** | `MPI-393/validation.md` § LIVE-PROVEN — seeded old-commit drift, heal re-cloned 46KB, volume +29KB, both log lines |

Bonus riders on the same connects: warm-resume reconnect (stop-warm → resume, auto-connect)
worked all three times; `engine:assets` dedupe no-op re-proven per session; klein-4b
survived a stop/resume cycle.

Not run: MPI-346's two-reference-edits bonus (no edit ops this session); MPI-380's
large-image smoke (no retirement claim rides on it).
