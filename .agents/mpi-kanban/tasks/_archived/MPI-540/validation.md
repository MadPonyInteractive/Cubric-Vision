# Validation

## 2026-08-12 — confirmed over a normal session, and shipped in 1.4.1

**Result: PASS.** Fabio, asked directly: *"no, I have not seen a late completion
toast since the fix."* That covers a full working session across 2026-08-11 —
model installs, a Pod connect/disconnect drill, and generations — which is the
condition the card was waiting on.

This was always an absence-of-event proof, so it could never arrive positively;
the bar was a normal session with the fix live and no recurrence. It is met, and
the fix shipped publicly in v1.4.1.

### What was fixed

`_doneCount` in `js/shell/notificationService.js` had no expiry, so a batch whose
queue never drained cleanly left its count behind and the NEXT drain announced it —
completions reported ten or twenty minutes late, once over an hour. Commit
`ef3ebd2e` stamps `_doneAt` and drops a count older than 5 minutes, checked on
BOTH edges (before counting a new completion AND at the top of `_maybeArmFlush`).
A fire-time check alone is not enough: a fresh completion re-stamps the time and
the orphans ride along as N+1.

Covered by `tests/notification-stale-count.test.cjs` (3 tests, mutation-checked —
removing the expiry fails each with its intended message).

### What was deliberately NOT done

The coalescing stayed. Deleting it was the lazier fix and would have returned
per-generation notification spam on a queue of N, which is the bug coalescing was
added to solve. The 5-minute expiry keeps both.

The focus-based notification routing also stayed, despite Fabio's initial theory
that it was the carrier. `main.js` `showOsNotification` fires on receipt and
returns early when focused, and `statusBar.js` has no focus-deferred replay — so
nothing downstream defers, and stripping it would have removed a working feature
while leaving the bug untouched.

### Known ceiling (recorded, not a defect)

The staleness window is wall-clock, not a batch id — marked with a `ponytail:`
comment at the call site. A batch id threaded from the queue would be exact but
needs a new field through `generationService` and `commandExecutor`. The visible
cost is an undercount when one batch has a >5min gap between items.

### Reopen if

A completion notification announces generations that ended more than ~5 minutes
earlier. That would mean the carrier is something other than `_doneCount`, and the
first place to look is a second count holder, not this expiry.
