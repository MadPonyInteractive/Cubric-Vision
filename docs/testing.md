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

## The unit suite

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

**Close the app first.** `server.js` hardcodes port 3000, so a spec launched while
the app is open cannot bind its own server — the test window then loads the
ALREADY-RUNNING one and the suite passes without ever testing the working tree.
`tests/desktop/globalSetup.js` aborts the run when the port is taken, so this
fails loudly instead of silently; it never kills the process holding it, because
that is normally the user's own app. If `PORT` in `server.js` ever moves, move the
constant in `globalSetup.js` with it.

**Never use `app.firstWindow()`.** Boot opens TWO windows: a frameless splash
(`splash/splash.html`, loaded instantly by `main.js`) and then the shell on
`127.0.0.1:3000`; the splash is destroyed on the shell's `ready-to-show`, so
`firstWindow()` hands back a window that closes underneath the test. Use
`tests/desktop/shellWindow.js` (`const window = await shellWindow(app)`).

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
