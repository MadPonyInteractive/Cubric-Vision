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
  `CUBRIC_AGENT_PROFILE=<fresh dir>` gives you your own lock but an UNCONFIGURED profile (no models
  root). **The cheap move is usually not to launch at all**: check for a peer
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
