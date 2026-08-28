# Harnesses — running app code without the app

Verifying a change usually does not need the user's running app, a GPU, or port 3000. This is the
ladder of harnesses, cheapest first, and the boundary of what each one can actually prove. The two
test SUITES are [testing.md](testing.md); this is the ad-hoc tier beneath them.

**The standing constraint: the user owns `:3000`.** Never restart, close, or drive their instance
to test something. Every recipe here exists to avoid it.

## 1. Bare Node — the registry imports with no DOM

`models.js`, `dependencies.js` (+ the four `*Deps.js` it spreads), `resolveModelDeps.js`,
`footprint.js` and `js/data/commandRegistry.js` are pure data/logic — no DOM, no `state.js`, no
Events. A throwaway `node --input-type=module -e` (or a scratch `.mjs`) answers fleet-wide
questions in seconds with the app closed:

```js
const u = p => `file:///c:/AI/Mpi/Cubric-Vision/${p}`;
const { MODELS }   = await import(u('js/data/modelConstants/models.js'));
const { DEPS }     = await import(u('js/data/modelConstants/dependencies.js'));
const { resolveDeps, resolveWorkflowFile } = await import(u('js/data/modelConstants/resolveModelDeps.js'));
const { sizeToGb } = await import(u('js/data/modelConstants/footprint.js'));
const { COMMANDS } = await import(u('js/data/commandRegistry.js'));
```

`COMMANDS[op]` carries `mediaInputs` (required media + the `Input_*` node title) and
`model.opInject[op]` the branch selector — enough to drive a graph without the renderer. This is
what `scripts/smoke-workflows.mjs` is built on (MPI-467).

**Pass the arch token when you size anything.** `resolveDeps` with no `variantTokens` UNIONS every
arch variant by design (shared-dep protection — `.claude/rules/comfy_engine.md` § 2.5b), so a
network-volume estimate off the union over-states it. That cost a wrong 336 GB answer; the real
figure was 312 GB.

```js
resolveDeps(m, null, null, 'remote', {})                 // LTX = fp8 (25.2GB) + mxfp8 (24.1GB)
resolveDeps(m, null, null, 'remote', { arch: 'modern' }) // LTX = fp8 only   <-- correct
```

Same shape per-op: Wan 2.2 ships SEPARATE t2v and i2v transformers (60.3 → 33.2 GB when t2v goes)
while every other video model shares one weight set across both — so "deprecate t2v" saves 27 GB on
Wan and 0 GB everywhere else. **Never reason about which models share weights; measure it.**

**Dedupe graphs by class_type SET, not filename**, when the question is "what does a ComfyUI bump
break" — a bump breaks a NODE. `[...new Set(Object.values(graph).map(n => n.class_type))].sort()`
collapses SDXL 5→1 and Chroma/Boogu/LTX/Krea2 2→1. But graphs are not the execution unit: **ops
are.** `klein-4b` drives 7 ops through one `klein_t2i.json` via `opInject` → `Input_wf_type`.

### The import boundary is the GRAPH, not the folder

A module imports headlessly unless something in its import graph resolves an **absolute browser
path**. `js/components/Primitives/MpiButton/MpiButton.js` imports `/js/utils/icons.js`, which Node
resolves against the drive root:

```
Cannot find module 'C:\js\utils\icons.js' imported from ...\MpiButton.js
```

That reads like a broken import and is not one — it only resolves when served off `:3000`. Measured
consequences, all three counter-intuitive:

- `js/services/commandExecutor.js` — **dies** (reaches `MpiButton`), MPI-473.
- `js/services/comfyController.js` — **imports clean**, MPI-495. All-relative imports, no component
  in its graph, so a `.cjs` test can `await import()` it and drive the REAL `runWorkflow` (stub
  `fetch` / `connect` / `ensureServerRunning` / `_startHistoryPoll` on the exported `localEngine` —
  `createEngine` returns a plain object literal, so instance monkeypatching is enough). Guard:
  `tests/prompt-partial-validation.test.cjs`.
- `js/shell/notificationService.js` — **imports clean**, MPI-540, *despite* reaching `MpiToast`
  through `statusBar.js`. `MpiToast` uses no absolute path. `downloadService.js` reaches
  `MpiButton` through `MpiLicenceGate` and still dies.

So `js/components/` is not the wall and `js/services/` is not safe ground. Check it in one second
before concluding anything: `node -e "import('./path.js').then(m=>console.log(Object.keys(m)))"`.

The price of admission for a shell/service module is a DOM stub — `window`, `document` (with
`hasFocus`, `createElement`, `body`, `documentElement`), `localStorage`, `fetch`, and `EventSource`
if the module opens one. `tests/notification-stale-count.test.cjs` carries a working set; copy it.
With that, a `.cjs` test drives the REAL service: `Events.emit(...)`, mutate `state.*`, and spy by
replacing a method on an imported singleton (`StatusBar.notify = …` — the module holds the OBJECT,
so patching a property is seen by the code under test).

**Known gap: injection has no offline harness at all.** `_buildParams` is module-private and
`commandExecutor` cannot import headlessly, so "does this op still emit `Video_Latent.is_preview`?"
has no unit test and no scratch `.mjs`. The options are a live app probe or static proof (grep every
producer and consumer of the key).

### A `require.cache` reset must drop the WHOLE module family

A harness that `fresh()`es one module by deleting its cache entry is wrong the moment that module
is a **barrel**. `routes/remoteProxy.js` is a barrel over `remotePodState` / `remotePodLifecycle` /
`remoteProxyForward` (MPI-175): re-requiring only the barrel left `remotePodState`'s mode singleton
alive **and** left the submodules' load-time-destructured `remoteEngine` bindings pointing at the
pre-mock objects. A prior test's `podId` then leaked forward and mocks installed after the first
require never bound — the symptom reads as a production bug (`pod-old`, a 502 where 409 was
expected) and is not one. Drop every module in the family, and do it **after** the mocks are in
place. Same shape for `routes/comfy` capturing `ENGINE_ROOT` at require time (see
[testing.md](testing.md) § The unit suite).

## 2. `CUBRIC_ENGINE_ROOT` — run the REAL install code against a throwaway engine

`getEngineRoot()` (`routes/platformEngine.js`) checks the env var first, so a plain node script can
exercise `startUniversalWorkflowInstall`, extraction and the `.mpi_node_commit` stamp end-to-end
with the user's actual engine untouched. No app, no port, no admin, nothing to undo.

The other half is faking the dep set: `downloadManager` resolves DEPS lazily via
`_require('../js/data/modelConstants/dependencies.js')`, so overwriting
`require.cache[depsPath].exports` **before** requiring `routes/downloadManager.js` swaps in any dep
set you like. Proven MPI-427 with one real github.com node plus one weight on a `.invalid` host
(RFC 2606 guarantees NXDOMAIN) — reproducing a user whose ISP blocks one of our two download hosts,
exactly.

It also runs both directions cheaply: `git checkout <pre-fix-sha> -- routes/` → run → restore. That
live negative control turns "the test passes" into "the bug existed and this is what fixed it".

Two details:

- Require from the repo root (or a worktree) so `node_modules` resolves; a script in the scratchpad
  needs `NODE_PATH=<repo>/node_modules`.
- Add `process.on('unhandledRejection', …)` to model reality. The real download runs in the forked
  server process, whose handler (`server.js`) logs and STAYS UP; without it the harness dies where
  the app would not, which reads as a new bug. Conversely, once a floating rejection is genuinely
  fixed, a handler-free harness running clean is proof.

> **HAZARD this pattern exists to avoid** — but check WHICH install you are in. The
> `custom_nodes/ComfyUi-MpiNodes` symlink to `C:\AI\Mpi\ComfyUi-MpiNodes` now lives on the
> standalone **bench** (`G:\ComfyUi`), not the app engine: deleting that folder still destroys the
> live node source repo. The app engine is a user replica and its junction is long gone — measured
> 2026-08-18, `engine/` has ZERO reparse points. Confirm before touching anything under
> `custom_nodes/`: `Get-ChildItem <root> -Recurse -Force -Attributes ReparsePoint`.

## 3. One router on a spare port — testing a new route

`routes/*.js` is main-process: a route added there is invisible until the app restarts, and
**Express does not hot-reload**, so POSTing a route you just edited runs the OLD code. Mount just
the affected router instead, from a harness placed **in the repo root** (so `require` resolves
`node_modules` — a scratchpad copy fails with `Cannot find module 'express'`):

```js
// _throwaway.js at repo root — routes are self-contained express.Router
const express = require('express');
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/', require('./routes/projects.js'));
app.listen(3999, '127.0.0.1', () => console.log('TEST on 3999'));
```

Hit an EXISTING route in the same router first — that rules out a mount bug versus a stale-server
miss. Then curl the new one against real data, snapshot before/after, **revert any mutation to real
project files**, `taskkill //F //PID <pid>` (a plain `kill` on the netstat PID has missed), delete
the harness, and confirm `netstat | grep :3999` is dead and `git status` shows no stray `_*.js`.

## 4. Your own app instance — `npm run app:isolated`

> **A one-off probe script must set `process.env.CUBRIC_PORT` BEFORE it requires
> `tests/desktop/shellWindow.js`.** That module reads the port into a `const` at load
> time, so setting it afterwards leaves the helper hunting for `127.0.0.1:3000` — which
> is the user's live app, not yours — and it times out with
> `shellWindow: no 127.0.0.1:3000 window within 30000ms`, which reads as a launch
> failure and is not one. Passing the port in the child `env` alone is not enough; the
> helper reads the PARENT's environment.

When you genuinely need a running app, take your own: `npm run app:isolated`
(`scripts/launch-instance.mjs`) picks a free `CUBRIC_PORT`, sets `CUBRIC_USER_DATA_ROOT` to a
STABLE profile (`%TEMP%\cubric-agent-profile`, stable on purpose so an engine install survives), and
prints `READY <url>`. Drive that URL, never 3000.

- **To test an ENGINE INSTALL, give it a throwaway engine**:
  `CUBRIC_ENGINE_ROOT="<scratch>" npm run app:isolated`. The launcher spreads `process.env`, and
  `getEngineRoot()` checks the var FIRST — ahead of `.engine-config.json` — so the whole app,
  modal included, runs against a scratch root with the real engine untouched. Without it you are
  installing into the user's `engine/`. To force a from-scratch pass on the REAL engine anyway,
  use the product's own wipe (`POST /engine/upgrade {"mode":"full"}`, signal table in
  [playbooks/bump-engine/02-local-upgrade.md](playbooks/bump-engine/02-local-upgrade.md)) rather
  than deleting by hand: it stops ComfyUI first and preserves the models root. Measured MPI-525:
  4m04.6s to reinstall, then a 2m47.6s curated pip pass with ~140 packages genuinely downloading.
- **It copies NOTHING, and that is the safety property** — see
  [runpod-remote-engine.md](runpod-remote-engine.md) § the orphan sweep for what a copied profile
  did to another agent's live Pod.
- **The isolation is the PROFILE, not the project data.** `APP_DOCUMENTS` is not profile-scoped,
  so `getProjectsRoot()` still resolves to the user's real `Documents/Cubric Vision/Projects`. A
  project your instance creates lands in THEIR project root and shows up in THEIR landing list on
  the next re-list — it is not sandboxed anywhere. Delete a probe project when you are done
  (`POST /delete-project {"folderPath": …, "deleteFiles": true}`, and note it wants `folderPath`
  at the top level, not a nested `project` object). Measured MPI-592: two probe projects written
  straight into the live root, both removed by hand.
- **Driving it from a BROWSER (`playwright-cli`) has three traps that each read as a broken app.**
  (1) The viewer mounts NO `<canvas>` until a canvas tool is armed — before that it is an `<img>`,
  so a `querySelectorAll('canvas')` poll returns 0 and looks like a failed load. Arm the tool
  first, then query. (2) `playwright-cli drop` cannot reach the file-drop target: it is
  `MpiMediaDropOverlay`, which only becomes the top element after a `dragenter`, so `drop` has
  nothing to resolve and dropping on the canvas underneath does nothing at all. Build the sequence
  in-page instead — canvas → `toBlob` → `new File` → `new DataTransfer`, dispatch `dragenter` on
  `window`, then `drop` on `.mpi-media-drop-overlay`. Whether the overlay went visible on
  `dragenter` is itself the assertion for a branch that is supposed to SUPPRESS the drop (the
  video-prompt short-circuit). (3) Managers are not reachable: `MpiCanvas` binds its `_methods`
  allowlist to the core, so `el.hasShape` has no retrievable `this` and there is no handle on
  `ShapeManager`. Measure the OVERLAY CANVAS ALPHA BBOX instead — `getImageData` gives x/y/w/h and
  centre of whatever is drawn, and the OPAQUE-PIXEL COUNT is the load-bearing half, because a
  400×160 placement rotated 45° has a 396×397 bbox that no aspect test can tell from a square
  while its 64000 opaque px separates it from a square's 78400 outright (MPI-454).
- **A COPIED project is still not isolated, and grep will not show you why.** Copying a project
  folder to get a disposable one leaves every `Media/.meta/<uuid>.json` `filePath` pointing at the
  ORIGINAL — they hold a full absolute path inside a `/project-file?path=…` query string
  ([project-integrity.md](project-integrity.md) § Sidecar Files), and it is URL-ENCODED, so a grep
  for `My Project` misses `My%20Project` and the copy reads as clean. The tell is the live
  `canvas[data-role="base"]`'s `data-media-url` naming the source project. Rewrite both spellings
  across `Media/.meta/` and `Media/.preview-assets/` and reload, or the probe is driving the
  user's real files.
- **Never pipe the launch into `head` / `grep -m1`** — the consumer exits, stdout dies, and the
  third-party electron npm wrapper throws an EPIPE that takes the app with it (MPI-514). Read the
  URL out of the background task's output file.
- **To GENERATE, it needs the weights**: `CUBRIC_MODELS_ROOT="G:/CubricModels" npm run app:isolated`.
  A fresh profile answers `OP_UNAVAILABLE` for every op, which points at the engine while the cause
  is the app-side dep state `isOperationInstalled` reads — the engine is already shared and its
  `extra_model_paths.yaml` already points at `G:/CubricModels`. Verified MPI-546: with the var set,
  `isOperationInstalled('krea2','t2i')` → true and a real `t2i` landed a genuine gallery card.
- **Two agents both running it COLLIDE** on the `userData`-keyed single-instance lock (the profile
  path is fixed). The second dies at ~0.06s, exit 0, having logged only an `EPERM` mask-temp prune
  and `Splash failed to load: ERR_FAILED (-2)` — which reads as a corrupted profile and is not.
  **The peer need not be alive**: an ORPHAN Electron from a dead session still holds the lock and
  prints the identical signature, so a hunt for a live peer finds nothing and the failure keeps
  looking like a broken app (2026-08-28). The `EPERM` prune on the profile directory is the tell
  that SOMETHING still owns it.
  `CUBRIC_AGENT_PROFILE=<fresh dir>` gives you your own lock but an UNCONFIGURED profile (no models
  root) — which is the whole fix when you only need a UI check, and it beats killing a process you
  have not identified. **The cheap move is usually not to launch at all**: check for a peer
  (`Get-CimInstance Win32_Process` filtered to `electron.exe .`) and drive the shared engine on
  48188 directly — every instance points at the same one.
- **It has no RunPod API key**, deliberately. Anything that must rent a Pod has to run against an
  app on the DEFAULT profile, and a `routes/` edit needs THAT app restarted before the change
  exists (`POD_IMAGE_VERSION_DEV` bakes into the Express child at boot — an unrestarted app asked
  RunPod for the old image tag and burned a rental on 2026-08-10).
- **Do not sweep processes by matching `cubric-agent-profile`** in the command line: that string is
  in the agent's own shell command lines, so the sweep kills its own shell (exit 255). Resolve the
  listener by port — `(Get-NetTCPConnection -LocalPort <port> -State Listen).OwningProcess` — and
  kill its PARENT, because the listener is the `server.js` child and killing it leaves the root and
  renderer alive. Killing only the windows can leave the fork serving the OLD route code.

- **To exercise an SSE handler without the server, stub `EventSource` in the page.**
  `downloadService._connectSSE()` does `new EventSource(...)` and registers its handlers with
  `addEventListener`, so replacing `window.EventSource` with a class that just captures those
  callbacks, then calling `_connectSSE()`, hands you the REAL handlers to fire synthetic
  events into — real registry, real notificationService, real toasts, no network. This is the
  only practical way to test a `download:complete` consumer locally, because a fully-installed
  LOCAL install never emits the model-level event (see
  [download-manager.md](download-manager.md) § Download Events). Used to prove MPI-576 both
  ways in one run: silent job → no toast, control → the exact reported storm.

Launch mechanics for a hand-rolled instance (why `unset ELECTRON_RUN_AS_NODE` is mandatory, and the
two failure signatures — lock = silent exit 0, port = loud `[FATAL] [main] server-exit` + exit 1) are
in [testing.md](testing.md) § The desktop suite and [DEVELOPMENT.md](DEVELOPMENT.md).


## 5. Measuring GPU memory — the standard harness CANNOT

Sampled with `Get-Counter '\GPU Process Memory(*)\Dedicated Usage'` summed over the app's own
pids, median of 3, ComfyUI engine OFF so the app is measured alone. Four traps, each of which
returns a confident number that is wrong (MPI-631, MPI-633):

- **`tests/desktop/launch.js` can never measure VRAM.** It sets `CUBRIC_E2E`, and `main.js`
  turns that into `disableHardwareAcceleration()` + `--disable-gpu`, so every sample reads
  **0.0 MB on a perfectly healthy app**. A measurement rig has to launch Electron itself,
  deleting `CUBRIC_E2E` from the env while KEEPING `CUBRIC_E2E_USER_DATA` and the run's
  `CUBRIC_PORT` — those two are what actually keep it off the user's app (MPI-458).
- **Do not sample by process TREE.** `Win32_Process` reports no children for the Electron main
  pid (measured: `tree(1)` while `getAppMetrics()` listed Browser/GPU/Tab/Utility), so a tree
  walk reads 0.0 MB; `app.process().pid` is worse, since Playwright spawns Electron through a
  `cmd.exe` shim on Windows. Take the pid list from `app.getAppMetrics()`. Three rig runs read
  a confident 0.0 MB before this was found.
- **ONE app launch per measured config.** A torn-down grid does not hand GPU memory back within
  seconds (a 3000x1280 run left 740 MB resident after unmount), so configs sharing a process
  measure only what they need BEYOND the pool the previous config grew.
- **Absolute numbers drift between sessions.** The same unchanged control config read 23.7 MB
  in one run and 72.9 MB in another. Only compare configs measured in ONE run, and re-measure
  the control alongside anything you are comparing against.

**A rig is not a spec.** Name it `*.rig.js`: the repo's `playwright.desktop.config.js` sets no
`testMatch`, so the default `*.spec.js`/`*.test.js` leaves rigs out of `npm run test:desktop` —
which matters, because one run is minutes and launches five to seven Electron instances. The CLI
has **no `--testMatch` flag** (it errors with `unknown option`); to run one, point `--config` at
a throwaway config that spreads the repo one and adds `testMatch: '**/*.rig.js'`.

**And a scroll tour must step by a VIEWPORT, not by a fraction of `scrollHeight`.** Content
height varies ~9x across the gallery's size slider, so a fixed step count skips most of the
cards at one level and none at another — the two runs then differ in how many cards were ever
rasterised rather than in what a card costs. Separately, a stepped tour with rests is a
DIFFERENT gesture from a fling, and for anything gated on scroll-idle the two give answers
minutes apart in meaning: measure both and say which is which.
