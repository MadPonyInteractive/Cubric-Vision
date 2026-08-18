# MPI-576 plan

Root cause is in `brief.md` and needs no further investigation. One structural change,
two toast sites read it.

## Current State

2026-08-18: reported and root-caused, not started. Card is `todo` / `planned`.

## Ownership (write into `files.json` at `todo → doing`)

`js/services/downloadService.js`, `js/shell/notificationService.js`,
`routes/downloadManager.js`, `js/shell.js` (job-id constants only),
`js/events.js` (the `download:complete` payload doc), plus a test.

## Remaining Work

1. **Give the completion a fact instead of a guess.** `download:complete` gains a field the
   server already knows — whether that job actually installed anything (bytes written /
   deps that were absent before) versus short-circuited on already-present. Emit it from
   every `_broadcast('download:complete', …)` site in `routes/downloadManager.js` (lines
   770, 2051, 2179, 2470, 2557, 2570, 2753) and document it in `js/events.js`.
   **Verify:** a re-install of an already-complete model carries the no-op value; a genuine
   install carries the real one.
2. **Cascade toast reads that field.** `downloadService.js:600-618` keeps the shared-dep
   cascade (it is a real case) but fires only when the completion actually installed
   something. Delete the `preSync` registry diff — it cannot tell a download from an engine
   switch.
   **Verify:** connect to a Pod holding N installed models → ZERO "installed." toasts.
   Install a model whose deps complete a second model → the second still toasts.
3. **Silent internal jobs by construction.** Replace the `'engine:assets'` literal
   allowlist in `notificationService.js:212-214` with a property of the job (a `silent`
   flag, or the `engine:` namespace itself), so `engine:node-drift` and the next
   `engine:*` id are covered without an edit. Keep the `__universal_workflow__` and
   `plugin:` handling intact.
   **Verify:** a first connect that heals node drift shows no toast and no OS
   notification; `tests/engine-assets-silent-install.test.cjs` still passes, extended to
   cover node-drift.
4. **Check the third symptom** — `Model "krea2" is not installed — cannot reuse full
   prompt.` fired during the same window. Decide whether reuse-prompt reads install-state
   at a moment the connect-edge re-sync has not settled. If yes it is the same window and
   folds in here; if not, report it and leave it.
   **Verify:** reuse-prompt on a Krea 2 card immediately after a connect works.

## Verification

**Verify mode:** `user-ux`

The whole card is a toast/notification surface on a live Pod connect, so Fabio's own connect
is the evidence. The unit-testable half is step 3's silent-job test.
