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

## Reopened — the test this card shipped took master red (2026-09-01)

`tests/issue-report-url.test.cjs` deleted `app.log` to force `/logs/reveal` down its
404 branch. `routes/logger` appends ASYNCHRONOUSLY, so a line queued by an earlier
test in the same file could land after the delete and put the file back. The route
then took its SUCCESS branch — spawning a real file manager on the runner, the one
thing the test exists to prevent — and asserted `200 !== 404`.

Local runs never showed it: GPU detection is instant here (nvidia-smi answers) and
slow on a GPU-less CI runner, so the queued `[gpu-detect]` lines land in a different
order. Not a product regression — `/logs/reveal` behaves correctly either way.

Fixed in `54f03caf` by stubbing `logger.getLogPath()` to a path inside the throwaway
user-data that nothing ever writes (`never-written.log`), so the miss branch cannot
be beaten by a stray write rather than merely being unlikely to be.

| Check | Result |
|---|---|
| `node --test tests/issue-report-url.test.cjs` | 5/5 |
| `npm test` | **840 pass, 0 fail** |
| `npm run lint` | clean |
| CI run 33492792421 on master | **success** — `npm test` + `npm run test:desktop` |

Why it was found a commit late — and why that keeps happening — is **MPI-676**.
