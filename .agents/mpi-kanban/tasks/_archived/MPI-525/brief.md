# MPI-525 — name the curated pip pass on the startup modal

## Root cause

`ensureCuratedPythonDeps()` runs **inside** `POST /comfy/start`, before the spawn
(`routes/comfy.js` → the MPI-459 placement). The frontend `await fetch('/comfy/start')`
therefore blocks for the whole multi-minute pip pass, and the blocking modal it already
showed says "Starting ComfyUI Engine… / This may take a few moments" the entire time.
Nothing is wrong with the work or its timing — the pass has to run with the engine down,
and that is the only point that survives an upgrade wiping site-packages (MPI-457). The
defect is purely in the **reporting**: a phase with no name reads as a hang.

## Fix

The frontend cannot observe the phase mid-request, so it asks **before** starting:

- `routes/shared.js` — `curatedDepsPending()`, a read-only predicate mirroring the two
  skip/install branches of `ensureCuratedPythonDeps` (no marker → pending, hash mismatch
  → pending, hash match → not pending).
- `routes/comfy.js` — `GET /comfy/deps-pending` → `{ pending }`.
- `js/services/comfyController.js` — when a start is actually about to be issued and the
  modal is not suppressed, read that route and tag `comfy:starting` with
  `phase: 'python-deps'`.
- `js/shell.js` — on that phase, show the modal as
  *"Installing Python packages… / First engine start only — this can take several minutes."*
- `MpiStartingComfy` — `show(phase?)` takes `{ title, text }`; omitting it resets to the
  default copy, so a later plain start cannot inherit the phase label.

Only the first start after a moved pin pays the pass; every later start hash-matches and
skips in milliseconds, so the modal keeps its original copy in the common case.

## Not done (deliberate)

- The auto-restart branch (`needsRestart && status.running`) also POSTs `/comfy/start` and
  could pay the pass after a release moves the pin. It shows **no** modal at all (a
  `ui:info` toast instead), so there is no misleading label there to fix.
- No progress percentage. pip's output is not parsed; the phase name alone answers the
  reported complaint ("reads like it's dead").
