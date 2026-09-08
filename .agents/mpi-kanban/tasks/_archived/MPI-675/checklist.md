# MPI-675 Checklist

Derived from `tasks/MPI-675/brief.md` § "What 'done' looks like" (this card has no
`plan.md` of its own — the umbrella plan is `tasks/MPI-672/plan.md`).

- [x] Replace `/github/create-issue` with a credential-free `POST /github/issue-url`
      returning `{ url }` — prefilled bug-report template URL, `redactSecrets()`
      on every field, no `GITHUB_TOKEN`, no network call
- [x] Error dialog opens that URL (`open-external` IPC, `window.open` fallback)
- [x] Error dialog can hand the user the log file itself — `POST /logs/reveal`,
      which resolves the path server-side so the client never plumbs it
- [x] No report branch ends in `clientLogger.error(...)` + `return` — every failure
      surfaces in `.mpi-error-dialog__status` with the URL / log path as selectable text
- [x] `bug-report.yml` names the per-OS log path
- [x] Sweep the dropped route: dead test in `runpod-remote-hardening.test.cjs`,
      `docs/versioning.md` deriveStage mirror note, `cubric-vision/SKILL.md` route table
- [x] `tests/issue-report-url.test.cjs` passes with `GITHUB_TOKEN`/`GITHUB_REPO` deleted
- [x] `npm test` (835/835) + `npm run lint` green
- [x] Seen working in `npm run app:isolated` — both buttons, both failure paths
- [x] User confirmed the dialog, and screenshotted Explorer landing on `app.log` selected

## Folded in — found while implementing

- [x] `MpiButton` renders `label`, not `text`, once `icon` is set. The old Report
      button hid this by passing the same string to both; the new log button showed
      its long accessible description as the visible caption. Both buttons now pass
      `label` + `info` (tooltip), no `text`.
- [x] Modal widened 480 → 560: three buttons wrapped Dismiss onto its own row.
- [x] `js/core/appStage.js` docblock corrected — it claimed the backend re-derives
      stage and never trusts the client. That backend copy is gone, and it had
      **already drifted** (see validation.md).
