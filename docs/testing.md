# Testing

Two suites. Both are a **release gate** (MPI-443): `mpi-version-bump` step 6 runs
them and neither may be red when the release is approved.

```sh
npm test               # unit suite — node --test "tests/**/*.test.cjs", ~9s
npm run test:desktop   # Playwright/Electron UI specs — ~1.2 min
```

`node --test tests/` (the directory form) does NOT work: Node treats the path as a
module and dies with `Cannot find module '...\tests'`. The glob form works
directly too: `node --test tests/*.test.cjs`.

**Why the gate exists.** `npm run release:check` only compares files to each other
— it never executes app code. That is how 1.3.0 shipped with the LoRA and upscale
pickers opening into hidden DOM: every static check passed.

## CI (MPI-444)

`.github/workflows/tests.yml` runs **both** suites on `windows-latest`: `npm ci`,
`npm test`, `npm run test:desktop`. Triggers: push to `master` **and to bare release
branches** (`[0-9]*.[0-9]*.[0-9]*` — a hotfix landing on `1.3.1` never touches master but
still gets a `v*` tag build), PRs to `master`, and `workflow_dispatch`. No
`npx playwright install` step: Playwright drives the `electron` npm binary, and Electron
needs no xvfb on Windows.

- **`@cubric/connector` is NOT a blocker.** Its `file:../Cubric-Studio/...` target does
  not exist on a lone checkout, and `npm ci` does not care — npm creates a dangling
  symlink and exits 0. All three consumers dynamic-import it inside `try/catch`. No PAT,
  no registry, no vendored copy. (The dangling symlink in a shipped artifact is a
  separate problem: MPI-416.)
- **`build-portable.yml` is deliberately NOT gated on this.** A `v*` tag is cut from a
  commit this workflow already ran, and `mpi-version-bump` keeps its human gate.
- **Artifacts on failure only**, minus `test-results/**/user-data/**` — that is each
  failing spec's whole Electron profile, 301 MB in the first red run. What you want is
  `trace.zip`, `test-failed-1.png` and `error-context.md`; `gh run download <id>` gets them.
- **Two desktop specs are `test.fixme(!!process.env.CI, …)`** — `app-close-destroys-instance`
  and `mask-persist-roundtrip`'s navigation test. They need a BOOTED shell, and
  `js/shell.js` parks boot behind the first-run engine-install modal on any profile with
  no engine, which every CI profile is. Fixture gap, not an app bug → **MPI-446**. They
  still run locally, where the release gate uses them.

## The unit suite

**Test FILES run in parallel** (`node --test` defaults to CPU count), so anything mutating
global ON-DISK state races. `extra-model-folders.test.cjs` and
`settings-models-root-guard.test.cjs` both POST `/comfy/set-path`, which rewrites the one
`extra_model_paths.yaml` that `getCustomRoot()` reads `base_path` back out of — one file's
revert landing inside the other's set-path→list-files window made it fail ~1 run in 5 and
pass on re-run. Each now sets `process.env.CUBRIC_ENGINE_ROOT` to its own `mkdtempSync`
dir **before** the `routes/comfy` require captures `ENGINE_ROOT`. Do the same in any new
test that writes engine state — the fix is isolation, not a retry or a concurrency cap.
Bonus: the suite no longer rewrites the developer's real engine yaml.

**A source-text test cannot see a control that was never WIRED (MPI-447).** Most of the
canvas suites assert manager behaviour from source text, and Adjust's **Reset shipped dead
through two cards** that way: MPI-436 dropped `resetBtn.on('click', _reset)` while rewriting
the commit row, and the button still mounted, still went into `_children` and still destroyed
cleanly — every assertion in `mask-adjust.test.cjs` passed. When a panel gains a control,
guard its HANDLER per button (`assert.match(panel, /<name>Btn\.on\('click'/)`), and prove a
UI fix by clicking the real button — a panel mounts headless in Chromium against a stub
`viewer`, which is how this one was proven dead and then proven fixed.

**GREEN — there is no known-failing baseline any more.** Measured 2026-08-04:
**417 pass / 0 fail** (298 on 2026-07-29). Any red is a real regression; do not go
looking for it on an "expected failures" list, because that list no longer exists.
The total moves as tests are added, so judge on the failure LIST (empty), not the count.

All 9 formerly-standing failures were **stale tests, not code defects** (MPI-389,
2026-07-29):

- `permodel-key-allowlist` ×3 — **deleted.** They asserted the hand-maintained
  `_MODEL_WIDE_KEYS` allowlist that MPI-336 deliberately replaced with a `modelWide`
  flag derived from the control's own scope (see `js/services/projectService.js` for
  where that write is routed). **Never make a permodel-key failure pass by re-adding
  keys to the Set** — that reinstates the list MPI-336 removed.
- `optional-media-placeholder` — MPI-272 un-staged `placeholder.png` / `ltx_silence.wav`.
- `resolve-model-deps` — asserted `LTX_t2v.json` against the lowercase on-disk `ltx_t2v.json`.
- `remoteProxy` ×4 — MPI-175's module split left the `remotePodState` singleton leaking
  between tests; the harness now drops the whole barrel family.

→ `.agents/mpi-kanban/tasks/MPI-389/validation.md`

## The desktop suite

Specs live in `tests/desktop/*.spec.js`, config `playwright.desktop.config.js`
(`workers: 1`, serial). Each launches Electron with `CUBRIC_E2E=1` and a
per-test `CUBRIC_E2E_USER_DATA`, so normal app data is never touched.

**The suite runs alongside your open app** — verified 2026-08-05 with a dev instance
live on 3000, 17/17 green on port 63877 and the instance untouched (MPI-448).

The port is a value now, not a literal. `CUBRIC_PORT` (default 3000) is read by
`server.js`, `main.js` and `tests/desktop/shellWindow.js`; `tests/desktop/globalSetup.js`
picks a free one per run and Playwright's workers inherit it, so every spec's
`{ ...process.env }` launch block passes it to the Electron fork with no per-spec
change. Assert the shell URL with `SHELL_URL_RE` from `shellWindow.js` — never a
`3000` literal, or the spec breaks the moment the port moves.

**A taken port is a hard failure, not a silent attach.** That was the real bug: the
launched Electron found :3000 already answering, loaded the RUNNING app's page, and
the specs drove the dev session with its real engine root and real user data —
`CUBRIC_E2E_USER_DATA` isolation bypassed without one error, and a green run meaning
nothing. Both halves now refuse: `server.js` exits 1 on `EADDRINUSE`, and `main.js`
turns a non-zero server exit into `reportFatal` (log + exit 1, no window). Proven in
the failing direction — squatter on a port, launch, exit code 1 with
`Port <n> is already in use` in the log.

**Never use `app.firstWindow()`.** Boot opens TWO windows: a frameless splash
(`splash/splash.html`, loaded instantly by `main.js`) and then the shell on
`127.0.0.1:$CUBRIC_PORT`; the splash is destroyed once the shell has painted AND loaded
a real HTTP response (MPI-410), so `firstWindow()` hands back a window that closes
underneath the test. Use `tests/desktop/shellWindow.js` (`const window = await
shellWindow(app)`).

**Drive the app through its own seams, not the pointer.** Under `CUBRIC_E2E=1` the
GPU is off and rendering throttles, which makes real pointer clicks flaky. Existing
specs import app modules inside `window.evaluate` and use `Events.emit` / the
router / direct component mounts instead.

### UI smoke specs (MPI-443)

Three specs cover the "click does nothing" class that shipped in 1.3.0, all built on
`tests/desktop/launch.js` — `launchApp(testInfo)` → `{ app, window, consoleErrors,
pageErrors }`. The eight older specs still inline their own launch block and were
deliberately left alone.

- **`popup-contract.spec.js`** — the primitive contract. A body-mounted `MpiOverlay`
  stashes every `document.body` child when it shows, so a `MpiDropdown` /
  `MpiTreePicker` that portalled its popup at MOUNT time got swept into hidden DOM
  (fixed in `8184709b` by portalling on first open instead). Asserts each popup is a
  direct body child, is NOT inside `.mpi-overlay-stash`, has a non-zero rect, and is
  what `elementFromPoint` returns at its own centre.
- **`model-settings-popup.spec.js`** — the same four checks on the real surface
  (`MpiModelSettings`: the overlay, LoRA slot 1's tree picker, the upscale dropdown),
  plus the MPI-356 re-entry guard.
- **`workspace-sweep.spec.js`** — one shallow test per surface reachable on empty
  user data (landing, Settings slide-over, gallery, group-history): it mounts,
  nothing threw. Breadth for the surfaces nobody hand-tests before a release. The
  Model Library (needs installed models) and the App Library (dev-gated) are not in
  it yet — they need fixtures first.

### Four traps these specs paid for

1. **Assert the trigger toggled (`is-open`) BEFORE asserting the popup.** In the real
   bug the trigger toggled — the chevron flipped — while the popup was invisible.
   Without that assertion, a click that never landed fails identically to the bug.
2. **The MPI-356 re-entry loop cannot be armed by opening the overlay once.** Its
   live-rerender subscription is gated on `_isOpen`, which `open()` sets LAST, so a
   first open can never re-enter and any `open()`-call-count assertion around it is
   vacuous. Arm it by changing `state.availableLoras` while the overlay is ALREADY
   open, then assert exactly two calls (one open, one live re-render). Measured on
   that trigger: removing the `_rescanning` guard gives 3; removing `assetService`'s
   `_same()` guard as well gives **7792**.
3. **A fake project folder poisons the console-error assertion.** Opening Model
   Settings for a model the project has no entry for legitimately writes defaults
   through `/update-project-settings`, which 500s on a path that does not exist. Give
   the spec a real folder under `testInfo.outputPath()` with a `project.json` in it
   rather than mocking the write away.
4. **Keep the URL on network console errors.** Chromium's "Failed to load resource:
   …500" carries no URL in its text; `launch.js` appends `msg.location().url` so a
   failure names the route instead of sending you hunting.
