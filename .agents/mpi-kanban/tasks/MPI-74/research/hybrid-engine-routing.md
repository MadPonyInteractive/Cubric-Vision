# Hybrid Engine Routing — research note (MPI-74)

Source: brainstorm session 2026-06-13. Captures architecture findings + the
local-vs-two-instance decision so a future implementer starts informed.

## Goal

One project. Image generation on the **local** engine, video generation on the
**cloud** Pod, with automatic asset handoff (locally generated image flows
straight into a cloud image-to-video gen, same project, no manual ferrying).

This is the user's actual stated workflow. It is the test every design must pass.

## Current architecture (what blocks this today)

Remote mode is a **single global, backend-owned flag**, resolved once per run:

- `routes/remoteProxy.js:80` — `const _mode = { active, podId, deleteOnQuit }`.
  One flag for the whole app/session. `getRemoteMode()` / `setRemoteMode()`.
- `js/services/remoteEngineClient.js` — renderer mirror. `refresh()` hits
  `/remote/mode` at the start of EVERY run (`ComfyUIController.ensureServerRunning`)
  so the whole app is either local OR remote, never both at once.
- `js/services/comfyController.js` — singleton with ONE `_ws`, ONE
  `serverAddress` (`127.0.0.1:8188`), ONE `httpBase()`. `httpBase()` returns the
  Express `/proxy` prefix in remote mode, else the local ComfyUI address.
- `routes/remoteModels.js` — install + model-check ALSO fork on the single
  `isRemoteActive()`: installs go to local fs OR Pod volume, model-status checks
  hit local fs OR the wrapper. Per-mode, not per-model.

So today there is exactly ONE ComfyUI target at a time. Hybrid needs TWO engines
connected simultaneously, with the target chosen per generation.

## Why it IS viable

1. **Clean seam already exists.** `remoteEngineClient` is described in its own
   header as "the single seam through which ComfyUIController selects remote
   mode." `httpBase()` / `wsUrl()` already abstract local-vs-remote. Today they
   read a global; they could instead take a per-run argument. The expensive
   architectural decision (route everything through one adapter) is already paid.
2. **Models already typed.** Every model has `mediaType: 'image' | 'video'`
   (`js/data/modelConstants/models.js:7`). "image local, video cloud" is already
   expressible from existing data — **v1 needs no new model field**. A single rule
   ("video -> cloud, image -> local") covers the exact stated use case.
3. **Install routing already forks on remote mode** (`routes/remoteModels.js`).
   Per-model install LOCATION is a natural extension of code that already exists.

## Why it is NOT a small add to MPI-64

1. **Two engines at once.** `ComfyUIController` is a singleton (one `_ws`, one
   `serverAddress`, one `httpBase()`). Concurrent local-image + cloud-video needs
   either two controller instances or one controller holding two connections.
   Real refactor, not a flag.
2. **Global state -> per-job state.** `remoteEngineClient._active/_token/_wsBase`
   are module singletons. Routing must resolve the engine at QUEUE time per job.
3. **Models live in two places.** A "cloud" model installs to the Pod volume; a
   "local" model to local fs. The install screen control changes WHERE the
   download goes, and model-check must run per-model (a model can be present in
   one location, missing in the other), not per-mode.
4. **Pod lifecycle / billing.** Pod bills while alive. Today: Connect creates /
   Disconnect deletes; generation does NOT lazily create a Pod precisely to avoid
   a silent billing surprise (`comfyController.js:170-203`). If video auto-routes
   to cloud, Pod lifecycle becomes driven by which models you use. Needs an
   explicit, clear billing-state UX.
5. **MPI-64 unfinished.** Remote engine still has open TODOs (e.g. wrapper
   restart-ComfyUI endpoint deferred; per-model custom_node reload requires
   reconnect). Building hybrid on a moving base = two shifting foundations.

## Rejected alternative: two app instances

Idea: drop the single-instance lock (`main.js:231`), let the user run two
Cubric-Vision instances — one local, one cloud.

**Rejected.** The single-instance lock is the cheap part. The real collisions are
three hardcoded singletons two instances would fight over:

- **Port 3000 hardcoded** — `server.js:26` (`const port = 3000`), bound
  `127.0.0.1`; `main.js:348` loads `http://127.0.0.1:3000`. Second instance =
  EADDRINUSE or both windows share one server.
- **Local ComfyUI 8188** — `comfyController.js:41`. Two local engines collide.
- **Shared userData + engine root** — same `app.getPath('userData')`,
  `window-state.json`, engine folder, `extra_model_paths.yaml`, project locks.
  (Override hooks `CUBRIC_USER_DATA_ROOT` / `CUBRIC_PORTABLE_ROOT` exist for E2E
  at `main.js:216` / `main.js:468`, but nothing wires a second normal set.)

**Dealbreaker:** two instances cannot safely open the SAME project. project.json
uses per-file queued atomic writes (`updateProjectJson` in `routes/projects.js`)
scoped to one server process. Two servers, two write queues, one file =
corruption. So two-instance forces TWO separate projects -> the user must ferry
the locally generated image to the other window by hand. That is exactly the
image->video handoff the whole feature exists to remove.

Two-instance answers a DIFFERENT question ("run two independent sessions in
parallel"). It is a legitimate power-user capability and could ship separately,
but it does NOT deliver one-project seamless handoff and is not a substitute.

## Recommended direction

- Finish MPI-64 as the solid binary local<->cloud switch. Ship it.
- Then build MPI-74 on top.
- **Start with the RULE, not the checkbox.** Derive engine from existing
  `mediaType` (video->cloud, image->local). Validate the dual-engine plumbing
  with that minimal rule first — it proves the hard part (two engines live, one
  project) with zero new UI/state. Add a per-model checkbox OVERRIDE only if
  users want exceptions.

## Key files (entry points for the implementer)

- `routes/remoteProxy.js` — global `_mode`, `getRemoteMode`/`setRemoteMode`.
- `js/services/remoteEngineClient.js` — the local/remote seam (make per-run).
- `js/services/comfyController.js` — the singleton controller (needs to host two
  engine targets).
- `routes/remoteModels.js` — install + check fork on `isRemoteActive()`.
- `js/data/modelConstants/models.js` — `mediaType` already present.
- `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js` —
  install screen (where a per-model override checkbox would mount, if added).
