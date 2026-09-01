# MPI-675 — A reporter can never send us a log

Member of **MPI-672**. Read `tasks/MPI-672/plan.md` first. This card is **phase 1, first** —
until a reporter can send a log, every future engine bug costs the same multi-hour
investigation issue #2 did.

## The defect — three compounding failures

**1. The "Report on GitHub" button is dead in every release, and fails silently.**

`MpiErrorDialog` (`js/components/Compounds/MpiErrorDialog/MpiErrorDialog.js:101`) fetches
`/logs/read` and POSTs `/github/create-issue`. That route reads:

```js
const token = process.env.GITHUB_TOKEN;
const repo  = process.env.GITHUB_REPO;
if (!token || !repo) return res.status(500).json({ success:false, error:'GitHub credentials not configured' });
```

Those come from `.env` via `require('dotenv').config()` in `server.js:22`. **`.env*` is
excluded from the portable build twice over** — `APP_COPY_EXCLUDES` and
`if (rootName.startsWith('.env')) return true` in `scripts/build-portable.mjs` — verified by
calling `shouldExcludeAppPath('.env')` directly, which returns `true`. CI never injects one
either (`build-portable.yml`'s only secret is `MPI_CI_WORKFLOW_TOKEN`, for dispatching the
build). Nothing else in the repo sets `GITHUB_TOKEN`.

So the route 500s for every shipped user, and the client does:

```js
if (!createData.success) { clientLogger.error('error-dialog', '...', createData.error); return; }
```

No toast. No fallback. No browser opened. The button looks alive and does nothing. Same code
at v1.4.2 and master HEAD `75d92e4c`. Zero `auto-report`-labelled issues have ever been
created on the repo, consistent with this.

**2. `GET /logs/download` exists and has no UI caller.** `routes/system.js` serves the log as
an attachment; `grep -rn "logs/download" js/` returns nothing. There is no in-app way to get
the file.

**3. The issue template names no log path.** `.github/ISSUE_TEMPLATE/bug-report.yml:74` says
"Paste only the relevant ending lines from the app log" without saying where it lives, and the
field is optional.

Issue #2 arrived with an empty log tail. That was not the reporter being unhelpful — it was
not obtainable.

## Do NOT fix this by shipping a token

A GitHub write token inside a portable app that anyone can unzip is a credential leak, not a
fix. The auto-file route is the wrong shape for a released build.

## What "done" looks like

- The error dialog gives the user something that works offline and with no credentials:
  save/copy the log, and open a **prefilled** GitHub issue URL in the browser
  (`.../issues/new?template=bug-report.yml&...`) with version, build hash and the error
  already filled. A URL cannot carry the log — GitHub caps query length — so the log is
  handed over as a file the user attaches, which is also the honest privacy story: they see
  what they send.
- **A failing report path must say so.** Whatever remains, no branch may end in
  `clientLogger.error(...)` + `return`.
- `redactSecrets()` (`routes/secretRedaction.js`) already exists and must stay on any path
  that exposes log text.
- Add the log path to `bug-report.yml` — `%APPDATA%\Cubric Vision\logs\app.log` on Windows,
  and the macOS/Linux equivalents — so a manual reporter can find it without the app.
- Decide what happens to `/github/create-issue`. It works in dev where `.env` exists. Either
  keep it dev-only and make the dead case obvious, or drop it. Do not leave a route whose
  success depends on a file the build deletes.

## Verify

Run a build with no `.env` present and confirm the dialog's report path produces something
usable. `npm run build:portable:dry-run` exercises the staging that drops `.env`;
`shouldExcludeAppPath` is exported from `scripts/build-portable.mjs` and unit-testable.

**Never take the user's app — `npm run app:isolated`, own profile AND port.**

## Files (expected — confirm before claiming)

- `js/components/Compounds/MpiErrorDialog/MpiErrorDialog.js`
- `routes/system.js` — `/github/create-issue`, `/logs/read`, `/logs/download`
- `.github/ISSUE_TEMPLATE/bug-report.yml`
