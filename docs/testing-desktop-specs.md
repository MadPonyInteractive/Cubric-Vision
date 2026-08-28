# Desktop specs — the catalogue and the traps

Running the suite (the config, the port, CI, the off-screen window, `shellWindow`) is
[testing.md](testing.md) § The desktop suite. **This file is what you read before WRITING
one:** which specs already exist, and every trap that cost a failing run.

## UI smoke specs (MPI-443)

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
  Model Library (needs installed models) and the Flow Library (dev-gated) are not in
  it yet — they need fixtures first.

## Specs that drive a FLOW overlay (MPI-504, MPI-638/641)

Five things cost a failing run each before the `flow-*.spec.js` specs worked. **Items 4 and 5
are the expensive shape: the spec goes GREEN and the code is wrong** — one passed on every
developer machine and failed only on CI, the other passed against a visibly broken box.

1. **Nothing inside a Flow overlay is clickable or fillable with no project open.** It mounts
   into a `main-area` the landing page keeps hidden, so `.click()` / `.fill()` time out with
   "element is not visible" — which reads as a broken flow and is not one.
   `flow-close-destroys-instance.spec.js` hit this first. Drive the real handler in-page
   instead (`window.evaluate(() => document.querySelector('#flow-next').click())`); locator
   ASSERTIONS are fine, they read hidden elements happily.
2. **Slide 0 is ALWAYS the inputs slide**, even for a flow that collects no media — it renders
   "This flow needs no input media." So a declared `fields` step is slide **1** and the run
   slide is the last. A spec that looks for a declared control without navigating finds zero
   elements.
3. **`state.s_flowInputs` cannot witness that a control's value reached the flow.** A live flow
   never writes it while the user edits: the only writers are the RUN path
   (`MpiBaseFlow._doRun`, at dispatch) and `flowService.openFlowFromReuse`, which SEEDS it from
   a history card before the flow mounts. So a spec that opens a flow with `flow:open` and reads
   that key back gets `undefined` however many controls it has touched. To prove a value landed,
   navigate away and back: every slide rebuilds its fields from `_fieldValues[id] ?? f.default`,
   so a lost `onChange` comes back as the declared default. Asserting the control's own class
   instead proves only that the Primitive toggled itself — it does that whether or not anyone
   listened.

4. **Stubbing `state.s_installedModelIds` is only HALF of availability.** `flowAvailability` is
   `missing.length === 0 && missingDeps.length === 0`, and the dep half comes from
   `_flowDepStatusCache`, which a dev box fills from disk during the model sync. So a spec that
   stubs the model set alone is Ready on your machine and Get-models on a bare runner, with
   identical code. `flow-library-skips-drawer.spec.js` shipped that way and went red on
   `windows-latest` alone (run 33153649907). Stub `setFlowDepStatus(flowId, …)` too, reading the
   ids off the descriptor's `requiredDeps` so adding a dep cannot silently re-break it.
5. **The overlay has NO GEOMETRY here — only styles.** Item 1's "not visible" has a sharper
   consequence than blocked clicks: every `getBoundingClientRect()` inside the frame returns
   **0**, while `getComputedStyle` reads perfectly normally (13px font, 10px padding). So a
   height/width comparison between two elements is `0 === 0` and passes against anything. A
   spec asserting a box matched the control it replaces did exactly that while the box was 4px
   too tall (MPI-641). Sizing `.main-area` by hand does not recover it. Assert a measurement is
   non-degenerate (`> 0`) BEFORE comparing two of them — and when the harness genuinely cannot
   measure, delete the assertion and pin the property that DECIDES the outcome instead (there,
   `line-height`), rather than keeping one that cannot fail.

**And mutation-test the guard.** Both MPI-504 specs were run against the bug they cover (the
old host-div write; the toggle's `onChange` cut) and confirmed RED before being kept. Do the
mutation from a script that restores in `finally` — a crash mid-run otherwise leaves a real
source file broken, and the mutant then reads as your own bad edit.

**`scripts/mutate-check.mjs` is that script; do not hand-roll it again.** It breaks one file,
runs your command, restores in `finally` and verifies byte-identical, and refuses outright when
the target text is absent — a stale snippet would otherwise run the check against unmutated code
and print green. Exit 0 = killed, 1 = **survived**, 2 = the harness could not run.

```bash
node scripts/mutate-check.mjs --file js/x.js --from "a === b" --to "a !== b" --run "npm test"
```

Omit `--to` to DELETE the snippet (the commonest mutation: drop the guard and see if anything
notices). Use `--from-file` when the snippet contains backticks or quotes — Git Bash on Windows
mangles those inline, and this repo's guard hooks block the heredoc workaround.
`--self-check` proves the harness itself on a temp file.

## Five traps these specs paid for

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
5. **A spec that ASSIGNS a `state.*` key and then asserts on a DEFERRED read is racing the
   app.** The assignment is synchronous, the read is not, and the app is still booting — so
   its own async refresh of that key can land in the gap and the assertion reads the
   backend's value, not yours. Look for the triple: **a `state.*` key + its one app-side
   writer + a read that happens a tick later.** MPI-647's was `s_installedModelIds` —
   written only by `_initDataRegistries` in `js/shell.js`, on every `models:checked`, and
   registered synchronously at boot step 7 before any `await` — against
   `openFlowFromReuse`'s `setTimeout(…, 0)` open + toast, which the spec waits 80ms for.
   It reddened master once and reran green on the identical commit.
   - **SUPPRESS the race; do not outrun it.** Re-apply the stub from a listener on the same
     event registered AFTER the app's: `Events` fans out over an insertion-ordered `Set`
     synchronously (`js/events.js`), so the refresh is overwritten **inside its own emit**,
     before any deferred reader can observe it. Widening the sleep only moves the flake.
   - **PROVOKE the CI condition; do not wait for it.** A dev box has the models installed,
     so the empty refresh never resolves here and the flake is unreproducible by
     definition. Emit the app's own event with the CI payload inside the window
     (`Events.emit('models:checked', { installedModelIds: [] })`) and the spec fails on
     every run without the fix — proven both ways: re-stub disabled → red, enabled → green,
     `--repeat-each=5` green. That is the same discipline as mutation-testing the guard,
     applied to the environment instead of the code.

   Worked example: `tests/desktop/flow-reuse-opens-without-model.spec.js`. Item 4 of the
   flow-overlay list above stubs the same key — a stub is only authoritative if nothing
   overwrites it and nothing else feeds the answer.
