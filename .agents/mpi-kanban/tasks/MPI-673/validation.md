# MPI-673 Validation

Phase 1b of **MPI-672** (issue #2). Implemented 2026-09-01.

## What shipped

| File | Change |
|---|---|
| `routes/shared.js` | `processState.lastDepsWarning` — the reason outlives the `/comfy/start` response |
| `routes/comfy.js` | records it on every spawning start (null on success = a retry clears it); `/comfy/status` spreads `...flags` so **all four** branches carry `depsWarning` |
| `js/state.js` | `comfyDepsWarning` — the announced value, mirrored from status |
| `js/services/comfyController.js` | `DEPS_BROKEN_MESSAGE`; `_noteDepsWarning()` called from the initial status read AND the readiness poll; `runWorkflow` throws `code: 'python_deps_broken'` before dispatch on a degraded LOCAL engine |
| `js/services/commandExecutor.js` | catch branch turning that code into the blocking error dialog |

The MPI-459 invariant is untouched: a failed curated pass still starts the engine.

## Evidence

- `npm test` → **840/840 pass**, including the new `tests/curated-deps-warning.test.cjs`
  (4 tests): `/comfy/status` carries `depsWarning` whichever branch answers; every
  response branch in that handler spreads `...flags` (the missed-branch guard); the
  curated-deps catch contains no `throw`/`res.status(` so the start cannot start
  refusing to boot; the frontend announce-on-change, the local-only gate, and the
  commandExecutor translation are all present.
- `npm run lint` → clean.
- `npx playwright test --config=playwright.desktop.config.js tests/desktop/deps-warning-blocks-generation.spec.js`
  → **passed (2.3s)**. This is the live leg: a real Electron shell, `/comfy/status`
  stubbed to answer exactly what a degraded engine answers, and then
  - `state.comfyDepsWarning` mirrored,
  - `.mpi-error-dialog` present with title **"Engine packages failed to install"**,
  - a second `ensureServerRunning` over the same warning does **not** reopen it,
  - `localEngine.runWorkflow('krea2_t2i_sfw', {})` **rejects with `python_deps_broken`**
    before the workflow is even loaded — the graph never reaches the engine.
- `npm run test:desktop` (full suite) → 37 passed, 4 failed. **The 4 are load flakes,
  not this change**: `audio-permission`, both `flow-clear-slot-advances` tests and
  `flow-reuse-opens-without-model` all timed out at 30s in an 8.3m suite run (the doc's
  budget is ~1.2m) on a box running three agent sessions plus the dev app, and **all 4
  pass in 14.4s when re-run alone**. None of them touch the changed modules.

## Not verified here

The **real** pip failure was not reproduced end to end — the only forcing paths are
deleting `dev_configs/python_deps.txt` (a shared tree: it would break the user's own
engine start) or corrupting the curated-deps marker next to their engine's interpreter
(costs them a full multi-minute pip pass on their next start). What the desktop spec
proves instead is everything downstream of `routes/comfy.js` writing the reason, and
the unit test proves that write and its echo. `D:\tmp\cu126-repro` remains the place
where the broken engine exists on demand — **MPI-674** owns it and will exercise the
real chain when it proves the import-aware detector fires.

## Judgement call left for the user — RESOLVED 2026-09-01

The dialog copy shipped by this card was:

> **Engine packages failed to install**
> Some of the Python packages the local engine needs could not be installed, so several
> of its custom nodes did not load. Generations that use them will fail.
>
> The install is retried every time the engine starts fresh. If it keeps failing, check
> your internet connection or proxy — then use "Show log file" below and send us the log.

It deliberately named no repair button, because a release build had none. **MPI-674
built one, so this text is no longer what ships** — and Fabio, reading the new Settings
row in his own app, called the whole register wrong: *"a user should not be prompted
with model names or anything like that. This is an artist app, not a geek app. We're the
geeks, not them."*

The copy was rewritten on that rule, title and body, at both mirrored sites
(`comfyController.js` and `commandExecutor.js`). Current text, the reasoning, and the
jargon-list guards that keep it that way live in **`tasks/MPI-674/validation.md`** —
MPI-674 owns this copy now. The standing rule is in project memory as
`feedback_no_internal_identifiers_in_user_copy.md`.

Card closed on Fabio's word, 2026-09-01, after he saw the rendered result.
