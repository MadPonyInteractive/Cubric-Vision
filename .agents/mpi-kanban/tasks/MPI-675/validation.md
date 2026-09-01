# MPI-675 Validation

Implemented 2026-09-01. Phase 1 of umbrella MPI-672.

## What shipped

`POST /github/create-issue` is **deleted**, along with its mirrored `deriveStage()`
and the `axios` import it was the only user of. In its place:

- `POST /github/issue-url` — builds a prefilled `issues/new?template=bug-report.yml&…`
  URL from the error, the typed summary, the OS, the GPU and the app version.
  No token, no `.env`, no network call. `redactSecrets()` on every field.
- `POST /logs/reveal` — reveals the app log in the OS file manager and returns
  `logPath` on **both** outcomes, so a failure can still tell the user where to look.
- `MpiErrorDialog` gained a **Show log file** button and a `__status` line. Every
  failure branch writes into that line with the raw URL / log path as selectable
  text; none ends in a `clientLogger.error(...)` + `return`.
- `bug-report.yml` now names the log path for all three platforms.

## Evidence

| Check | Result |
|---|---|
| `npm test` | **835 pass, 0 fail** |
| `npm run lint` | clean |
| `node --test tests/issue-report-url.test.cjs` | 5/5 — run with `GITHUB_TOKEN` and `GITHUB_REPO` **deleted** |
| Live `npm run app:isolated` (own profile + port 63602) | dialog fired via `showError()`; both buttons exercised |

The brief asked for "a build with no `.env`". The test does better: it deletes the
two env vars and asserts the route still answers 200 — a build could only ever show
that `.env` is absent, not that the path no longer needs it. Nothing in the new code
reads `process.env`.

Live run, measured not inferred:

- **Report on GitHub** → produced
  `https://github.com/MadPonyInteractive/Cubric-Vision/issues/new?template=bug-report.yml&title=%5Bbug%5D%3A+ComfyUI+failed+to+start&…&platform=Windows&os_version=Windows_NT+10.0.26200&app_version=1.4.2+%E2%80%94+release&gpu=NVIDIA+GeForce+RTX+4060+Ti+%2F+nvidia`
  with the typed summary carried through. With `window.open` stubbed to fail, the
  status line showed **"Could not open your browser. Copy this address into it:"**
  followed by the full URL. Not silent.
- **Show log file** → opened Explorer on the log and the status line read
  `Log file: C:\Users\Fabio\AppData\Local\Temp\cubric-agent-profile\logs\app.log`.

## Found while implementing — the mirror had ALREADY drifted

`routes/system.js`'s copy of `deriveStage()` still carried the old four-branch rule
and answered `alpha` for 1.4.2. `js/core/appStage.js` — the real one — was long since
simplified to `X ≥ 1 → release` and answers `release`. The two had silently diverged,
which is exactly what the "keep both in sync" note in `docs/versioning.md` existed to
prevent and did not. Deleting the mirror removed a copy that was already wrong; the
doc's stated rule was corrected to match the code at the same time.

`MpiButton` also ignores `text` once `icon` is set — it renders `label`. The old
Report button masked this by passing the same string to both.

## Not done here

- **`/logs/download` still has no UI caller.** Reveal-the-file is the better
  affordance in a desktop app and covers the brief's requirement, so the route was
  left alone rather than given a second, worse button. Delete it or wire it if a
  browser-only surface ever needs it.
- The reporter of issue #2 has still not been contacted (unchanged from the handoff).

## User confirmation — 2026-09-01

Fabio confirmed the dialog ("1"), and screenshotted the result of **Show log file**:
Explorer open on `…\Temp\cubric-agent-profile\logs\`, with `app.log` (5 KB) selected.
The reveal works end to end on Windows. Card closed on that evidence.
